import type { Block } from "./blocks.js";

export interface PoolAsset {
  id: string;
  title: string;
  artist: string | null;
  category: string;
}

export interface PlayRecord {
  assetId: string | null;
  artist: string | null;
  category: string;
  at: Date;
}

interface Context {
  block: Block;
  /** Emisiones anteriores, de la más reciente a la más antigua. */
  history: readonly PlayRecord[];
  now: Date;
}

export interface PickInput extends Context {
  assets: readonly PoolAsset[];
  random?: () => number;
}

export interface Pick {
  asset: PoolAsset;
  /** `relaxed`: no hubo candidatos que cumplieran las separaciones y se aflojaron. */
  reason: "rotation" | "insertion" | "relaxed";
}

const normalize = (text: string | null) => text?.trim().toLowerCase() ?? "";

/** Cuántas emisiones consecutivas hubo desde la última de la categoría. */
function tracksSince(history: readonly PlayRecord[], category: string): number {
  const index = history.findIndex((play) => play.category === category);
  return index === -1 ? history.length : index;
}

function weightedCategory(options: readonly { category: string; weight: number }[], random: () => number): string {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let threshold = random() * total;
  for (const option of options) {
    threshold -= option.weight;
    if (threshold < 0) {
      return option.category;
    }
  }
  return options[options.length - 1]!.category;
}

function chooseAsset(
  candidates: readonly PoolAsset[],
  { block, history, now }: Context,
  random: () => number,
): { asset: PoolAsset; relaxed: boolean } {
  const { artistSeparation, trackSeparationMinutes } = block.rotation;

  const recentArtists = new Set(
    history
      .slice(0, artistSeparation)
      .map((play) => normalize(play.artist))
      .filter(Boolean),
  );
  const cutoff = now.getTime() - trackSeparationMinutes * 60_000;
  const recentIds = new Set(
    history.filter((play) => play.assetId && play.at.getTime() >= cutoff).map((play) => play.assetId),
  );

  const free = candidates.filter((asset) => !recentIds.has(asset.id));
  const strict = free.filter((asset) => !(asset.artist && recentArtists.has(normalize(asset.artist))));
  if (strict.length > 0) {
    return { asset: strict[Math.floor(random() * strict.length)]!, relaxed: false };
  }
  if (free.length > 0) {
    return { asset: free[Math.floor(random() * free.length)]!, relaxed: true };
  }

  // Todo se emitió hace poco: el menos reciente (o nunca emitido).
  const lastPlayed = new Map<string, number>();
  for (const play of history) {
    if (play.assetId && !lastPlayed.has(play.assetId)) {
      lastPlayed.set(play.assetId, play.at.getTime());
    }
  }
  const oldest = [...candidates].sort(
    (a, b) => (lastPlayed.get(a.id) ?? -Infinity) - (lastPlayed.get(b.id) ?? -Infinity),
  )[0]!;
  return { asset: oldest, relaxed: true };
}

/**
 * Elige el próximo audio según las reglas del bloque. Función pura: dado el
 * mismo estado y la misma fuente de azar, devuelve lo mismo. Devuelve null si
 * no hay audios en ninguna de las categorías del bloque.
 */
export function pickNext({ block, assets, history, now, random = Math.random }: PickInput): Pick | null {
  const byCategory = new Map<string, PoolAsset[]>();
  for (const asset of [...assets].sort((a, b) => a.id.localeCompare(b.id))) {
    byCategory.set(asset.category, [...(byCategory.get(asset.category) ?? []), asset]);
  }
  const available = (category: string) => byCategory.get(category) ?? [];
  const { pool, insertions } = block.rotation;

  let category: string | undefined;
  let reason: Pick["reason"] = "rotation";

  for (const insertion of insertions) {
    if (available(insertion.category).length > 0 && tracksSince(history, insertion.category) >= insertion.everyTracks) {
      category = insertion.category;
      reason = "insertion";
      break;
    }
  }

  if (!category) {
    const options = pool.filter((entry) => available(entry.category).length > 0);
    if (options.length === 0) {
      return null;
    }
    category = weightedCategory(options, random);
  }

  const { asset, relaxed } = chooseAsset(available(category), { block, history, now }, random);
  return { asset, reason: relaxed ? "relaxed" : reason };
}
