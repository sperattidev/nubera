import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, plays, sql } from "@nubera/db";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAdvertiser, addAgent, addAllDayBlock, addAsset, addCampaign } from "./testing/fixtures.js";

const START = new Date("2026-10-06T15:00:00Z");
let clock = START;
const tick = () => {
  clock = new Date(clock.getTime() + 60_000);
};

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let token: string;

beforeAll(async () => {
  harness = await createHarness({ now: () => clock, random: () => 0 });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  clock = START;
  fx = await harness.reset();
  token = await addAgent(harness.db, fx.stationA);
});

const rotation = (spotsPerBreak: number) => ({
  pool: [{ category: "music", weight: 1 }],
  artistSeparation: 0,
  trackSeparationMinutes: 0,
  ads: { everyTracks: 2, spotsPerBreak },
});

async function next() {
  const response = await harness.app.inject({ method: "GET", url: "/playout/next", headers: { authorization: `Bearer ${token}` } });
  tick();
  return response;
}

/**
 * Pide n audios, los confirma como emitidos y devuelve sus categorías en orden.
 * Al terminar avanza el reloj: el reporte excluye el instante exacto "ahora", y
 * sin esto la última emisión quedaría fuera según qué campaña desempate el azar.
 */
async function playSequence(n: number): Promise<{ category: string; title: string }[]> {
  const sequence: { category: string; title: string }[] = [];
  for (let i = 0; i < n; i++) {
    const response = await next();
    expect(response.statusCode).toBe(200);
    const { playId, category, title } = response.json();
    await harness.app.inject({ method: "POST", url: `/playout/plays/${playId}/started`, headers: { authorization: `Bearer ${token}` } });
    sequence.push({ category, title });
  }
  tick();
  return sequence;
}

const categories = (sequence: { category: string }[]) => sequence.map((item) => item.category);

async function setup(options: { industries: [string | null, string | null]; spotsPerBreak: number }) {
  await addAllDayBlock(harness.db, fx.stationA, rotation(options.spotsPerBreak));
  await addAsset(harness.db, fx.stationA, { title: "Tema" });
  const advertiserA = await addAdvertiser(harness.db, fx.tenantA, { name: "Anunciante A", industry: options.industries[0] });
  const advertiserB = await addAdvertiser(harness.db, fx.tenantA, { name: "Anunciante B", industry: options.industries[1] });
  const spotA = await addAsset(harness.db, fx.stationA, { title: "Aviso A", category: "ad" });
  const spotB = await addAsset(harness.db, fx.stationA, { title: "Aviso B", category: "ad" });
  const campaignA = await addCampaign(harness.db, fx.stationA, advertiserA.id, [spotA.id], { name: "Campaña A" });
  const campaignB = await addCampaign(harness.db, fx.stationA, advertiserB.id, [spotB.id], { name: "Campaña B" });
  return { advertiserA, advertiserB, campaignA, campaignB };
}

