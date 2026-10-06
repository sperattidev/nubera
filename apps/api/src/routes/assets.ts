import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  and,
  assetCategories,
  assets,
  desc,
  eq,
  stations,
  type Database,
} from "@nubera/db";
import { HttpError } from "../errors.js";
import type { MediaStorage } from "../storage.js";

// El tipo MIME se deriva de la extensión validada, no del valor que envía el cliente.
const MIME_BY_EXTENSION = new Map([
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".flac", "audio/flac"],
  [".ogg", "audio/ogg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
]);

const stationParams = z.object({ stationId: z.string().uuid() });
const assetParams = stationParams.extend({ assetId: z.string().uuid() });

const listQuery = z.object({
  category: z.enum(assetCategories).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const uploadFields = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().min(1).max(200).optional(),
  category: z.enum(assetCategories).default("music"),
});

interface Options {
  db: Database;
  storage: MediaStorage;
}

export const assetRoutes: FastifyPluginAsync<Options> = async (app, { db, storage }) => {
  // Una emisora de otro cliente se informa como inexistente (no revela su existencia).
  async function requireStation(stationId: string, tenantId: string) {
    const [station] = await db
      .select({ id: stations.id })
      .from(stations)
      .where(and(eq(stations.id, stationId), eq(stations.tenantId, tenantId)))
      .limit(1);
    if (!station) {
      throw new HttpError(404, "Emisora no encontrada");
    }
  }

  app.get("/stations/:stationId/assets", { preHandler: app.authorize("assets:read") }, async (request) => {
    const { stationId } = stationParams.parse(request.params);
    const { category, limit, offset } = listQuery.parse(request.query);
    await requireStation(stationId, request.user!.tenantId);

    const filter = category
      ? and(eq(assets.stationId, stationId), eq(assets.category, category))
      : eq(assets.stationId, stationId);
    const items = await db
      .select()
      .from(assets)
      .where(filter)
      .orderBy(desc(assets.createdAt))
      .limit(limit)
      .offset(offset);
    return { items, limit, offset };
  });

  app.get("/stations/:stationId/assets/:assetId", { preHandler: app.authorize("assets:read") }, async (request) => {
    const { stationId, assetId } = assetParams.parse(request.params);
    await requireStation(stationId, request.user!.tenantId);
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.stationId, stationId)))
      .limit(1);
    if (!asset) {
      throw new HttpError(404, "Audio no encontrado");
    }
    return asset;
  });

  // Los campos de texto (title, artist, category) deben enviarse antes del archivo.
  app.post("/stations/:stationId/assets", { preHandler: app.authorize("assets:write") }, async (request, reply) => {
    const { stationId } = stationParams.parse(request.params);
    if (!request.isMultipart()) {
      throw new HttpError(415, "Se esperaba multipart/form-data");
    }
    await requireStation(stationId, request.user!.tenantId);

    const fields: Record<string, string> = {};
    let stored: Awaited<ReturnType<MediaStorage["save"]>> | undefined;
    let mimeType = "";
    let title = "";
    let artist: string | undefined;
    let category: (typeof assetCategories)[number] = "music";
    let rejection: HttpError | undefined;

    for await (const part of request.parts()) {
      if (part.type === "field") {
        if (typeof part.value === "string") {
          fields[part.fieldname] = part.value;
        }
        continue;
      }

      if (stored || rejection) {
        part.file.resume();
        continue;
      }

      const extension = path.extname(part.filename).toLowerCase();
      const detectedMime = MIME_BY_EXTENSION.get(extension);
      if (!detectedMime) {
        rejection = new HttpError(415, "Formato de audio no soportado");
        part.file.resume();
        continue;
      }
      const parsed = uploadFields.safeParse(fields);
      if (!parsed.success) {
        rejection = new HttpError(400, "Campos inválidos: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
        part.file.resume();
        continue;
      }

      title = parsed.data.title ?? path.basename(part.filename, extension);
      artist = parsed.data.artist;
      category = parsed.data.category;
      mimeType = detectedMime;
      stored = await storage.save(part.file, extension);
    }

    if (rejection) {
      throw rejection;
    }
    if (!stored) {
      throw new HttpError(400, "Falta el archivo de audio");
    }

    const [duplicate] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.stationId, stationId), eq(assets.sha256, stored.sha256)))
      .limit(1);
    if (duplicate) {
      throw new HttpError(409, "Ese audio ya existe en la biblioteca");
    }

    const [created] = await db
      .insert(assets)
      .values({
        stationId,
        title,
        artist,
        category,
        mimeType,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        storageKey: stored.key,
      })
      .returning();
    return reply.code(201).send(created);
  });
};
