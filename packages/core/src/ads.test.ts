import { describe, expect, it } from "vitest";
import {
  adBreakDue,
  formatLocal,
  localDate,
  pickSpot,
  rotationSchema,
  startOfLocalDay,
  type AdCampaign,
  type PlayRecord,
  type PoolAsset,
} from "./index.js";

const TZ = "America/Argentina/Buenos_Aires";
// Martes 2026-10-06, 12:00 en Buenos Aires.
const NOW = new Date("2026-10-06T15:00:00Z");

const spot = (id: string): PoolAsset => ({ id, title: `Aviso ${id}`, artist: null, category: "ad" });

const campaign = (id: string, overrides: Partial<AdCampaign> = {}): AdCampaign => ({
  id,
  advertiserId: `anunciante-${id}`,
  industry: `rubro-${id}`,
  weight: 1,
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  dailyPlays: null,
  days: [1, 2, 3, 4, 5, 6, 7],
  startMinute: 0,
  endMinute: 1440,
  spots: [spot(`${id}-1`)],
  ...overrides,
});

const adPlay = (c: AdCampaign, minutesAgo = 1): PlayRecord => ({
  assetId: c.spots[0]!.id,
  artist: null,
  category: "ad",
  at: new Date(NOW.getTime() - minutesAgo * 60_000),
  campaignId: c.id,
  advertiserId: c.advertiserId,
  industry: c.industry,
});

const musicPlay = (id: string): PlayRecord => ({ assetId: id, artist: id, category: "music", at: NOW });

const pick = (campaigns: AdCampaign[], history: PlayRecord[] = [], playsToday = new Map<string, number>(), random = () => 0) =>
  pickSpot({ campaigns, history, playsToday, now: NOW, timeZone: TZ, random });

