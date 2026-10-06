import { randomUUID } from "node:crypto";
import {
  advertisers,
  agentTokens,
  assets,
  campaignAssets,
  campaigns,
  scheduleBlocks,
  type Database,
} from "@nubera/db";
import { rotationSchema } from "@nubera/core";
import { generateAgentToken } from "../auth/agent.js";

/** Inserta un audio directamente en la base (sin pasar por la subida). */
export async function addAsset(
  db: Database,
  stationId: string,
  data: { title: string; artist?: string | null; category?: "music" | "jingle" | "ad" | "other" },
) {
  const sha256 = randomUUID().replaceAll("-", "").padEnd(64, "0");
  const [asset] = await db
    .insert(assets)
    .values({
      stationId,
      title: data.title,
      artist: data.artist ?? null,
      category: data.category ?? "music",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      sha256,
      storageKey: `${sha256.slice(0, 2)}/${sha256}.mp3`,
    })
    .returning();
  return asset!;
}

/** Bloque de todos los días y todo el día, con la rotación indicada. */
export async function addAllDayBlock(db: Database, stationId: string, rotation: Record<string, unknown>) {
  const [block] = await db
    .insert(scheduleBlocks)
    .values({
      stationId,
      name: "Todo el día",
      days: [1, 2, 3, 4, 5, 6, 7],
      startMinute: 0,
      endMinute: 1440,
      rotation: rotationSchema.parse(rotation),
    })
    .returning();
  return block!;
}

export async function addAdvertiser(
  db: Database,
  tenantId: string,
  data: { name: string; industry?: string | null; isActive?: boolean },
) {
  const [advertiser] = await db
    .insert(advertisers)
    .values({ tenantId, name: data.name, industry: data.industry ?? null, isActive: data.isActive ?? true })
    .returning();
  return advertiser!;
}

/** Campaña vigente todo octubre de 2026, todos los días y todo el día, salvo que se indique otra cosa. */
export async function addCampaign(
  db: Database,
  stationId: string,
  advertiserId: string,
  assetIds: string[],
  overrides: Partial<typeof campaigns.$inferInsert> = {},
) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      stationId,
      advertiserId,
      name: "Campaña",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      days: [1, 2, 3, 4, 5, 6, 7],
      ...overrides,
    })
    .returning();
  await db.insert(campaignAssets).values(assetIds.map((assetId) => ({ campaignId: campaign!.id, assetId })));
  return campaign!;
}

/** Crea un token de agente y devuelve el valor en claro. */
export async function addAgent(db: Database, stationId: string, name = "liquidsoap") {
  const { token, tokenHash } = generateAgentToken();
  await db.insert(agentTokens).values({ stationId, name, tokenHash });
  return token;
}
