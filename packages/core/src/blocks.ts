import type { Rotation } from "./rotation.js";

/** Bloque de la grilla semanal. Los minutos cuentan desde la medianoche local. */
export interface Block {
  id: string;
  /** Días en que aplica: 1 = lunes ... 7 = domingo (ISO). */
  days: readonly number[];
  startMinute: number;
  /** Exclusivo; 1440 equivale a medianoche. */
  endMinute: number;
  rotation: Rotation;
}

const ISO_DAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Día ISO y minuto del día en la zona horaria indicada. */
export function localTime(date: Date, timeZone: string): { isoDay: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    isoDay: ISO_DAY[value("weekday")] ?? 0,
    minute: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

/**
 * Bloque vigente en un instante. Si hay superposición gana el que empezó más
 * tarde (el más específico); ante un empate, el de menor id, para ser determinista.
 */
export function findActiveBlock<T extends Block>(blocks: readonly T[], at: Date, timeZone: string): T | null {
  const { isoDay, minute } = localTime(at, timeZone);
  const active = blocks.filter(
    (block) => block.days.includes(isoDay) && block.startMinute <= minute && minute < block.endMinute,
  );
  active.sort((a, b) => b.startMinute - a.startMinute || a.id.localeCompare(b.id));
  return active[0] ?? null;
}

/** "06:30" → 390. Acepta "24:00" como fin de día. */
export function parseClock(text: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) {
    return null;
  }
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minutes <= 1440 ? minutes : null;
}

/** 390 → "06:30". */
export function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
