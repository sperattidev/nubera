import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { localDate } from "@nubera/core";
import { advertisers, and, certificateLinks, desc, eq, isNull, stations, gt, type Database } from "@nubera/db";
import { hashToken } from "../auth/agent.js";
import { HttpError } from "../errors.js";
import { assertValidRange, loadAdvertiserReport, reportCsv } from "../reports/advertiser-report.js";
import { requireStation } from "./helpers.js";

const TOKEN_PREFIX = "cert_";
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 50;

const advertiserParams = z.object({ advertiserId: z.string().uuid() });
const linkParams = z.object({ linkId: z.string().uuid() });
const tokenParams = z.object({ token: z.string().regex(/^cert_[A-Za-z0-9_-]{43}$/) });
const publicQuery = z.object({ format: z.enum(["json", "csv"]).default("json") });

const createBody = z.object({
  stationId: z.string().uuid(),
  from: z.coerce.date(),
  to: z.coerce.date(),
  /** Cuánto tiempo sirve el enlace; después deja de abrirse aunque no se lo revoque. */
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

interface Options {
  db: Database;
  now: () => Date;
}

/**
 * Enlaces públicos al certificado de emisión de un anunciante: ventas se lo manda al cliente para que
 * lo vea e imprima sin cuenta. El enlace fija emisora y período, vence y se puede revocar. Solo se
 * guarda el hash del token: el valor completo se muestra una única vez, al crearlo.
 */
export const certificateLinkRoutes: FastifyPluginAsync<Options> = async (app, { db, now }) => {
  async function requireAdvertiser(advertiserId: string, tenantId: string) {
    const [advertiser] = await db
      .select({ id: advertisers.id })
      .from(advertisers)
      .where(and(eq(advertisers.id, advertiserId), eq(advertisers.tenantId, tenantId)))
      .limit(1);
    if (!advertiser) {
      throw new HttpError(404, "Anunciante no encontrado");
    }
  }

  // --- Panel (sesión) ---

  app.post("/advertisers/:advertiserId/certificate-links", { preHandler: app.authorize("ads:write") }, async (request, reply) => {
    const { advertiserId } = advertiserParams.parse(request.params);
    const { stationId, from, to, expiresInDays } = createBody.parse(request.body);
    const { tenantId, id: userId } = request.user!;
    assertValidRange(from, to);
    await requireAdvertiser(advertiserId, tenantId);
    await requireStation(db, stationId, tenantId);

    const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
    const expiresAt = new Date(now().getTime() + expiresInDays * DAY_MS);
    const [link] = await db
      .insert(certificateLinks)
      .values({
        tenantId,
        advertiserId,
        stationId,
        tokenHash: hashToken(token),
        periodFrom: from,
        periodTo: to,
        expiresAt,
        createdBy: userId,
      })
      .returning({ id: certificateLinks.id });
    return reply.code(201).send({ id: link!.id, token, path: `/certificado/${token}`, expiresAt });
  });

  app.get("/advertisers/:advertiserId/certificate-links", { preHandler: app.authorize("ads:read") }, async (request) => {
    const { advertiserId } = advertiserParams.parse(request.params);
    await requireAdvertiser(advertiserId, request.user!.tenantId);
    const items = await db
      .select({
        id: certificateLinks.id,
        stationId: certificateLinks.stationId,
        from: certificateLinks.periodFrom,
        to: certificateLinks.periodTo,
        expiresAt: certificateLinks.expiresAt,
        revokedAt: certificateLinks.revokedAt,
        createdAt: certificateLinks.createdAt,
      })
      .from(certificateLinks)
      .where(and(eq(certificateLinks.advertiserId, advertiserId), eq(certificateLinks.tenantId, request.user!.tenantId)))
      .orderBy(desc(certificateLinks.createdAt))
      .limit(LIST_LIMIT);
    return { items };
  });

  // Revoca el enlace: deja de abrirse de inmediato. Es idempotente.
  app.delete("/certificate-links/:linkId", { preHandler: app.authorize("ads:write") }, async (request, reply) => {
    const { linkId } = linkParams.parse(request.params);
    const [link] = await db
      .select({ id: certificateLinks.id })
      .from(certificateLinks)
      .where(and(eq(certificateLinks.id, linkId), eq(certificateLinks.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!link) {
      throw new HttpError(404, "Enlace no encontrado");
    }
    await db
      .update(certificateLinks)
      .set({ revokedAt: now() })
      .where(and(eq(certificateLinks.id, linkId), isNull(certificateLinks.revokedAt)));
    return reply.code(204).send();
  });

  // --- Público (sin sesión; la posesión del token es la credencial) ---

  app.get(
    "/public/certificates/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { token } = tokenParams.parse(request.params);
      const { format } = publicQuery.parse(request.query);
      const at = now();

      // Vencido, revocado o inexistente se informan igual, para no dar pistas sobre enlaces ajenos.
      const [link] = await db
        .select({
          tenantId: certificateLinks.tenantId,
          advertiserId: certificateLinks.advertiserId,
          stationId: certificateLinks.stationId,
          from: certificateLinks.periodFrom,
          to: certificateLinks.periodTo,
          expiresAt: certificateLinks.expiresAt,
          stationName: stations.name,
          timezone: stations.timezone,
        })
        .from(certificateLinks)
        .innerJoin(stations, eq(certificateLinks.stationId, stations.id))
        .where(and(eq(certificateLinks.tokenHash, hashToken(token)), isNull(certificateLinks.revokedAt), gt(certificateLinks.expiresAt, at)))
        .limit(1);
      if (!link) {
        throw new HttpError(404, "Este certificado no está disponible");
      }
      const report = await loadAdvertiserReport(db, {
        advertiserId: link.advertiserId,
        tenantId: link.tenantId,
        stationId: link.stationId,
        from: link.from,
        to: link.to,
      });
      if (!report) {
        throw new HttpError(404, "Este certificado no está disponible");
      }

      reply.header("cache-control", "private, no-store").header("x-robots-tag", "noindex, nofollow");
      if (format === "csv") {
        const { filename, body } = reportCsv(report, link.from, link.to);
        return reply
          .header("content-type", "text/csv; charset=utf-8")
          .header("content-disposition", `attachment; filename="${filename}"`)
          .send(body);
      }

      return {
        advertiser: { name: report.advertiser.name },
        station: { name: link.stationName, timezone: link.timezone },
        from: link.from,
        to: link.to,
        total: report.items.length,
        truncated: report.truncated,
        perDay: report.perDay,
        perCampaign: report.perCampaign.map(({ name, count }) => ({ name, count })),
        items: report.items.map(({ startedAt, localTime, campaign, spot }) => ({ startedAt, localTime, campaign, spot })),
        expiresAt: link.expiresAt,
        generatedOn: localDate(at, link.timezone),
      };
    },
  );
};
