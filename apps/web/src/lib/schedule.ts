import { formatClock, parseClock } from "@nubera/core";
import type { AssetCategory } from "./categories";
import type { OnAirBlock } from "./types";

/** Bloque de la grilla tal como lo devuelve la API. */
export interface ScheduleBlock {
  id: string;
  name: string;
  /** 1 = lunes ... 7 = domingo. */
  days: number[];
  start: string;
  end: string;
  rotation: OnAirBlock["rotation"];
}

export const DAYS = [
  { iso: 1, short: "Lun", long: "Lunes", initial: "L" },
  { iso: 2, short: "Mar", long: "Martes", initial: "M" },
  { iso: 3, short: "Mié", long: "Miércoles", initial: "X" },
  { iso: 4, short: "Jue", long: "Jueves", initial: "J" },
  { iso: 5, short: "Vie", long: "Viernes", initial: "V" },
  { iso: 6, short: "Sáb", long: "Sábado", initial: "S" },
  { iso: 7, short: "Dom", long: "Domingo", initial: "D" },
] as const;

export const MINUTES_PER_DAY = 1440;

/** Horas elegibles para el inicio y el fin de un bloque: cada 30 minutos, de 00:00 a 24:00. */
export const TIME_OPTIONS: string[] = Array.from({ length: 49 }, (_, index) => formatClock(index * 30));

export const toMinutes = (clock: string): number => parseClock(clock) ?? 0;

// ---------------------------------------------------------------------------
// Disposición de la grilla
// ---------------------------------------------------------------------------

export interface Placed {
  block: ScheduleBlock;
  start: number;
  end: number;
  /**
   * Cuántos bloques están "debajo" de este en su hora de inicio (0 = ninguno).
   * Los que se superponen se apilan: el que empieza más tarde va encima.
   */
  depth: number;
}

/**
 * Ubica los bloques de un día en el orden en que se dibujan (el último queda
 * arriba). Refleja lo que hace el motor al superponerse: manda el bloque que
 * empieza más tarde; si empiezan a la vez, el más corto; y ante un empate total,
 * el de menor id.
 */
export function layoutDay(blocks: readonly ScheduleBlock[], isoDay: number): Placed[] {
  const items = blocks
    .filter((block) => block.days.includes(isoDay))
    .map((block) => ({ block, start: toMinutes(block.start), end: toMinutes(block.end) }))
    // Se dibuja primero lo que pierde: a igual inicio, el más largo; y ante un empate total, el de mayor id.
    .sort((a, b) => a.start - b.start || b.end - a.end || b.block.id.localeCompare(a.block.id));

  return items.map((item, index) => ({
    ...item,
    depth: items.slice(0, index).filter((below) => below.end > item.start).length,
  }));
}

export interface Gap {
  day: number;
  start: number;
  end: number;
}

/**
 * Qué parte de la semana tiene programación y qué tramos quedan sin bloque
 * (en esos tramos el motor emite su biblioteca de respaldo).
 */
export function coverage(blocks: readonly ScheduleBlock[]): { percent: number; gaps: Gap[] } {
  const gaps: Gap[] = [];
  let covered = 0;

  for (const { iso } of DAYS) {
    const intervals = blocks
      .filter((block) => block.days.includes(iso))
      .map((block) => [toMinutes(block.start), toMinutes(block.end)] as const)
      .sort((a, b) => a[0] - b[0]);

    let cursor = 0;
    for (const [start, end] of intervals) {
      if (start > cursor) {
        gaps.push({ day: iso, start: cursor, end: start });
      }
      if (end > cursor) {
        covered += end - Math.max(start, cursor);
        cursor = end;
      }
    }
    if (cursor < MINUTES_PER_DAY) {
      gaps.push({ day: iso, start: cursor, end: MINUTES_PER_DAY });
    }
  }
  return { percent: Math.round((covered / (MINUTES_PER_DAY * DAYS.length)) * 100), gaps };
}

/** Categoría con más peso en el pool: define el color del bloque en la grilla. */
export function dominantCategory(rotation: ScheduleBlock["rotation"]): AssetCategory {
  let best = rotation.pool[0];
  for (const entry of rotation.pool) {
    if (!best || entry.weight > best.weight) {
      best = entry;
    }
  }
  return best?.category ?? "music";
}

/** Otros bloques que comparten algún día y algún tramo horario con `block`. */
export function overlapsOf(block: Pick<ScheduleBlock, "id" | "days" | "start" | "end">, all: readonly ScheduleBlock[]): ScheduleBlock[] {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  return all.filter(
    (other) =>
      other.id !== block.id &&
      other.days.some((day) => block.days.includes(day)) &&
      toMinutes(other.start) < end &&
      start < toMinutes(other.end),
  );
}

