import { startOfLocalDay } from "@nubera/core";

export const RANGES = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Período del historial como instantes UTC, con los días contados en la zona
 * horaria de la emisora (no del navegador). `to` es exclusivo y puede faltar.
 */
export function historyRange(id: RangeId, now: Date, timeZone: string): { from: Date; to?: Date } {
  const today = startOfLocalDay(now, timeZone);
  switch (id) {
    case "today":
      return { from: today };
    case "yesterday":
      return { from: new Date(today.getTime() - DAY_MS), to: today };
    case "7d":
      return { from: new Date(today.getTime() - 6 * DAY_MS) };
    case "30d":
      return { from: new Date(today.getTime() - 29 * DAY_MS) };
  }
}