describe("fechas locales", () => {
  it("calcula la fecha y el inicio del día en la zona de la emisora", () => {
    // 01:00Z del martes = lunes 22:00 en Buenos Aires.
    const lateMonday = new Date("2026-10-06T01:00:00Z");
    expect(localDate(lateMonday, TZ)).toBe("2026-10-05");
    expect(startOfLocalDay(lateMonday, TZ).toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(startOfLocalDay(NOW, TZ).toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });

  it("formatea fecha y hora local", () => {
    expect(formatLocal(NOW, TZ)).toBe("2026-10-06 12:00:00");
  });
});

describe("configuración de tandas", () => {
  it("es opcional y se valida", () => {
    expect(rotationSchema.parse({ pool: [{ category: "music", weight: 1 }] }).ads).toBeUndefined();
    const withAds = rotationSchema.parse({
      pool: [{ category: "music", weight: 1 }],
      ads: { everyTracks: 4, spotsPerBreak: 2 },
    });
    expect(withAds.ads).toEqual({ everyTracks: 4, spotsPerBreak: 2 });
    expect(
      rotationSchema.safeParse({ pool: [{ category: "music", weight: 1 }], ads: { everyTracks: 0, spotsPerBreak: 2 } }).success,
    ).toBe(false);
  });
});

describe("adBreakDue", () => {
  const ads = { everyTracks: 3, spotsPerBreak: 2 };
  const c = campaign("a");

  it("corresponde tras N emisiones sin avisos", () => {
    expect(adBreakDue([], ads)).toBe(false);
    expect(adBreakDue([musicPlay("1"), musicPlay("2")], ads)).toBe(false);
    expect(adBreakDue([musicPlay("1"), musicPlay("2"), musicPlay("3")], ads)).toBe(true);
  });

  it("continúa la tanda hasta completar los avisos", () => {
    expect(adBreakDue([adPlay(c), musicPlay("1")], ads)).toBe(true);
    expect(adBreakDue([adPlay(c), adPlay(c), musicPlay("1")], ads)).toBe(false);
  });

  it("cuenta las emisiones desde el último aviso", () => {
    const history = [musicPlay("1"), musicPlay("2"), adPlay(c), musicPlay("3")];
    expect(adBreakDue(history, ads)).toBe(false);
    expect(adBreakDue([musicPlay("0"), ...history], ads)).toBe(true);
  });
});

describe("pickSpot", () => {
  it("devuelve null si no hay campañas elegibles", () => {
    expect(pick([])).toBeNull();
    expect(pick([campaign("a", { spots: [] })])).toBeNull();
  });

  it("respeta la vigencia (fechas inclusivas)", () => {
    expect(pick([campaign("a", { endsOn: "2026-10-05" })])).toBeNull();
    expect(pick([campaign("a", { startsOn: "2026-10-07" })])).toBeNull();
    expect(pick([campaign("a", { startsOn: "2026-10-06", endsOn: "2026-10-06" })])?.campaign.id).toBe("a");
  });

  it("respeta días y franja horaria (fin exclusivo)", () => {
    expect(pick([campaign("a", { days: [1, 3] })])).toBeNull();
    expect(pick([campaign("a", { days: [2] })])?.campaign.id).toBe("a");
    expect(pick([campaign("a", { startMinute: 13 * 60 })])).toBeNull();
    expect(pick([campaign("a", { endMinute: 12 * 60 })])).toBeNull();
    expect(pick([campaign("a", { startMinute: 11 * 60, endMinute: 12 * 60 + 1 })])?.campaign.id).toBe("a");
  });

  it("respeta el tope diario", () => {
    const c = campaign("a", { dailyPlays: 2 });
    expect(pick([c], [], new Map([["a", 1]]))?.campaign.id).toBe("a");
    expect(pick([c], [], new Map([["a", 2]]))).toBeNull();
  });

  it("no repite el anunciante ni el rubro dentro de una tanda", () => {
    const a = campaign("a", { industry: "supermercado" });
    const sameIndustry = campaign("b", { industry: "Supermercado " });
    const other = campaign("c", { industry: "farmacia" });
    expect(pick([a, sameIndustry, other], [adPlay(a)])?.campaign.id).toBe("c");
    // Mismo anunciante con otra campaña.
    const sameAdvertiser = campaign("d", { advertiserId: a.advertiserId, industry: "otro" });
    expect(pick([sameAdvertiser], [adPlay(a)])).toBeNull();
  });

  it("termina la tanda antes de violar la exclusividad de rubro", () => {
    const a = campaign("a", { industry: "supermercado" });
    const b = campaign("b", { industry: "supermercado" });
    expect(pick([a, b], [adPlay(a)])).toBeNull();
  });

  it("la exclusividad solo aplica dentro de la tanda en curso", () => {
    const a = campaign("a", { industry: "supermercado" });
    const b = campaign("b", { industry: "supermercado" });
    // Entre la tanda anterior y ésta sonó música.
    expect(pick([b], [musicPlay("1"), adPlay(a)])?.campaign.id).toBe("b");
  });

  it("los anunciantes sin rubro no se bloquean entre sí", () => {
    const a = campaign("a", { industry: null });
    const b = campaign("b", { industry: null });
    expect(pick([b], [adPlay(a)])?.campaign.id).toBe("b");
  });

  it("reparte según el peso y lo emitido hoy", () => {
    const light = campaign("a", { weight: 1 });
    const heavy = campaign("b", { weight: 3 });
    // 3 emisiones de la liviana (score 3) contra 3 de la pesada (score 1): gana la pesada.
    expect(pick([light, heavy], [], new Map([["a", 3], ["b", 3]]))?.campaign.id).toBe("b");
    // La liviana sin emisiones tiene el menor score.
    expect(pick([light, heavy], [], new Map([["b", 3]]))?.campaign.id).toBe("a");
  });

  it("rota los avisos de la campaña: primero el que nunca sonó, luego el más antiguo", () => {
    const c = campaign("a", { spots: [spot("x"), spot("y"), spot("z")] });
    const played = (id: string, minutesAgo: number): PlayRecord => ({
      assetId: id,
      artist: null,
      category: "ad",
      at: new Date(NOW.getTime() - minutesAgo * 60_000),
    });
    expect(pick([c], [played("x", 5)])?.asset.id).toBe("y");
    expect(pick([c], [played("z", 1), played("y", 2), played("x", 3)])?.asset.id).toBe("x");
  });

  it("es determinista con la misma fuente de azar", () => {
    const campaigns = [campaign("a"), campaign("b"), campaign("c")];
    const first = pick(campaigns, [], new Map(), () => 0.5);
    const second = pick([...campaigns].reverse(), [], new Map(), () => 0.5);
    expect(first?.campaign.id).toBe(second?.campaign.id);
  });
});
