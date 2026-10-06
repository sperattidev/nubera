import { describe, expect, it } from "vitest";
import {
  findActiveBlock,
  formatClock,
  localTime,
  parseClock,
  pickNext,
  rotationSchema,
  type Block,
  type PlayRecord,
  type PoolAsset,
} from "./index.ts";

const TZ = "America/Argentina/Buenos_Aires";
const NOW = new Date("2026-10-06T15:00:00Z");

const rotation = (overrides: Record<string, unknown> = {}) =>
  rotationSchema.parse({ pool: [{ category: "music", weight: 1 }], ...overrides });

const block = (overrides: Partial<Block> = {}): Block => ({
  id: "b1",
  days: [1, 2, 3, 4, 5, 6, 7],
  startMinute: 0,
  endMinute: 1440,
  rotation: rotation(),
  ...overrides,
});

const asset = (id: string, category = "music", artist: string | null = `artista-${id}`): PoolAsset => ({
  id,
  title: `Tema ${id}`,
  artist,
  category,
});

const play = (assetId: string, category = "music", artist: string | null = `artista-${assetId}`, minutesAgo = 1): PlayRecord => ({
  assetId,
  artist,
  category,
  at: new Date(NOW.getTime() - minutesAgo * 60_000),
});

describe("horarios", () => {
  it("convierte a hora local con el día ISO", () => {
    // 2026-10-06 es martes; 15:00Z = 12:00 en Buenos Aires (UTC-3).
    expect(localTime(NOW, TZ)).toEqual({ isoDay: 2, minute: 12 * 60 });
    // 03:30Z del martes = 00:30 del martes local; 01:00Z = lunes 22:00 local.
    expect(localTime(new Date("2026-10-06T03:30:00Z"), TZ)).toEqual({ isoDay: 2, minute: 30 });
    expect(localTime(new Date("2026-10-06T01:00:00Z"), TZ)).toEqual({ isoDay: 1, minute: 22 * 60 });
  });

  it("parsea y formatea la hora", () => {
    expect(parseClock("06:30")).toBe(390);
    expect(parseClock("24:00")).toBe(1440);
    expect(parseClock("24:30")).toBeNull();
    expect(parseClock("6:30")).toBeNull();
    expect(parseClock("10:75")).toBeNull();
    expect(formatClock(390)).toBe("06:30");
    expect(formatClock(1440)).toBe("24:00");
  });

  it("encuentra el bloque vigente por día y horario (fin exclusivo)", () => {
    const morning = block({ id: "m", days: [2], startMinute: 6 * 60, endMinute: 12 * 60 });
    const noon = block({ id: "n", days: [2], startMinute: 12 * 60, endMinute: 18 * 60 });
    expect(findActiveBlock([morning, noon], NOW, TZ)?.id).toBe("n");
    expect(findActiveBlock([morning], NOW, TZ)).toBeNull();
    expect(findActiveBlock([block({ days: [3] })], NOW, TZ)).toBeNull();
  });

  it("ante superposición gana el que empezó más tarde", () => {
    const general = block({ id: "a", startMinute: 0, endMinute: 1440 });
    const specific = block({ id: "b", startMinute: 600, endMinute: 900 });
    expect(findActiveBlock([general, specific], NOW, TZ)?.id).toBe("b");
  });
});

