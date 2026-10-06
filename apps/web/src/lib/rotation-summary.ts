import { CATEGORY_LABEL } from "./categories";
import type { OnAirBlock } from "./types";

export interface PoolShare {
  category: OnAirBlock["rotation"]["pool"][number]["category"];
  /** Porcentaje entero (los porcentajes suman 100). */
  percent: number;
}

/** Peso → porcentaje del total, con los redondeos ajustados para sumar exactamente 100. */
export function poolShares(pool: OnAirBlock["rotation"]["pool"]): PoolShare[] {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (total === 0) {
    return [];
  }
  const shares = pool.map((entry) => ({ category: entry.category, exact: (entry.weight / total) * 100 }));
  const result = shares.map((share) => ({ category: share.category, percent: Math.floor(share.exact) }));
  let missing = 100 - result.reduce((sum, share) => sum + share.percent, 0);
  // Los puntos que faltan van a quienes tienen mayor parte decimal.
  const order = shares
    .map((share, index) => ({ index, fraction: share.exact - Math.floor(share.exact) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (missing === 0) {
      break;
    }
    result[index]!.percent += 1;
    missing -= 1;
  }
  return result;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Reglas del bloque en frases cortas para mostrar en el panel. */
export function describeRules(rotation: OnAirBlock["rotation"]): string[] {
  const rules: string[] = [];
  for (const insertion of rotation.insertions) {
    rules.push(
      `${CATEGORY_LABEL[insertion.category]} cada ${insertion.everyTracks} ${plural(insertion.everyTracks, "emisión", "emisiones")}`,
    );
  }
  if (rotation.ads) {
    const { everyTracks, spotsPerBreak } = rotation.ads;
    rules.push(
      `Tanda de hasta ${spotsPerBreak} ${plural(spotsPerBreak, "aviso", "avisos")} cada ${everyTracks} ${plural(everyTracks, "emisión", "emisiones")}`,
    );
  }
  if (rotation.artistSeparation > 0) {
    rules.push(`Sin repetir artista en ${rotation.artistSeparation} ${plural(rotation.artistSeparation, "emisión", "emisiones")}`);
  }
  if (rotation.trackSeparationMinutes > 0) {
    rules.push(`Sin repetir un tema por ${formatMinutes(rotation.trackSeparationMinutes)}`);
  }
  return rules;
}

function formatMinutes(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${plural(hours, "hora", "horas")}`;
  }
  return `${minutes} min`;
}
