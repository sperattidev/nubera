import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { findActiveBlock, formatClock } from "@nubera/core";
import {
  advertisers,
  agentTokens,
  and,
  asc,
  campaigns,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  plays,
  scheduleBlocks,
  sql,
  stations,
  type Database,
} from "@nubera/db";
import { requireStation } from "./helpers.js";

const params = z.object({ stationId: z.string().uuid() });

/** El motor se considera conectado si consultó a la API en este lapso. */
const ENGINE_ONLINE_WINDOW_MS = 90_000;
const RECENT_LIMIT = 10;
const QUEUED_LIMIT = 3;
const FALLBACK_QUEUE_WINDOW_MS = 10 * 60_000;

interface Options {
  db: Database;
  now: () => Date;
}

export const stationRoutes: FastifyPluginAsync<Options> = async (app, { db, now }) => {
  // Emisoras del cliente del usuario (cualquier rol).
  app.get("/stations", { preHandler: app.authorize() }, async (request) => {
    const items = await db
      .select({ id: stations.id, name: stations.name, slug: stations.slug, timezone: stations.timezone })
      .from(stations)
      .where(eq(stations.tenantId, request.user!.tenantId))
      .orderBy(asc(stations.name));
    return { items };
  });

  // Estado del aire: qué suena, qué viene, qué sonó y si el motor está conectado.
  app.get("/stations/:stationId/on-air", { preHandler: app.authorize("plays:read") }, async (request) => {
    const { stationId } = params.parse(request.params);
    const station = await requireStation(db, stationId, request.user!.tenantId);
    const at = now();

    const columns = {
      id: plays.id,
      title: plays.title,
      artist: plays.artist,
      category: plays.category,
      startedAt: plays.startedAt,
      pickedAt: plays.pickedAt,
      advertiser: advertisers.name,
    };

    const started = await db
      .select(columns)
      .from(plays)
      .leftJoin(campaigns, eq(plays.campaignId, campaigns.id))
      .leftJoin(advertisers, eq(campaigns.advertiserId, advertisers.id))
      .where(and(eq(plays.stationId, stationId), isNotNull(plays.startedAt)))
      .orderBy(desc(plays.startedAt))
      .limit(RECENT_LIMIT + 1);
    const [current = null, ...recent] = started;

    // Lo ya elegido que todavía no empezó a sonar (el motor pide con anticipación).
    const since = current?.startedAt ?? new Date(at.getTime() - FALLBACK_QUEUE_WINDOW_MS);
    const queued = await db
      .select(columns)
      .from(plays)
      .leftJoin(campaigns, eq(plays.campaignId, campaigns.id))
      .leftJoin(advertisers, eq(campaigns.advertiserId, advertisers.id))
      .where(and(eq(plays.stationId, stationId), isNull(plays.startedAt), gte(plays.pickedAt, since)))
      .orderBy(asc(plays.pickedAt))
      .limit(QUEUED_LIMIT);

    const [{ lastSeenAt } = { lastSeenAt: null }] = await db
      .select({ lastSeenAt: sql<Date | null>`max(${agentTokens.lastSeenAt})`.mapWith((value) => (value ? new Date(value) : null)) })
      .from(agentTokens)
      .where(and(eq(agentTokens.stationId, stationId), isNull(agentTokens.revokedAt)));

    const blocks = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.stationId, stationId));
    const block = findActiveBlock(blocks, at, station.timezone);

    return {
      now: at,
      timezone: station.timezone,
      engine: {
        online: lastSeenAt !== null && at.getTime() - lastSeenAt.getTime() <= ENGINE_ONLINE_WINDOW_MS,
        lastSeenAt,
      },
      block: block
        ? {
            id: block.id,
            name: block.name,
            start: formatClock(block.startMinute),
            end: formatClock(block.endMinute),
            rotation: block.rotation,
          }
        : null,
      current,
      queued,
      recent,
    };
  });
};
