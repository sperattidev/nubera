import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agentTokens, plays, sql } from "@nubera/db";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAdvertiser, addAgent, addAllDayBlock, addAsset, addCampaign } from "./testing/fixtures.js";

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let owner: string;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
  owner = await login(harness.app, fx.email.owner);
});

const get = (url: string, cookie = owner) => harness.app.inject({ method: "GET", url, headers: { cookie } });
const onAir = (stationId = fx.stationA, cookie = owner) => get(`/stations/${stationId}/on-air`, cookie);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function addPlay(
  title: string,
  options: { started?: number; picked: number; category?: "music" | "ad"; artist?: string; campaignId?: string },
) {
  await harness.db.insert(plays).values({
    stationId: fx.stationA,
    title,
    artist: options.artist ?? null,
    category: options.category ?? "music",
    campaignId: options.campaignId ?? null,
    pickedAt: minutesAgo(options.picked),
    startedAt: options.started === undefined ? null : minutesAgo(options.started),
  });
}

describe("GET /stations", () => {
  it("lista solo las emisoras del cliente, para cualquier rol", async () => {
    for (const email of Object.values(fx.email).filter((value) => value.endsWith("@a.test"))) {
      const cookie = await login(harness.app, email);
      const response = await get("/stations", cookie);
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([
        { id: fx.stationA, name: "FM A", slug: "fm-a", timezone: "America/Argentina/Buenos_Aires" },
      ]);
    }
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await get("/stations", other)).json().items.map((s: { id: string }) => s.id)).toEqual([fx.stationB]);
  });

  it("exige sesión", async () => {
    expect((await harness.app.inject({ method: "GET", url: "/stations" })).statusCode).toBe(401);
  });
});

describe("GET /stations/:id/on-air", () => {
  it("sin emisiones devuelve un estado vacío", async () => {
    const body = (await onAir()).json();
    expect(body).toMatchObject({ current: null, queued: [], recent: [], block: null });
    expect(body.engine).toEqual({ online: false, lastSeenAt: null });
    expect(body.timezone).toBe("America/Argentina/Buenos_Aires");
  });

  it("separa lo que suena, lo que viene y lo anterior", async () => {
    await addPlay("Viejo", { picked: 30, started: 29 });
    await addPlay("Anterior", { picked: 20, started: 19 });
    await addPlay("Actual", { picked: 10, started: 9 });
    await addPlay("Siguiente 1", { picked: 5 });
    await addPlay("Siguiente 2", { picked: 4 });
    await addPlay("Elegido antes de que empezara el actual", { picked: 15 });

    const body = (await onAir()).json();
    expect(body.current.title).toBe("Actual");
    expect(body.recent.map((p: { title: string }) => p.title)).toEqual(["Anterior", "Viejo"]);
    expect(body.queued.map((p: { title: string }) => p.title)).toEqual(["Siguiente 1", "Siguiente 2"]);
  });

  it("muestra el anunciante de los avisos", async () => {
    const advertiser = await addAdvertiser(harness.db, fx.tenantA, { name: "Supermercado Sur" });
    const spot = await addAsset(harness.db, fx.stationA, { title: "Aviso", category: "ad" });
    const campaign = await addCampaign(harness.db, fx.stationA, advertiser.id, [spot.id]);
    await addPlay("Aviso", { picked: 2, started: 1, category: "ad", campaignId: campaign.id });
    await addPlay("Tema", { picked: 4, started: 3, artist: "Banda" });

    const body = (await onAir()).json();
    expect(body.current).toMatchObject({ title: "Aviso", category: "ad", advertiser: "Supermercado Sur" });
    expect(body.recent[0]).toMatchObject({ title: "Tema", artist: "Banda", advertiser: null });
  });

  it("limita el historial reciente a 10 emisiones", async () => {
    for (let i = 0; i < 14; i++) {
      await addPlay(`Tema ${i}`, { picked: 100 - i, started: 99 - i });
    }
    const body = (await onAir()).json();
    expect(body.current.title).toBe("Tema 13");
    expect(body.recent).toHaveLength(10);
  });

  it("informa si el motor está conectado", async () => {
    const token = await addAgent(harness.db, fx.stationA);
    expect((await onAir()).json().engine.online).toBe(false);

    await harness.app.inject({ method: "GET", url: "/playout/next", headers: { authorization: `Bearer ${token}` } });
    const connected = (await onAir()).json().engine;
    expect(connected.online).toBe(true);
    expect(connected.lastSeenAt).toBeTruthy();

    await harness.db.update(agentTokens).set({ lastSeenAt: minutesAgo(10) });
    expect((await onAir()).json().engine.online).toBe(false);
    await harness.db.execute(sql`update agent_tokens set revoked_at = now()`);
    expect((await onAir()).json().engine.lastSeenAt).toBeNull();
  });

  it("informa el bloque vigente", async () => {
    await addAllDayBlock(harness.db, fx.stationA, { pool: [{ category: "music", weight: 1 }] });
    const body = (await onAir()).json();
    expect(body.block).toMatchObject({ name: "Todo el día", start: "00:00", end: "24:00" });
    expect(body.block.rotation.pool).toEqual([{ category: "music", weight: 1 }]);
  });

  it("todos los roles con historial pueden verlo; otro cliente no", async () => {
    for (const role of ["programmer", "announcer", "sales"] as const) {
      const cookie = await login(harness.app, fx.email[role]);
      expect((await onAir(fx.stationA, cookie)).statusCode).toBe(200);
    }
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await onAir(fx.stationA, other)).statusCode).toBe(404);
    expect((await harness.app.inject({ method: "GET", url: `/stations/${fx.stationA}/on-air` })).statusCode).toBe(401);
  });
});
