import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  and,
  assetCategories,
  assets,
  campaignAssets,
  count,
  desc,
  eq,
  ilike,
  or,
  type Database,
} from "@nubera/db";
import { HttpError } from "../errors.js";
import type { MediaStorage } from "../storage.js";
import { requireStation } from "./helpers.js";

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
  /** Busca en título y artista, sin distinguir mayúsculas. */
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// En el PATCH, `artist` vacío o null borra el dato; omitirlo lo deja como está.
const updateBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    artist: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((value) => (value === undefined ? undefined : value || null)),
    category: z.enum(assetCategories).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "No hay nada para modificar",
  });

/** Interpreta `Range: bytes=a-b` (un solo tramo). Devuelve null si es inválido. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }
  let start: number;
  let end: number;
  if (match[1] === "") {
    // "bytes=-N": los últimos N bytes.
    start = Math.max(size - Number(match[2]), 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

/** Escapa % y _ para que se busquen como texto literal en un ILIKE. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

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
  app.get("/stations/:stationId/assets", { preHandler: app.authorize("assets:read") }, async (request) => {
    const { stationId } = stationParams.parse(request.params);
    const { category, q, limit, offset } = listQuery.parse(request.query);
    await requireStation(db, stationId, request.user!.tenantId);

    const filters = [eq(assets.stationId, stationId)];
    if (category) {
      filters.push(eq(assets.category, category));
    }
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      filters.push(or(ilike(assets.title, pattern), ilike(assets.artist, pattern))!);
    }
    const filter = and(...filters);

    const items = await db
      .select()
      .from(assets)
      .where(filter)
      .orderBy(desc(assets.createdAt), desc(assets.id))
      .limit(limit)
      .offset(offset);
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(assets).where(filter);
    return { items, total, limit, offset };
  });

  app.get("/stations/:stationId/assets/:assetId", { preHandler: app.authorize("assets:read") }, async (request) => {
    const { stationId, assetId } = assetParams.parse(request.params);
    await requireStation(db, stationId, request.user!.tenantId);
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

  async function findAsset(stationId: string, assetId: string, tenantId: string) {
    await requireStation(db, stationId, tenantId);
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.stationId, stationId)))
      .limit(1);
    if (!asset) {
      throw new HttpError(404, "Audio no encontrado");
    }
    return asset;
  }

  // Escucha del audio en el navegador. Admite `Range` para poder adelantar y retroceder.
  app.get(
    "/stations/:stationId/assets/:assetId/audio",
    { preHandler: app.authorize("assets:read") },
    async (request, reply) => {
      const { stationId, assetId } = assetParams.parse(request.params);
      const asset = await findAsset(stationId, assetId, request.user!.tenantId);

      const whole = await storage.open(asset.storageKey);
      if (!whole) {
        throw new HttpError(404, "El archivo de audio no está disponible");
      }
      const rangeHeader = request.headers.range;
      const range = rangeHeader ? parseRange(rangeHeader, whole.size) : null;

      reply
        .header("content-type", asset.mimeType)
        .header("accept-ranges", "bytes")
        .header("cache-control", "private, max-age=3600")
        .header("x-content-type-options", "nosniff");

      if (rangeHeader && !range) {
        whole.stream.destroy();
        return reply.code(416).header("content-range", `bytes */${whole.size}`).send();
      }
      if (!range) {
        return reply.header("content-length", whole.size).send(whole.stream);
      }
      whole.stream.destroy();
      const part = await storage.open(asset.storageKey, range);
      if (!part) {
        throw new HttpError(404, "El archivo de audio no está disponible");
      }
      return reply
        .code(206)
        .header("content-range", `bytes ${range.start}-${range.end}/${part.size}`)
        .header("content-length", range.end - range.start + 1)
        .send(part.stream);
    },
  );

  app.patch("/stations/:stationId/assets/:assetId", { preHandler: app.authorize("assets:write") }, async (request) => {
    const { stationId, assetId } = assetParams.parse(request.params);
    const body = updateBody.parse(request.body);
    const asset = await findAsset(stationId, assetId, request.user!.tenantId);

    // Un aviso que forma parte de una campaña no puede dejar de ser categoría "ad".
    if (body.category && body.category !== "ad" && asset.category === "ad") {
      const [{ linked } = { linked: 0 }] = await db
        .select({ linked: count() })
        .from(campaignAssets)
        .where(eq(campaignAssets.assetId, assetId));
      if (linked > 0) {
        throw new HttpError(409, "El audio es parte de una campaña: quitalo de la campaña antes de cambiar su categoría");
      }
    }

    const [updated] = await db.update(assets).set(body).where(eq(assets.id, assetId)).returning();
    return updated;
  });

  // Borra el audio; las emisiones pasadas conservan su copia de título y artista.
  app.delete("/stations/:stationId/assets/:assetId", { preHandler: app.authorize("assets:write") }, async (request, reply) => {
    const { stationId, assetId } = assetParams.parse(request.params);
    const asset = await findAsset(stationId, assetId, request.user!.tenantId);
    await db.delete(assets).where(eq(assets.id, assetId));

    // El archivo se comparte por contenido: solo se borra si nadie más lo usa.
    const [{ shared } = { shared: 0 }] = await db
      .select({ shared: count() })
      .from(assets)
      .where(eq(assets.storageKey, asset.storageKey));
    if (shared === 0) {
      await storage.remove(asset.storageKey);
    }
    return reply.code(204).send();
  });

  // Los campos de texto (title, artist, category) deben enviarse antes del archivo.
  app.post("/stations/:stationId/assets", { preHandler: app.authorize("assets:write") }, async (request, reply) => {
    const { stationId } = stationParams.parse(request.params);
    if (!request.isMultipart()) {
      throw new HttpError(415, "Se esperaba multipart/form-data");
    }
    await requireStation(db, stationId, request.user!.tenantId);

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