describe("tandas publicitarias en la cola", () => {
  it("emite una tanda cada N temas con anunciantes distintos", async () => {
    await setup({ industries: ["supermercado", "farmacia"], spotsPerBreak: 2 });
    const sequence = await playSequence(8);
    expect(categories(sequence)).toEqual(["music", "music", "ad", "ad", "music", "music", "ad", "ad"]);
    expect(new Set([sequence[2]!.title, sequence[3]!.title]).size).toBe(2);
  });

  it("no pone dos avisos del mismo rubro en una tanda", async () => {
    await setup({ industries: ["Supermercado", "supermercado "], spotsPerBreak: 2 });
    expect(categories(await playSequence(6))).toEqual(["music", "music", "ad", "music", "music", "ad"]);
  });

  it("sin rubro cargado, los anunciantes distintos sí comparten tanda", async () => {
    await setup({ industries: [null, null], spotsPerBreak: 2 });
    expect(categories(await playSequence(4))).toEqual(["music", "music", "ad", "ad"]);
  });

  it("sigue con música si no hay campañas vigentes", async () => {
    const { campaignA, campaignB } = await setup({ industries: ["a", "b"], spotsPerBreak: 2 });
    for (const campaign of [campaignA, campaignB]) {
      await harness.db.execute(sql`update campaigns set ends_on = '2026-09-30' where id = ${campaign.id}`);
    }
    expect(categories(await playSequence(5))).toEqual(["music", "music", "music", "music", "music"]);
  });

  it("no emite campañas ni anunciantes inactivos", async () => {
    const { advertiserB, campaignA } = await setup({ industries: ["a", "b"], spotsPerBreak: 2 });
    await harness.db.execute(sql`update campaigns set is_active = false where id = ${campaignA.id}`);
    await harness.db.execute(sql`update advertisers set is_active = false where id = ${advertiserB.id}`);
    expect(categories(await playSequence(5))).toEqual(["music", "music", "music", "music", "music"]);
  });

  it("respeta el tope diario de emisiones", async () => {
    await addAllDayBlock(harness.db, fx.stationA, rotation(1));
    await addAsset(harness.db, fx.stationA, { title: "Tema" });
    const advertiser = await addAdvertiser(harness.db, fx.tenantA, { name: "Anunciante" });
    const spot = await addAsset(harness.db, fx.stationA, { title: "Aviso", category: "ad" });
    await addCampaign(harness.db, fx.stationA, advertiser.id, [spot.id], { dailyPlays: 2 });
    const ads = categories(await playSequence(12)).filter((category) => category === "ad");
    expect(ads).toHaveLength(2);
  });

  it("respeta la franja horaria de la campaña", async () => {
    await addAllDayBlock(harness.db, fx.stationA, rotation(1));
    await addAsset(harness.db, fx.stationA, { title: "Tema" });
    const advertiser = await addAdvertiser(harness.db, fx.tenantA, { name: "Anunciante" });
    const spot = await addAsset(harness.db, fx.stationA, { title: "Aviso", category: "ad" });
    // Son las 12:00 locales; la campaña solo corre de 18:00 a 20:00.
    await addCampaign(harness.db, fx.stationA, advertiser.id, [spot.id], { startMinute: 18 * 60, endMinute: 20 * 60 });
    expect(categories(await playSequence(6))).not.toContain("ad");
  });

  it("los avisos quedan asociados a su campaña en el historial", async () => {
    const { campaignA, campaignB } = await setup({ industries: ["a", "b"], spotsPerBreak: 1 });
    await playSequence(3);
    const ads = await harness.db.select({ campaignId: plays.campaignId }).from(plays).where(eq(plays.category, "ad"));
    expect(ads).toHaveLength(1);
    expect([campaignA.id, campaignB.id]).toContain(ads[0]!.campaignId);
    const music = await harness.db.select({ campaignId: plays.campaignId }).from(plays).where(eq(plays.category, "music"));
    expect(music.every((play) => play.campaignId === null)).toBe(true);
  });
});

