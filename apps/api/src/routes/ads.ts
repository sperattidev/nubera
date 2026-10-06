import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseClock, formatClock } from "@nubera/core";
import {
  advertisers,
  and,
  asc,
  assets,
  campaignAssets,
  campaigns,
  eq,
  inArray,
  type Advertiser,
  type Database,
} from "@nubera/db";
import { emailSchema } from "../auth/schemas.js";
import { HttpError } from "../errors.js";
import { requireStation } from "./helpers.js";

const idParams = z.object({ advertiserId: z.string().uuid() });
const stationParams = z.object({ stationId: z.string().uuid() });
const campaignParams = stationParams.extend({ campaignId: z.string().uuid() });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const advertiserBody = z.object({
  name: z.string().trim().min(1).max(120),
  industry: optionalText(80),
  contactName: optionalText(120),
  contactEmail: z
    .union([emailSchema, z.literal("")])
    .optional()
    .transform((value) => (value ? value : null)),
  contactPhone: optionalText(40),
  notes: optionalText(1000),
  isActive: z.boolean().default(true),
});

const clock = z
  .string()
  .refine((value) => parseClock(value) !== null, { message: "Formato HH:MM (00:00 a 24:00)" })
  .transform((value) => parseClock(value)!);

const campaignBody = z
  .object({
    advertiserId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    dailyPlays: z.number().int().min(1).max(1000).nullish().transform((value) => value ?? null),
    weight: z.number().int().min(1).max(100).default(1),
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .default([1, 2, 3, 4, 5, 6, 7])
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    // El valor por defecto va en minutos (ya transformado): 00:00 y 24:00.
    start: clock.default(0),
    end: clock.default(1440),
    assetIds: z
      .array(z.string().uuid())
      .min(1)
      .max(20)
      .transform((ids) => [...new Set(ids)]),
    isActive: z.boolean().default(true),
  })
  .refine((campaign) => campaign.endsOn >= campaign.startsOn, {
    message: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endsOn"],
  })
  .refine((campaign) => campaign.end > campaign.start, {
    message: "El fin de la franja debe ser posterior al inicio",
    path: ["end"],
  });

