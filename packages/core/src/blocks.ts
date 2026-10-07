import type { Rotation } from "./rotation.ts";

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

/** Fecha local "AAAA-MM-DD" en la zona horaria indicada. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Fecha y hora local "AAAA-MM-DD HH:mm:ss" en la zona horaria indicada. */
export function formatLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

/** Instante en que empezó el día local de `date` (zonas sin salto horario durante el día). */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const { minute } = localTime(date, timeZone);
  return new Date(date.getTime() - minute * 60_000 - date.getUTCSeconds() * 1000 - date.getUTCMilliseconds());
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