describe("reporte de emisiones del anunciante", () => {
  let owner: string;

  beforeEach(async () => {
    owner = await login(harness.app, fx.email.owner);
  });

  const report = (advertiserId: string, query = "", cookie = owner) =>
    harness.app.inject({ method: "GET", url: `/advertisers/${advertiserId}/report${query}`, headers: { cookie } });

  it("resume lo emitido por día y por campaña", async () => {
    const { advertiserA, campaignA } = await setup({ industries: ["a", "b"], spotsPerBreak: 2 });
    await playSequence(8);

    const response = await report(advertiserA.id);
    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data.advertiser).toEqual({ id: advertiserA.id, name: "Anunciante A" });
    expect(data.total).toBe(2);
    expect(data.truncated).toBe(false);
    expect(data.perDay).toEqual([{ date: "2026-10-06", count: 2 }]);
    expect(data.perCampaign).toEqual([{ campaignId: campaignA.id, name: "Campaña A", count: 2 }]);
    expect(data.items[0]).toMatchObject({ station: "FM A", campaign: "Campaña A", spot: "Aviso A" });
    expect(data.items[0].localTime).toMatch(/^2026-10-06 1[2-3]:\d\d:\d\d$/);
  });

  it("solo cuenta avisos confirmados como emitidos", async () => {
    const { advertiserA } = await setup({ industries: ["a", "b"], spotsPerBreak: 2 });
    for (let i = 0; i < 4; i++) {
      await next(); // elegidos pero sin confirmar
    }
    expect((await report(advertiserA.id)).json().total).toBe(0);
  });

  it("filtra por período y por emisora", async () => {
    const { advertiserA } = await setup({ industries: ["a", "b"], spotsPerBreak: 2 });
    await playSequence(4);
    const url = (query: string) => report(advertiserA.id, query);
    expect((await url("?from=2026-10-07T00:00:00Z&to=2026-10-08T00:00:00Z")).json().total).toBe(0);
    expect((await url("?from=2026-10-06T00:00:00Z&to=2026-10-07T00:00:00Z")).json().total).toBe(1);
    expect((await url(`?stationId=${fx.stationB}`)).json().total).toBe(0);
    expect((await url(`?stationId=${fx.stationA}`)).json().total).toBe(1);
  });

  it("valida el período", async () => {
    const { advertiserA } = await setup({ industries: ["a", "b"], spotsPerBreak: 2 });
    expect((await report(advertiserA.id, "?from=2026-10-08T00:00:00Z&to=2026-10-07T00:00:00Z")).statusCode).toBe(400);
    expect((await report(advertiserA.id, "?from=2024-01-01T00:00:00Z&to=2026-10-07T00:00:00Z")).statusCode).toBe(400);
    expect((await report(advertiserA.id, "?from=no-es-fecha")).statusCode).toBe(400);
    expect((await report(advertiserA.id, "?format=pdf")).statusCode).toBe(400);
  });

  it("exporta CSV con BOM, fechas locales y celdas a salvo de fórmulas", async () => {
    await addAllDayBlock(harness.db, fx.stationA, rotation(1));
    await addAsset(harness.db, fx.stationA, { title: "Tema" });
    const advertiser = await addAdvertiser(harness.db, fx.tenantA, { name: "Óptica Ñandú" });
    const spot = await addAsset(harness.db, fx.stationA, { title: '=SUMA(1,2) "oferta"', category: "ad" });
    await addCampaign(harness.db, fx.stationA, advertiser.id, [spot.id], { name: "Verano, 2026" });
    await playSequence(3);

    const response = await report(advertiser.id, "?format=csv");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="certificado-optica-nandu-2026-09-\d\d_2026-10-06\.csv"$/);
    expect(response.body.startsWith("\uFEFF")).toBe(true);
    const lines = response.body.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("fecha_hora_local,emisora,campana,aviso");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^"2026-10-06 1\d:\d\d:\d\d","FM A","Verano, 2026","'=SUMA\(1,2\) ""oferta"""$/);
  });

  it("exige permiso y respeta el aislamiento entre clientes", async () => {
    const { advertiserA } = await setup({ industries: ["a", "b"], spotsPerBreak: 2 });
    const announcer = await login(harness.app, fx.email.announcer);
    const programmer = await login(harness.app, fx.email.programmer);
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await harness.app.inject({ method: "GET", url: `/advertisers/${advertiserA.id}/report` })).statusCode).toBe(401);
    expect((await report(advertiserA.id, "", announcer)).statusCode).toBe(403);
    expect((await report(advertiserA.id, "", programmer)).statusCode).toBe(200);
    expect((await report(advertiserA.id, "", other)).statusCode).toBe(404);
  });
});