describe("rotationSchema", () => {
  it("aplica valores por defecto", () => {
    expect(rotation()).toMatchObject({ insertions: [], artistSeparation: 3, trackSeparationMinutes: 120 });
  });

  it("rechaza pools vacíos o con categorías repetidas", () => {
    expect(rotationSchema.safeParse({ pool: [] }).success).toBe(false);
    expect(
      rotationSchema.safeParse({
        pool: [
          { category: "music", weight: 1 },
          { category: "music", weight: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(rotationSchema.safeParse({ pool: [{ category: "inventada", weight: 1 }] }).success).toBe(false);
  });
});

describe("pickNext", () => {
  const pick = (assets: PoolAsset[], history: PlayRecord[], b = block(), random = () => 0) =>
    pickNext({ block: b, assets, history, now: NOW, random });

  it("devuelve null si no hay audios en las categorías del bloque", () => {
    expect(pick([asset("j", "jingle")], [])).toBeNull();
    expect(pick([], [])).toBeNull();
  });

  it("elige de la categoría ponderada", () => {
    const b = block({
      rotation: rotation({
        pool: [
          { category: "music", weight: 3 },
          { category: "other", weight: 1 },
        ],
      }),
    });
    const assets = [asset("m"), asset("o", "other")];
    expect(pick(assets, [], b, () => 0.1)?.asset.category).toBe("music");
    expect(pick(assets, [], b, () => 0.9)?.asset.category).toBe("other");
  });

  it("ignora categorías del pool sin audios", () => {
    const b = block({
      rotation: rotation({
        pool: [
          { category: "music", weight: 1 },
          { category: "other", weight: 100 },
        ],
      }),
    });
    expect(pick([asset("m")], [], b, () => 0.99)?.asset.category).toBe("music");
  });

  it("intercala un jingle cada N temas", () => {
    const b = block({
      rotation: rotation({
        insertions: [{ category: "jingle", everyTracks: 2 }],
        artistSeparation: 0,
        trackSeparationMinutes: 0,
      }),
    });
    const assets = [asset("m1"), asset("m2"), asset("j1", "jingle")];
    const history: PlayRecord[] = [];
    const sequence: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = pick(assets, history, b)!;
      sequence.push(next.asset.category);
      history.unshift(play(next.asset.id, next.asset.category, next.asset.artist));
    }
    expect(sequence).toEqual(["music", "music", "jingle", "music", "music", "jingle"]);
  });

  it("no intercala si la categoría no tiene audios", () => {
    const b = block({ rotation: rotation({ insertions: [{ category: "jingle", everyTracks: 1 }] }) });
    const history = [play("m1"), play("m2")];
    expect(pick([asset("m3")], history, b)?.asset.id).toBe("m3");
  });

  it("separa artistas y repeticiones recientes", () => {
    const assets = [asset("a", "music", "Banda"), asset("b", "music", "Banda"), asset("c", "music", "Otro")];
    // Acaba de sonar "a" de Banda: no pueden repetirse ni "a" ni otro tema de Banda.
    const history = [play("a", "music", "Banda")];
    expect(pick(assets, history)?.asset.id).toBe("c");
    expect(pick(assets, history)?.reason).toBe("rotation");
  });

  it("compara artistas sin distinguir mayúsculas ni espacios", () => {
    const assets = [asset("a", "music", "BANDA "), asset("b", "music", "otro")];
    expect(pick(assets, [play("z", "music", "banda")])?.asset.id).toBe("b");
  });

  it("afloja la separación de artista si no hay alternativa", () => {
    const assets = [asset("a", "music", "Banda"), asset("b", "music", "Banda")];
    const result = pick(assets, [play("a", "music", "Banda", 5)]);
    expect(result?.asset.id).toBe("b");
    expect(result?.reason).toBe("relaxed");
  });

  it("si todo sonó hace poco, elige el menos reciente", () => {
    const assets = [asset("a"), asset("b")];
    const history = [play("b", "music", "x", 5), play("a", "music", "y", 30)];
    const result = pick(assets, history);
    expect(result?.asset.id).toBe("a");
    expect(result?.reason).toBe("relaxed");
  });

  it("permite repetir un audio pasado el tiempo de separación", () => {
    const history = [play("a", "music", "x", 300)];
    const result = pick([asset("a")], history);
    expect(result?.asset.id).toBe("a");
    expect(result?.reason).toBe("rotation");
  });

  it("es determinista con la misma fuente de azar", () => {
    const assets = [asset("a"), asset("b"), asset("c"), asset("d")];
    const first = pick(assets, [], block(), () => 0.6);
    const second = pick([...assets].reverse(), [], block(), () => 0.6);
    expect(first?.asset.id).toBe(second?.asset.id);
  });
});
