import { describe, expect, it } from "vitest";
import { describeRules, poolShares } from "./rotation-summary";
import type { OnAirBlock } from "./types";

type Rotation = OnAirBlock["rotation"];
const rotation = (overrides: Partial<Rotation> = {}): Rotation => ({
  pool: [{ category: "music", weight: 1 }],
  insertions: [],
  artistSeparation: 0,
  trackSeparationMinutes: 0,
  ...overrides,
});

describe("poolShares", () => {
  it("convierte pesos en porcentajes que siempre suman 100", () => {
    const shares = poolShares([
      { category: "music", weight: 1 },
      { category: "institutional", weight: 1 },
      { category: "other", weight: 1 },
    ]);
    expect(shares.map((s) => s.percent)).toEqual([34, 33, 33]);
    expect(shares.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
  });

  it("respeta las proporciones", () => {
    expect(
      poolShares([
        { category: "music", weight: 4 },
        { category: "institutional", weight: 1 },
      ]).map((s) => s.percent),
    ).toEqual([80, 20]);
  });

  it("una sola categoría es el 100 %; sin categorías, vacío", () => {
    expect(poolShares([{ category: "music", weight: 7 }])).toEqual([{ category: "music", percent: 100 }]);
    expect(poolShares([])).toEqual([]);
  });
});

describe("describeRules", () => {
  it("sin reglas especiales no devuelve nada", () => {
    expect(describeRules(rotation())).toEqual([]);
  });

  it("describe intercalados, tandas y separaciones", () => {
    const rules = describeRules(
      rotation({
        insertions: [{ category: "jingle", everyTracks: 4 }],
        ads: { everyTracks: 5, spotsPerBreak: 2 },
        artistSeparation: 3,
        trackSeparationMinutes: 120,
      }),
    );
    expect(rules).toEqual([
      "Jingle cada 4 emisiones",
      "Tanda de hasta 2 avisos cada 5 emisiones",
      "Sin repetir artista en 3 emisiones",
      "Sin repetir un tema por 2 horas",
    ]);
  });

  it("usa el singular y los minutos cuando corresponde", () => {
    const rules = describeRules(
      rotation({
        insertions: [{ category: "sweeper", everyTracks: 1 }],
        ads: { everyTracks: 1, spotsPerBreak: 1 },
        artistSeparation: 1,
        trackSeparationMinutes: 90,
      }),
    );
    expect(rules).toEqual([
      "Cortina cada 1 emisión",
      "Tanda de hasta 1 aviso cada 1 emisión",
      "Sin repetir artista en 1 emisión",
      "Sin repetir un tema por 90 min",
    ]);
  });
});
