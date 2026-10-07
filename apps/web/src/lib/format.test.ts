import { describe, expect, it } from "vitest";
import { formatBytes, formatClockTime, formatRelative, formatTime } from "./format";

const TZ = "America/Argentina/Buenos_Aires";

describe("formatBytes", () => {
  it("elige la unidad adecuada", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536 * 1024)).toBe("1,5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3 GB");
  });
});

describe("formatClockTime", () => {
  it("da minutos:segundos y horas cuando corresponde", () => {
    expect(formatClockTime(0)).toBe("0:00");
    expect(formatClockTime(65_000)).toBe("1:05");
    expect(formatClockTime(3_725_000)).toBe("1:02:05");
  });

  it("nunca es negativo (reloj del navegador adelantado)", () => {
    expect(formatClockTime(-5000)).toBe("0:00");
  });
});

describe("formatTime", () => {
  it("usa la hora local de la emisora", () => {
    expect(formatTime("2026-10-06T15:05:00Z", TZ)).toBe("12:05");
    expect(formatTime(new Date("2026-10-06T02:30:00Z"), TZ)).toBe("23:30");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-06T15:00:00Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it("escala de segundos a horas", () => {
    expect(formatRelative(ago(2), now, TZ)).toBe("ahora");
    expect(formatRelative(ago(30), now, TZ)).toBe("hace 30 s");
    expect(formatRelative(ago(180), now, TZ)).toBe("hace 3 min");
    expect(formatRelative(ago(7200), now, TZ)).toBe("hace 2 h");
  });

  it("pasado un día muestra la fecha", () => {
    expect(formatRelative(ago(3 * 86_400), now, TZ)).toMatch(/oct/);
  });
});