const campaignListQuery = z.object({
  advertiserId: z.string().uuid().optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

interface Options {
  db: Database;
}

export const adRoutes: FastifyPluginAsync<Options> = async (app, { db }) => {
  const read = { preHandler: app.authorize("ads:read") };
  const write = { preHandler: app.authorize("ads:write") };

  async function requireAdvertiser(advertiserId: string, tenantId: string): Promise<Advertiser> {
    const [advertiser] = await db
      .select()
      .from(advertisers)
      .where(and(eq(advertisers.id, advertiserId), eq(advertisers.tenantId, tenantId)))
      .limit(1);
    if (!advertiser) {
      throw new HttpError(404, "Anunciante no encontrado");
    }
    return advertiser;
  }

  function isUniqueViolation(error: unknown): boolean {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    return code === "23505";
  }

  // --- Anunciantes ---

  app.get("/advertisers", read, async (request) => {
    const items = await db
      .select()
      .from(advertisers)
      .where(eq(advertisers.tenantId, request.user!.tenantId))
      .orderBy(asc(advertisers.name));
    return { items };
  });

  app.get("/advertisers/:advertiserId", read, async (request) => {
    const { advertiserId } = idParams.parse(request.params);
    return requireAdvertiser(advertiserId, request.user!.tenantId);
  });

  app.post("/advertisers", write, async (request, reply) => {
    const body = advertiserBody.parse(request.body);
    try {
      const [created] = await db
        .insert(advertisers)
        .values({ ...body, tenantId: request.user!.tenantId })
        .returning();
      return reply.code(201).send(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "Ya existe un anunciante con ese nombre");
      }
      throw error;
    }
  });

  app.put("/advertisers/:advertiserId", write, async (request) => {
    const { advertiserId } = idParams.parse(request.params);
    const body = advertiserBody.parse(request.body);
    await requireAdvertiser(advertiserId, request.user!.tenantId);
    try {
      const [updated] = await db.update(advertisers).set(body).where(eq(advertisers.id, advertiserId)).returning();
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "Ya existe un anunciante con ese nombre");
      }
      throw error;
    }
  });

  // Borra también sus campañas; las emisiones pasadas se conservan en el historial.
  app.delete("/advertisers/:advertiserId", write, async (request, reply) => {
    const { advertiserId } = idParams.parse(request.params);
    await requireAdvertiser(advertiserId, request.user!.tenantId);
    await db.delete(advertisers).where(eq(advertisers.id, advertiserId));
    return reply.code(204).send();
  });

  // --- Campañas ---

  async function serializeCampaigns(rows: (typeof campaigns.$inferSelect & { advertiserName: string })[]) {
    const links = rows.length
      ? await db
          .select({ campaignId: campaignAssets.campaignId, id: assets.id, title: assets.title })
          .from(campaignAssets)
          .innerJoin(assets, eq(campaignAssets.assetId, assets.id))
          .where(inArray(campaignAssets.campaignId, rows.map((row) => row.id)))
      : [];
    return rows.map((row) => ({
      id: row.id,
      advertiserId: row.advertiserId,
      advertiserName: row.advertiserName,
      name: row.name,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      dailyPlays: row.dailyPlays,
      weight: row.weight,
      days: row.days,
      start: formatClock(row.startMinute),
      end: formatClock(row.endMinute),
      isActive: row.isActive,
      assets: links.filter((link) => link.campaignId === row.id).map(({ id, title }) => ({ id, title })),
    }));
  }

  // Los avisos deben ser audios de categoría "ad" de la misma emisora.
  async function validateAssets(stationId: string, assetIds: string[]) {
    const found = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.stationId, stationId), eq(assets.category, "ad"), inArray(assets.id, assetIds)));
    if (found.length !== assetIds.length) {
      throw new HttpError(422, "Los avisos deben ser audios de categoría ad de esta emisora");
    }
  }

  async function loadCampaign(stationId: string, campaignId: string) {
    const [row] = await db
      .select({ campaign: campaigns, advertiserName: advertisers.name })
      .from(campaigns)
      .innerJoin(advertisers, eq(campaigns.advertiserId, advertisers.id))
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.stationId, stationId)))
      .limit(1);
    if (!row) {
      throw new HttpError(404, "Campaña no encontrada");
    }
    return (await serializeCampaigns([{ ...row.campaign, advertiserName: row.advertiserName }]))[0]!;
  }

  app.get("/stations/:stationId/campaigns", read, async (request) => {
    const { stationId } = stationParams.parse(request.params);
    const { advertiserId, active } = campaignListQuery.parse(request.query);
    await requireStation(db, stationId, request.user!.tenantId);

    const filters = [eq(campaigns.stationId, stationId)];
    if (advertiserId) {
      filters.push(eq(campaigns.advertiserId, advertiserId));
    }
    if (active !== undefined) {
      filters.push(eq(campaigns.isActive, active));
    }
    const rows = await db
      .select({ campaign: campaigns, advertiserName: advertisers.name })
      .from(campaigns)
      .innerJoin(advertisers, eq(campaigns.advertiserId, advertisers.id))
      .where(and(...filters))
      .orderBy(asc(campaigns.startsOn), asc(campaigns.name));
    return { items: await serializeCampaigns(rows.map((row) => ({ ...row.campaign, advertiserName: row.advertiserName }))) };
  });

  app.get("/stations/:stationId/campaigns/:campaignId", read, async (request) => {
    const { stationId, campaignId } = campaignParams.parse(request.params);
    await requireStation(db, stationId, request.user!.tenantId);
    return loadCampaign(stationId, campaignId);
  });

  app.post("/stations/:stationId/campaigns", write, async (request, reply) => {
    const { stationId } = stationParams.parse(request.params);
    const body = campaignBody.parse(request.body);
    const tenantId = request.user!.tenantId;
    await requireStation(db, stationId, tenantId);
    await requireAdvertiser(body.advertiserId, tenantId);
    await validateAssets(stationId, body.assetIds);

    const created = await db.transaction(async (tx) => {
      const [campaign] = await tx
        .insert(campaigns)
        .values({
          stationId,
          advertiserId: body.advertiserId,
          name: body.name,
          startsOn: body.startsOn,
          endsOn: body.endsOn,
          dailyPlays: body.dailyPlays,
          weight: body.weight,
          days: body.days,
          startMinute: body.start,
          endMinute: body.end,
          isActive: body.isActive,
        })
        .returning({ id: campaigns.id });
      await tx.insert(campaignAssets).values(body.assetIds.map((assetId) => ({ campaignId: campaign!.id, assetId })));
      return campaign!;
    });
    return reply.code(201).send(await loadCampaign(stationId, created.id));
  });

  app.put("/stations/:stationId/campaigns/:campaignId", write, async (request) => {
    const { stationId, campaignId } = campaignParams.parse(request.params);
    const body = campaignBody.parse(request.body);
    const tenantId = request.user!.tenantId;
    await requireStation(db, stationId, tenantId);
    await loadCampaign(stationId, campaignId);
    await requireAdvertiser(body.advertiserId, tenantId);
    await validateAssets(stationId, body.assetIds);

    await db.transaction(async (tx) => {
      await tx
        .update(campaigns)
        .set({
          advertiserId: body.advertiserId,
          name: body.name,
          startsOn: body.startsOn,
          endsOn: body.endsOn,
          dailyPlays: body.dailyPlays,
          weight: body.weight,
          days: body.days,
          startMinute: body.start,
          endMinute: body.end,
          isActive: body.isActive,
        })
        .where(eq(campaigns.id, campaignId));
      await tx.delete(campaignAssets).where(eq(campaignAssets.campaignId, campaignId));
      await tx.insert(campaignAssets).values(body.assetIds.map((assetId) => ({ campaignId, assetId })));
    });
    return loadCampaign(stationId, campaignId);
  });

  app.delete("/stations/:stationId/campaigns/:campaignId", write, async (request, reply) => {
    const { stationId, campaignId } = campaignParams.parse(request.params);
    await requireStation(db, stationId, request.user!.tenantId);
    await loadCampaign(stationId, campaignId);
    await db.delete(campaigns).where(eq(campaigns.id, campaignId));
    return reply.code(204).send();
  });
};
