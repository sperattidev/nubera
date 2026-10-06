import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { formatLocal, localDate } from "@nubera/core";
import {
  advertisers,
  and,
  asc,
  campaigns,
  eq,
  gte,
  isNotNull,
  lt,
  plays,
  stations,
  type Database,
} from "@nubera/db";
import { HttpError } from "../errors.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const MAX_ROWS = 10_000;

const params = z.object({ advertiserId: z.string().uuid() });
const query = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  stationId: z.string().uuid().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

/** Escapa una celda CSV y neutraliza fórmulas (=, +, -, @) que un programa de planillas ejecutaría. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function fileSlug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "anunciante"
  );
}

interface Options {
  db: Database;
  now: () => Date;
}

export const reportRoutes: FastifyPluginAsync<Options> = async (app, { db, now }) => {
  // Certificado de emisión (as-run): cada aviso del anunciante que efectivamente salió al aire.
  app.get("/advertisers/:advertiserId/report", { preHandler: app.authorize("ads:read") }, async (request, reply) => {
    const { advertiserId } = params.parse(request.params);
    const { from: fromParam, to: toParam, stationId, format } = query.parse(request.query);

    const to = toParam ?? now();
    const from = fromParam ?? new Date(to.getTime() - 30 * DAY_MS);
    if (from >= to) {
      throw new HttpError(400, "El inicio del período debe ser anterior al fin");
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new HttpError(400, `El período no puede superar ${MAX_RANGE_DAYS} días`);
    }

    const [advertiser] = await db
      .select({ id: advertisers.id, name: advertisers.name })
      .from(advertisers)
      .where(and(eq(advertisers.id, advertiserId), eq(advertisers.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!advertiser) {
      throw new HttpError(404, "Anunciante no encontrado");
    }

    const filters = [
      eq(campaigns.advertiserId, advertiserId),
      isNotNull(plays.startedAt),
      gte(plays.startedAt, from),
      lt(plays.startedAt, to),
    ];
    if (stationId) {
      filters.push(eq(plays.stationId, stationId));
    }
    const rows = await db
      .select({
        startedAt: plays.startedAt,
        station: stations.name,
        timezone: stations.timezone,
        campaignId: campaigns.id,
        campaign: campaigns.name,
        spot: plays.title,
      })
      .from(plays)
      .innerJoin(campaigns, eq(plays.campaignId, campaigns.id))
      .innerJoin(stations, eq(plays.stationId, stations.id))
      .where(and(...filters))
      .orderBy(asc(plays.startedAt))
      .limit(MAX_ROWS + 1);

    const truncated = rows.length > MAX_ROWS;
    const items = rows.slice(0, MAX_ROWS).map((row) => ({
      startedAt: row.startedAt!,
      localTime: formatLocal(row.startedAt!, row.timezone),
      station: row.station,
      campaign: row.campaign,
      campaignId: row.campaignId,
      spot: row.spot,
      date: localDate(row.startedAt!, row.timezone),
    }));

    if (format === "csv") {
      const lines = [
        ["fecha_hora_local", "emisora", "campana", "aviso"].join(","),
        ...items.map((item) => [item.localTime, item.station, item.campaign, item.spot].map(csvCell).join(",")),
      ];
      const name = `certificado-${fileSlug(advertiser.name)}-${localDate(from, "UTC")}_${localDate(to, "UTC")}.csv`;
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${name}"`)
        .send(`﻿${lines.join("\r\n")}\r\n`);
    }

    const perDay = new Map<string, number>();
    const perCampaign = new Map<string, { campaignId: string; name: string; count: number }>();
    for (const item of items) {
      perDay.set(item.date, (perDay.get(item.date) ?? 0) + 1);
      const entry = perCampaign.get(item.campaignId) ?? { campaignId: item.campaignId, name: item.campaign, count: 0 };
      entry.count += 1;
      perCampaign.set(item.campaignId, entry);
    }

    return {
      advertiser,
      from,
      to,
      total: items.length,
      truncated,
      perDay: [...perDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, count: total })),
      perCampaign: [...perCampaign.values()],
      items: items.map(({ date: _date, ...item }) => item),
    };
  });
};
