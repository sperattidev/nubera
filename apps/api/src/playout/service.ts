import {
  findActiveBlock,
  pickNext,
  type Block,
  type PlayRecord,
} from "@nubera/core";
import {
  and,
  assets,
  desc,
  eq,
  gte,
  inArray,
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

/**
 * Elige el próximo audio de una emisora según el bloque vigente y registra la
 * selección. Devuelve null si no hay bloque vigente o no hay audios para él.
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

  const recent = await db
    .select({ assetId: plays.assetId, artist: plays.artist, category: plays.category, at: plays.pickedAt })
    .from(plays)
    .where(and(eq(plays.stationId, stationId), gte(plays.pickedAt, new Date(now.getTime() - HISTORY_WINDOW_MS))))
    .orderBy(desc(plays.pickedAt))
    .limit(HISTORY_LIMIT);
  const history: PlayRecord[] = recent;

  const picked = pickNext({ block, assets: library, history, now, random });
  if (!picked) {
    return null;
  }
  const asset = library.find((candidate) => candidate.id === picked.asset.id)!;

  const [play] = await db
    .insert(plays)
    .values({
      stationId,
      assetId: asset.id,
      blockId: block.id,
      title: asset.title,
      artist: asset.artist,
      category: asset.category,
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