/** "Lun a Vie", "Lun, Mié y Vie", "Todos los días". */
export function describeDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Todos los días";
  const names = sorted.map((day) => DAYS[day - 1]!.short);
  const consecutive = sorted.length > 2 && sorted.every((day, index) => index === 0 || day === sorted[index - 1]! + 1);
  if (consecutive) return `${names[0]} a ${names[names.length - 1]}`;
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Formulario de bloque
// ---------------------------------------------------------------------------

export interface BlockForm {
  name: string;
  days: number[];
  start: string;
  end: string;
  pool: { category: AssetCategory; weight: number }[];
  insertions: { category: AssetCategory; everyTracks: number }[];
  adsEnabled: boolean;
  adsEveryTracks: number;
  adsSpotsPerBreak: number;
  artistSeparation: number;
  trackSeparationMinutes: number;
}

/** Valores iniciales de un bloque nuevo: dos horas desde el momento elegido. */
export function newForm(isoDay: number, startMinute: number): BlockForm {
  const start = Math.min(Math.max(startMinute, 0), MINUTES_PER_DAY - 30);
  const end = Math.min(start + 120, MINUTES_PER_DAY);
  return {
    name: "",
    days: [isoDay],
    start: formatClock(start),
    end: formatClock(end),
    pool: [{ category: "music", weight: 1 }],
    insertions: [],
    adsEnabled: false,
    adsEveryTracks: 4,
    adsSpotsPerBreak: 2,
    artistSeparation: 3,
    trackSeparationMinutes: 120,
  };
}

export function blockToForm(block: ScheduleBlock): BlockForm {
  const { rotation } = block;
  return {
    name: block.name,
    days: [...block.days],
    start: block.start,
    end: block.end,
    pool: rotation.pool.map((entry) => ({ ...entry })),
    insertions: rotation.insertions.map((entry) => ({ ...entry })),
    adsEnabled: rotation.ads !== undefined,
    adsEveryTracks: rotation.ads?.everyTracks ?? 4,
    adsSpotsPerBreak: rotation.ads?.spotsPerBreak ?? 2,
    artistSeparation: rotation.artistSeparation,
    trackSeparationMinutes: rotation.trackSeparationMinutes,
  };
}

/** Cuerpo para la API (POST y PUT). */
export function formToPayload(form: BlockForm) {
  return {
    name: form.name.trim(),
    days: [...form.days].sort((a, b) => a - b),
    start: form.start,
    end: form.end,
    rotation: {
      pool: form.pool,
      insertions: form.insertions,
      artistSeparation: form.artistSeparation,
      trackSeparationMinutes: form.trackSeparationMinutes,
      ...(form.adsEnabled ? { ads: { everyTracks: form.adsEveryTracks, spotsPerBreak: form.adsSpotsPerBreak } } : {}),
    },
  };
}

const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
const hasDuplicates = (values: readonly string[]) => new Set(values).size !== values.length;

/** Motivos por los que el formulario no se puede guardar (vacío si es válido). */
export function formProblems(form: BlockForm): string[] {
  const problems: string[] = [];
  if (!form.name.trim()) problems.push("Poné un nombre al bloque.");
  if (form.days.length === 0) problems.push("Elegí al menos un día.");
  if (toMinutes(form.end) <= toMinutes(form.start)) {
    problems.push("El fin tiene que ser posterior al inicio. Para cruzar la medianoche, usá dos bloques.");
  }
  if (form.pool.length === 0) problems.push("Agregá al menos una categoría a la mezcla.");
  if (hasDuplicates(form.pool.map((entry) => entry.category))) problems.push("Una categoría no puede repetirse en la mezcla.");
  if (form.pool.some((entry) => !inRange(entry.weight, 1, 100))) problems.push("El peso de cada categoría va de 1 a 100.");
  if (form.pool.some((entry) => entry.category === "ad")) {
    problems.push("La publicidad se programa con tandas, no como categoría de la mezcla.");
  }
  if (hasDuplicates(form.insertions.map((entry) => entry.category))) problems.push("Una categoría no puede intercalarse dos veces.");
  if (form.insertions.some((entry) => !inRange(entry.everyTracks, 1, 50))) problems.push("Cada cuántas emisiones se intercala va de 1 a 50.");
  if (form.adsEnabled) {
    if (!inRange(form.adsEveryTracks, 1, 50)) problems.push("La tanda se emite cada 1 a 50 emisiones.");
    if (!inRange(form.adsSpotsPerBreak, 1, 6)) problems.push("Una tanda lleva de 1 a 6 avisos.");
  }
  if (!inRange(form.artistSeparation, 0, 50)) problems.push("La separación de artistas va de 0 a 50.");
  if (!inRange(form.trackSeparationMinutes, 0, 1440)) problems.push("La separación de un mismo tema va de 0 a 1440 minutos.");
  return problems;
}
