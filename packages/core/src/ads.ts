import { localDate, localTime } from "./blocks.js";
import type { PlayRecord, PoolAsset } from "./engine.js";

export interface AdsConfig {
  everyTracks: number;
  spotsPerBreak: number;
}

/** Campaña con sus avisos (audios de categoría "ad"). */
export interface AdCampaign {
  id: string;
  advertiserId: string;
  /** Rubro del anunciante; dos avisos del mismo rubro no van en la misma tanda. */
  industry: string | null;
  /** Peso relativo: una campaña de peso 2 recibe el doble de emisiones que una de peso 1. */
  weight: number;
  /** Vigencia inclusiva, fechas locales "AAAA-MM-DD". */
  startsOn: string;
  endsOn: string;
  /** Máximo de emisiones por día local; null = sin tope. */
  dailyPlays: number | null;
  days: readonly number[];
  startMinute: number;
  endMinute: number;
  spots: readonly PoolAsset[];
}

export interface PickSpotInput {
  campaigns: readonly AdCampaign[];
  /** De la más reciente a la más antigua. */
  history: readonly PlayRecord[];
  /** Emisiones de hoy (día local) por campaña. */
  playsToday: ReadonlyMap<string, number>;
  now: Date;
  timeZone: string;
  random?: () => number;
}

export interface SpotPick {
  campaign: AdCampaign;
  asset: PoolAsset;
}

const normalize = (text: string | null | undefined) => text?.trim().toLowerCase() ?? "";

/** Avisos consecutivos al comienzo del historial (la tanda en curso). */
function currentBreak(history: readonly PlayRecord[]): PlayRecord[] {
  const run: PlayRecord[] = [];
  for (const play of history) {
    if (play.category !== "ad") {
      break;
    }
    run.push(play);
  }
  return run;
}

/**
 * ¿Corresponde emitir un aviso ahora? Sí si hay una tanda en curso que no
 * llegó a `spotsPerBreak`, o si pasaron `everyTracks` emisiones desde la última.
 */
export function adBreakDue(history: readonly PlayRecord[], ads: AdsConfig): boolean {
  const run = currentBreak(history).length;
  if (run > 0) {
    return run < ads.spotsPerBreak;
  }
  const lastAd = history.findIndex((play) => play.category === "ad");
  const since = lastAd === -1 ? history.length : lastAd;
  return since >= ads.everyTracks;
}

/**
 * Elige el próximo aviso. Reglas, en orden:
 * 1. Solo campañas vigentes (fechas, día, franja horaria) y que no superaron su tope diario.
 * 2. Dentro de una tanda no se repite el anunciante ni el rubro (exclusividad).
 *    Si por eso no queda ninguna campaña, la tanda termina antes en lugar de violar la regla.
 * 3. Gana la campaña con menos emisiones hoy en proporción a su peso.
 * 4. Dentro de la campaña, el aviso que hace más tiempo no suena.
 * Devuelve null si no hay candidatos.
 */
export function pickSpot({
  campaigns,
  history,
  playsToday,
  now,
  timeZone,
  random = Math.random,
}: PickSpotInput): SpotPick | null {
  const today = localDate(now, timeZone);
  const { isoDay, minute } = localTime(now, timeZone);

  const inBreak = currentBreak(history);
  const usedAdvertisers = new Set(inBreak.map((play) => play.advertiserId).filter(Boolean));
  const usedIndustries = new Set(inBreak.map((play) => normalize(play.industry)).filter(Boolean));

  const eligible = campaigns
    .filter(
      (campaign) =>
        campaign.spots.length > 0 &&
        campaign.startsOn <= today &&
        today <= campaign.endsOn &&
        campaign.days.includes(isoDay) &&
        campaign.startMinute <= minute &&
        minute < campaign.endMinute &&
        (campaign.dailyPlays === null || (playsToday.get(campaign.id) ?? 0) < campaign.dailyPlays) &&
        !usedAdvertisers.has(campaign.advertiserId) &&
        !(campaign.industry && usedIndustries.has(normalize(campaign.industry))),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) {
    return null;
  }

  const score = (campaign: AdCampaign) => (playsToday.get(campaign.id) ?? 0) / campaign.weight;
  const best = Math.min(...eligible.map(score));
  const tied = eligible.filter((campaign) => score(campaign) === best);
  const campaign = tied[Math.floor(random() * tied.length)]!;

  const lastPlayed = new Map<string, number>();
  for (const play of history) {
    if (play.assetId && !lastPlayed.has(play.assetId)) {
      lastPlayed.set(play.assetId, play.at.getTime());
    }
  }
  const ordered = [...campaign.spots].sort((a, b) => a.id.localeCompare(b.id));
  const oldest = Math.min(...ordered.map((spot) => lastPlayed.get(spot.id) ?? -Infinity));
  const candidates = ordered.filter((spot) => (lastPlayed.get(spot.id) ?? -Infinity) === oldest);
  return { campaign, asset: candidates[Math.floor(random() * candidates.length)]! };
}
