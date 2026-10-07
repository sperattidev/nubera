import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { findActiveBlock } from "@nubera/core";
import { and, desc, eq, inArray, isNotNull, plays, scheduleBlocks, stations, type Database } from "@nubera/db";
import { HttpError } from "../errors.js";

const params = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80) });

/** Solo la música y lo "otro" se muestran como tema; el resto (avisos, separadores) no se anuncia. */
const LISTED_CATEGORIES = ["music", "other"] as const;
const RECENT_LIMIT = 8;
/** Si lo último que sonó empezó hace más que esto, el motor no está emitiendo y no se anuncia nada. */
const STALE_AFTER_MS = 20 * 60_000;

export interface PublicStation {
  name: string;
  slug: string;
  /** Dirección del flujo de audio; null si la plataforma todavía no la tiene configurada. */
  streamUrl: string | null;
  nowPlaying: { title: string; artist: string | null; startedAt: Date } | null;
  /** Programa en vivo en este momento (su nombre), o null si suena la automatización. */
  live: { program: string } | null;
  recent: { title: string; artist: string | null; startedAt: Date }[];
}

interface Options {
  db: Database;
  now: () => Date;
  streamUrl: string | null;
  /** Segundos que se reutiliza una respuesta; acota la carga sobre la base aunque haya muchos oyentes. */
  cacheSeconds: number;
}

/**
 * Datos de una emisora para su página pública, sin sesión. Solo expone lo que ve cualquier
 * oyente: nombre, flujo de audio, qué suena y lo último que sonó. Nunca avisos ni campañas.
 */
export const publicRoutes: FastifyPluginAsync<Options> = async (app, { db, now, streamUrl, cacheSeconds }) => {
  const cache = new Map<string, { expiresAt: number; body: PublicStation }>();

  app.get("/public/stations/:slug", async (request, reply) => {
    const { slug } = params.parse(request.params);
    const at = now();

    let body = cache.get(slug);
    if (!body || body.expiresAt <= at.getTime()) {
      cache.delete(slug);
      const [station] = await db
        .select({ id: stations.id, name: stations.name, timezone: stations.timezone })
        .from(stations)
        .where(eq(stations.slug, slug))
        .limit(1);
      if (!station) {
        throw new HttpError(404, "Emisora no encontrada");
      }

      const [latest] = await db
        .select({ title: plays.title, artist: plays.artist, category: plays.category, startedAt: plays.startedAt })
        .from(plays)
        .where(and(eq(plays.stationId, station.id), isNotNull(plays.startedAt)))
        .orderBy(desc(plays.startedAt))
        .limit(1);
      const recent = await db
        .select({ title: plays.title, artist: plays.artist, startedAt: plays.startedAt })
        .from(plays)
        .where(and(eq(plays.stationId, station.id), isNotNull(plays.startedAt), inArray(plays.category, [...LISTED_CATEGORIES])))
        .orderBy(desc(plays.startedAt))
        .limit(RECENT_LIMIT + 1);

      const blocks = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.stationId, station.id));
      const block = findActiveBlock(blocks, at, station.timezone);
      const program = block?.mode === "live" ? { program: block.name } : null;

      const live = latest?.startedAt && at.getTime() - latest.startedAt.getTime() <= STALE_AFTER_MS ? latest : null;
      // Durante un corte (aviso, separador) se muestra el nombre de la emisora, no el del aviso.
      const isListed = live ? (LISTED_CATEGORIES as readonly string[]).includes(live.category) : false;
      const nowPlaying = live
        ? { title: isListed ? live.title : station.name, artist: isListed ? live.artist : null, startedAt: live.startedAt! }
        : null;
      // Lo que suena ahora no se repite en "sonó antes".
      const earlier = (isListed ? recent.slice(1) : recent).slice(0, RECENT_LIMIT);

      const response: PublicStation = {
        name: station.name,
        slug,
        streamUrl,
        // En un programa en vivo no hay tema que anunciar: se muestra el programa.
        nowPlaying: program ? null : nowPlaying,
        live: program,
        recent: earlier.map((play) => ({ title: play.title, artist: play.artist, startedAt: play.startedAt! })),
      };
      body = { expiresAt: at.getTime() + cacheSeconds * 1000, body: response };
      if (cacheSeconds > 0) {
        cache.set(slug, body);
      }
    }

    reply.header("Cache-Control", `public, max-age=${Math.min(cacheSeconds, 5)}`);
    return body.body;
  });
};
