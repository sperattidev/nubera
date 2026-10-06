import { describe, expect, it } from "vitest";
import { historyRange } from "./history-range";

const TZ = "America/Argentina/Buenos_Aires";
// Martes 2026-10-06, 12:00 en Buenos Aires (UTC-3).
const NOW = new Date("2026-10-06T15:00:00Z");

describe("historyRange", () => {
  it("hoy empieza a las 00:00 de la emisora y no tiene fin", () => {
    const range = historyRange("today", NOW, TZ);
    expect(range.from.toISOString()).toBe("2026-10-06T03:00:00.000Z");
    expect(range.to).toBeUndefined();
  });

  it("ayer es el día anterior completo", () => {
    const range = historyRange("yesterday", NOW, TZ);
    expect(range.from.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });

  it("7 y 30 días incluyen el día de hoy", () => {
    expect(historyRange("7d", NOW, TZ).from.toISOString()).toBe("2026-09-30T03:00:00.000Z");
    expect(historyRange("30d", NOW, TZ).from.toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });

  it("cuenta los días en la zona de la emisora, no en UTC", () => {
    // 01:00Z del martes ya es lunes 22:00 en Buenos Aires: "hoy" es el lunes.
    const lateMonday = new Date("2026-10-06T01:00:00Z");
    expect(historyRange("today", lateMonday, TZ).from.toISOString()).toBe("2026-10-05T03:00:00.000Z");
  });
});
