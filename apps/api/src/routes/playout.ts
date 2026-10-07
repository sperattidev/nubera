import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { findActiveBlock } from "@nubera/core";
import { and, assets, desc, eq, gte, isNotNull, isNull, lt, plays, scheduleBlocks, stations, type Database } from "@nubera/db";
import { HttpError } from "../errors.js";
import { pickForStation } from "../playout/service.js";
import type { MediaStorage } from "../storage.js";
import { requireStation } from "./helpers.js";

const playParams = z.object({ playId: z.string().uuid() });
const stationParams = z.object({ stationId: z.string().uuid() });
const historyQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

interface Options {
  db: Database;
  storage: MediaStorage;
  now: () => Date;
  random?: () => number;
}

export const playoutRoutes: FastifyPluginAsync<Options> = async (app, { db, storage, now, random }) => {
  // --- Motor de audio (token de agente) ---

  // Próximo audio a emitir; 204 si no hay nada programado (el motor usa su respaldo local).
  app.get("/playout/next", { preHandler: app.authorizeAgent() }, async (request, reply) => {
    const next = await pickForStation(db, request.agent!.stationId, now(), random);
    return next ? next : reply.code(204).send();
  });

  // Modo de la emisora ahora. En un programa en vivo el motor silencia su salida y la consola se hace cargo.
  // Consultarlo también sirve de señal de vida: el panel lo muestra como motor conectado.
  app.get("/playout/mode", { preHandler: app.authorizeAgent() }, async (request) => {
    const stationId = request.agent!.stationId;
    const [station] = await db.select({ timezone: stations.timezone }).from(stations).where(eq(stations.id, stationId)).limit(1);
    const blocks = station ? await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.stationId, stationId)) : [];
    const block = station ? findActiveBlock(blocks, now(), station.timezone) : null;
    return block?.mode === "live" ? { mode: "live" as const, program: block.name } : { mode: "auto" as const, program: null };
  });

  // El motor del estudio descarga el audio de una emisión para guardarlo en su caché local. Solo sirve
  // audios de emisiones de la propia emisora del token.
  app.get("/playout/plays/:playId/audio", { preHandler: app.authorizeAgent() }, async (request, reply) => {
    const { playId } = playParams.parse(request.params);
    const [row] = await db
      .select({ storageKey: assets.storageKey, mimeType: assets.mimeType })
      .from(plays)
      .innerJoin(assets, eq(plays.assetId, assets.id))
      .where(and(eq(plays.id, playId), eq(plays.stationId, request.agent!.stationId)))
      .limit(1);
    const file = row ? await storage.open(row.storageKey) : null;
    if (!row || !file) {
      throw new HttpError(404, "Audio no disponible");
    }
    return reply
      .header("content-type", row.mimeType)
      .header("content-length", file.size)
      .header("cache-control", "private, max-age=3600")
      .header("x-content-type-options", "nosniff")
      .send(file.stream);
  });

  // El motor confirma que el audio empezó a sonar. Es idempotente.
  app.post("/playout/plays/:playId/started", { preHandler: app.authorizeAgent() }, async (request, reply) => {
    const { playId } = playParams.parse(request.params);
    const stationId = request.agent!.stationId;
    const updated = await db
      .update(plays)
      .set({ startedAt: now() })
      .where(and(eq(plays.id, playId), eq(plays.stationId, stationId), isNull(plays.startedAt)))
      .returning({ id: plays.id });
    if (updated.length === 0) {
      const [existing] = await db
        .select({ id: plays.id })
        .from(plays)
        .where(and(eq(plays.id, playId), eq(plays.stationId, stationId)))
        .limit(1);
      if (!existing) {
        throw new HttpError(404, "Emisión no encontrada");
      }
    }
    return reply.code(204).send();
  });

  // --- Panel (sesión) ---

  // Registro de lo emitido (as-run): solo audios que efectivamente empezaron a sonar.
  app.get("/stations/:stationId/plays", { preHandler: app.authorize("plays:read") }, async (request) => {
    const { stationId } = stationParams.parse(request.params);
    const { from, to, limit } = historyQuery.parse(request.query);
    await requireStation(db, stationId, request.user!.tenantId);

    const filters = [eq(plays.stationId, stationId), isNotNull(plays.startedAt)];
    if (from) {
      filters.push(gte(plays.startedAt, from));
    }
    if (to) {
      filters.push(lt(plays.startedAt, to));
    }
    const items = await db
      .select({
        id: plays.id,
        title: plays.title,
        artist: plays.artist,
        category: plays.category,
        blockId: plays.blockId,
        startedAt: plays.startedAt,
      })
      .from(plays)
      .where(and(...filters))
      .orderBy(desc(plays.startedAt))
      .limit(limit);
    return { items, limit };
  });
};
