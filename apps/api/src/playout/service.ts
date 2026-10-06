import {
  adBreakDue,
  findActiveBlock,
  localDate,
  pickNext,
  pickSpot,
  startOfLocalDay,
  type AdCampaign,
  type AssetCategory,
  type Block,
  type PlayRecord,
  type PoolAsset,
} from "@nubera/core";
import {
  advertisers,
  and,
  assets,
  campaignAssets,
  campaigns,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  plays,
  scheduleBlocks,
  stations,
  type Database,
} from "@nubera/db";

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 200;

export interface NextTrack {
  playId: string;
  assetId: string;
  blockId: string;
  storageKey: string;
  title: string;
  artist: string;
  category: string;
}

interface Chosen {
  asset: PoolAsset & { storageKey: string };
  campaignId: string | null;
}

/** Emisiones recientes (la más reciente primero), con el anunciante y rubro de los avisos. */
async function loadHistory(db: Database, stationId: string, now: Date): Promise<PlayRecord[]> {
  return db
    .select({
      assetId: plays.assetId,
      artist: plays.artist,
      category: plays.category,
      at: plays.pickedAt,
      campaignId: plays.campaignId,
      advertiserId: campaigns.advertiserId,
      industry: advertisers.industry,
    })
    .from(plays)
    .leftJoin(campaigns, eq(plays.campaignId, campaigns.id))
    .leftJoin(advertisers, eq(campaigns.advertiserId, advertisers.id))
    .where(and(eq(plays.stationId, stationId), gte(plays.pickedAt, new Date(now.getTime() - HISTORY_WINDOW_MS))))
    .orderBy(desc(plays.pickedAt))
    .limit(HISTORY_LIMIT);
}

/** Campañas activas y vigentes hoy, con sus avisos, y cuántas veces salió cada una hoy. */
async function loadCampaigns(db: Database, stationId: string, now: Date, timeZone: string) {
  const today = localDate(now, timeZone);
  const rows = await db
    .select({
      id: campaigns.id,
      advertiserId: campaigns.advertiserId,
      industry: advertisers.industry,
      weight: campaigns.weight,
      startsOn: campaigns.startsOn,
      endsOn: campaigns.endsOn,
      dailyPlays: campaigns.dailyPlays,
      days: campaigns.days,
      startMinute: campaigns.startMinute,
      endMinute: campaigns.endMinute,
    })
    .from(campaigns)
    .innerJoin(advertisers, eq(campaigns.advertiserId, advertisers.id))
    .where(
      and(
        eq(campaigns.stationId, stationId),
        eq(campaigns.isActive, true),
        eq(advertisers.isActive, true),
        lte(campaigns.startsOn, today),
        gte(campaigns.endsOn, today),
      ),
    );
  if (rows.length === 0) {
    return { list: [] as AdCampaign[], storageKeys: new Map<string, string>(), playsToday: new Map<string, number>() };
  }

  const ids = rows.map((row) => row.id);
  const spotRows = await db
    .select({
      campaignId: campaignAssets.campaignId,
      id: assets.id,
      title: assets.title,
      artist: assets.artist,
      category: assets.category,
      storageKey: assets.storageKey,
    })
    .from(campaignAssets)
    .innerJoin(assets, eq(campaignAssets.assetId, assets.id))
    .where(inArray(campaignAssets.campaignId, ids));

  const storageKeys = new Map<string, string>();
  const spotsByCampaign = new Map<string, PoolAsset[]>();
  for (const { campaignId, storageKey, ...spot } of spotRows) {
    storageKeys.set(spot.id, storageKey);
    spotsByCampaign.set(campaignId, [...(spotsByCampaign.get(campaignId) ?? []), spot]);
  }

  const todayCounts = await db
    .select({ campaignId: plays.campaignId, total: count() })
    .from(plays)
    .where(and(eq(plays.stationId, stationId), gte(plays.pickedAt, startOfLocalDay(now, timeZone)), inArray(plays.campaignId, ids)))
    .groupBy(plays.campaignId);
  const playsToday = new Map<string, number>();
  for (const { campaignId, total } of todayCounts) {
    if (campaignId) {
      playsToday.set(campaignId, total);
    }
  }

  const list: AdCampaign[] = rows.map((row) => ({ ...row, spots: spotsByCampaign.get(row.id) ?? [] }));
  return { list, storageKeys, playsToday };
}

/**
 * Elige el próximo audio de una emisora según el bloque vigente y registra la
 * selección. Si el bloque tiene tandas y corresponde una, intenta primero con
 * un aviso; si no hay campañas elegibles sigue con la música. Devuelve null si
 * no hay bloque vigente o no hay audios para él.
 */
export async function pickForStation(
  db: Database,
  stationId: string,
  now: Date,
  random?: () => number,
): Promise<NextTrack | null> {
  const [station] = await db
    .select({ timezone: stations.timezone })
    .from(stations)
    .where(eq(stations.id, stationId))
    .limit(1);
  if (!station) {
    return null;
  }

  const blocks: Block[] = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.stationId, stationId));
  const block = findActiveBlock(blocks, now, station.timezone);
  if (!block) {
    return null;
  }

  const history = await loadHistory(db, stationId, now);

  let chosen: Chosen | null = null;

  const ads = block.rotation.ads;
  if (ads && adBreakDue(history, ads)) {
    const { list, storageKeys, playsToday } = await loadCampaigns(db, stationId, now, station.timezone);
    const spot = pickSpot({ campaigns: list, history, playsToday, now, timeZone: station.timezone, random });
    if (spot) {
      chosen = {
        asset: { ...spot.asset, storageKey: storageKeys.get(spot.asset.id)! },
        campaignId: spot.campaign.id,
      };
    }
  }

  if (!chosen) {
    const categories = [
      ...new Set([...block.rotation.pool.map((p) => p.category), ...block.rotation.insertions.map((i) => i.category)]),
    ];
    const library = await db
      .select({
        id: assets.id,
        title: assets.title,
        artist: assets.artist,
        category: assets.category,
        storageKey: assets.storageKey,
      })
      .from(assets)
      .where(and(eq(assets.stationId, stationId), inArray(assets.category, categories)));

    const picked = pickNext({ block, assets: library, history, now, random });
    if (!picked) {
      return null;
    }
    chosen = { asset: library.find((candidate) => candidate.id === picked.asset.id)!, campaignId: null };
  }

  const { asset, campaignId } = chosen;
  const [play] = await db
    .insert(plays)
    .values({
      stationId,
      assetId: asset.id,
      blockId: block.id,
      campaignId,
      title: asset.title,
      artist: asset.artist,
      category: asset.category as AssetCategory,
      pickedAt: now,
    })
    .returning({ id: plays.id });

  return {
    playId: play!.id,
    assetId: asset.id,
    blockId: block.id,
    storageKey: asset.storageKey,
    title: asset.title,
    artist: asset.artist ?? "",
    category: asset.category,
  };
}
