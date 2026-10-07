import { describe, expect, it } from "vitest";
import { findActiveBlock, rotationSchema, type Block } from "./index.ts";

const TZ = "America/Argentina/Buenos_Aires";
// Martes 2026-10-06, 12:00 en Buenos Aires.
const NOW = new Date("2026-10-06T15:00:00Z");

const block = (id: string, startMinute: number, endMinute: number): Block => ({
  id,
  days: [1, 2, 3, 4, 5, 6, 7],
  startMinute,
  endMinute,
  rotation: rotationSchema.parse({ pool: [{ category: "music", weight: 1 }] }),
});

describe("findActiveBlock: superposición de bloques", () => {
  const general = block("general", 0, 1440);

  it("gana el que empezó más tarde (el más específico)", () => {
    const afternoon = block("tarde", 10 * 60, 20 * 60);
    expect(findActiveBlock([general, afternoon], NOW, TZ)?.id).toBe("tarde");
  });

  it("si empiezan a la vez, gana el más corto, sin importar el id", () => {
    const afternoon = block("a-tarde", 12 * 60, 20 * 60);
    const news = block("z-noticiero", 12 * 60, 13 * 60 + 30);
    expect(findActiveBlock([general, afternoon, news], NOW, TZ)?.id).toBe("z-noticiero");
    expect(findActiveBlock([news, afternoon, general], NOW, TZ)?.id).toBe("z-noticiero");
  });

  it("ante un empate total, gana el de menor id", () => {
    const first = block("a", 12 * 60, 14 * 60);
    const second = block("b", 12 * 60, 14 * 60);
    expect(findActiveBlock([second, first], NOW, TZ)?.id).toBe("a");
  });
});
