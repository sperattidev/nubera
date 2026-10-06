import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAdvertiser, addAsset } from "./testing/fixtures.js";

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let sales: string;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
  sales = await login(harness.app, fx.email.sales);
});

type Method = "GET" | "POST" | "PUT" | "DELETE";
const call = (method: Method, url: string, cookie: string, payload?: unknown) =>
  harness.app.inject({ method, url, headers: { cookie }, payload: payload as object });

const advertiser = { name: "Supermercado Sur", industry: "supermercado", contactEmail: "Compras@Sur.test", contactPhone: "3465-123456" };

describe("anunciantes", () => {
  it("crea, lista, edita y borra", async () => {
    const created = await call("POST", "/advertisers", sales, advertiser);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "Supermercado Sur", industry: "supermercado", contactEmail: "compras@sur.test", isActive: true });
    const id = created.json().id as string;

    await call("POST", "/advertisers", sales, { name: "Farmacia Central" });
    const list = await call("GET", "/advertisers", sales);
    expect(list.json().items.map((a: { name: string }) => a.name)).toEqual(["Farmacia Central", "Supermercado Sur"]);
    expect(list.json().items[0].industry).toBeNull();

    const updated = await call("PUT", `/advertisers/${id}`, sales, { ...advertiser, isActive: false, notes: "Pausado por mora" });
    expect(updated.json()).toMatchObject({ isActive: false, notes: "Pausado por mora" });
    expect((await call("GET", `/advertisers/${id}`, sales)).json().isActive).toBe(false);

    expect((await call("DELETE", `/advertisers/${id}`, sales)).statusCode).toBe(204);
    expect((await call("GET", `/advertisers/${id}`, sales)).statusCode).toBe(404);
  });

  it("rechaza nombres repetidos y datos inválidos", async () => {
    await call("POST", "/advertisers", sales, advertiser);
    expect((await call("POST", "/advertisers", sales, advertiser)).statusCode).toBe(409);
    expect((await call("POST", "/advertisers", sales, { name: " " })).statusCode).toBe(400);
    expect((await call("POST", "/advertisers", sales, { name: "X", contactEmail: "no-es-email" })).statusCode).toBe(400);
  });

  it("el vendedor administra; el programador solo lee; el locutor no accede", async () => {
    const programmer = await login(harness.app, fx.email.programmer);
    const announcer = await login(harness.app, fx.email.announcer);
    expect((await call("GET", "/advertisers", programmer)).statusCode).toBe(200);
    expect((await call("POST", "/advertisers", programmer, advertiser)).statusCode).toBe(403);
    expect((await call("GET", "/advertisers", announcer)).statusCode).toBe(403);
    expect((await harness.app.inject({ method: "GET", url: "/advertisers" })).statusCode).toBe(401);
  });

  it("cada cliente ve solo sus anunciantes", async () => {
    const created = await call("POST", "/advertisers", sales, advertiser);
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await call("GET", "/advertisers", other)).json().items).toHaveLength(0);
    expect((await call("GET", `/advertisers/${created.json().id}`, other)).statusCode).toBe(404);
    expect((await call("PUT", `/advertisers/${created.json().id}`, other, advertiser)).statusCode).toBe(404);
    expect((await call("DELETE", `/advertisers/${created.json().id}`, other)).statusCode).toBe(404);
    // El mismo nombre sí puede existir en otro cliente.
    expect((await call("POST", "/advertisers", other, advertiser)).statusCode).toBe(201);
  });
});

describe("tandas en la grilla", () => {
  it("un bloque puede configurar cada cuántos temas hay tanda y cuántos avisos lleva", async () => {
    const programmer = await login(harness.app, fx.email.programmer);
    const block = (ads: unknown) => ({
      name: "Mañana",
      days: [1, 2, 3],
      start: "06:00",
      end: "12:00",
      rotation: { pool: [{ category: "music", weight: 1 }], ads },
    });
    const url = `/stations/${fx.stationA}/schedule`;

    const created = await call("POST", url, programmer, block({ everyTracks: 4, spotsPerBreak: 3 }));
    expect(created.statusCode).toBe(201);
    expect(created.json().rotation.ads).toEqual({ everyTracks: 4, spotsPerBreak: 3 });

    expect((await call("POST", url, programmer, block({ everyTracks: 0, spotsPerBreak: 3 }))).statusCode).toBe(400);
    expect((await call("POST", url, programmer, block({ everyTracks: 4, spotsPerBreak: 7 }))).statusCode).toBe(400);
  });
});

describe("campañas", () => {
  const campaignsUrl = () => `/stations/${fx.stationA}/campaigns`;
  let advertiserId: string;
  let spot1: string;
  let spot2: string;

  const body = (overrides: Record<string, unknown> = {}) => ({
    advertiserId,
    name: "Octubre",
    startsOn: "2026-10-01",
    endsOn: "2026-10-31",
    assetIds: [spot1],
    ...overrides,
  });

  beforeEach(async () => {
    advertiserId = (await addAdvertiser(harness.db, fx.tenantA, { name: "Supermercado Sur", industry: "supermercado" })).id;
    spot1 = (await addAsset(harness.db, fx.stationA, { title: "Spot 1", category: "ad" })).id;
    spot2 = (await addAsset(harness.db, fx.stationA, { title: "Spot 2", category: "ad" })).id;
  });

  it("crea una campaña con valores por defecto y la devuelve con sus avisos", async () => {
    const created = await call("POST", campaignsUrl(), sales, body({ dailyPlays: 20, weight: 2, assetIds: [spot1, spot2, spot1] }));
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      advertiserName: "Supermercado Sur",
      name: "Octubre",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      dailyPlays: 20,
      weight: 2,
      days: [1, 2, 3, 4, 5, 6, 7],
      start: "00:00",
      end: "24:00",
      isActive: true,
    });
    expect(created.json().assets.map((a: { title: string }) => a.title).sort()).toEqual(["Spot 1", "Spot 2"]);
  });

  it("lista, filtra, edita y borra", async () => {
    const first = (await call("POST", campaignsUrl(), sales, body())).json();
    const second = (await call("POST", campaignsUrl(), sales, body({ name: "Noviembre", startsOn: "2026-11-01", endsOn: "2026-11-30", isActive: false }))).json();

    const all = await call("GET", campaignsUrl(), sales);
    expect(all.json().items.map((c: { name: string }) => c.name)).toEqual(["Octubre", "Noviembre"]);
    expect((await call("GET", `${campaignsUrl()}?active=false`, sales)).json().items).toHaveLength(1);
    expect((await call("GET", `${campaignsUrl()}?advertiserId=${advertiserId}`, sales)).json().items).toHaveLength(2);
    expect((await call("GET", `${campaignsUrl()}?advertiserId=00000000-0000-4000-8000-000000000000`, sales)).json().items).toHaveLength(0);

    const edited = await call("PUT", `${campaignsUrl()}/${first.id}`, sales, body({ name: "Octubre bis", assetIds: [spot2], start: "08:00", end: "20:00", days: [1, 2, 3] }));
    expect(edited.json()).toMatchObject({ name: "Octubre bis", start: "08:00", end: "20:00", days: [1, 2, 3] });
    expect(edited.json().assets).toEqual([{ id: spot2, title: "Spot 2" }]);

    expect((await call("DELETE", `${campaignsUrl()}/${second.id}`, sales)).statusCode).toBe(204);
    expect((await call("GET", `${campaignsUrl()}/${second.id}`, sales)).statusCode).toBe(404);
    expect((await call("GET", campaignsUrl(), sales)).json().items).toHaveLength(1);
  });

  it("valida fechas, franja, tope y avisos", async () => {
    const invalid = [
      body({ endsOn: "2026-09-30" }),
      body({ startsOn: "01/10/2026" }),
      body({ start: "20:00", end: "08:00" }),
      body({ dailyPlays: 0 }),
      body({ weight: 0 }),
      body({ days: [8] }),
      body({ assetIds: [] }),
      body({ name: " " }),
    ];
    for (const payload of invalid) {
      expect((await call("POST", campaignsUrl(), sales, payload)).statusCode).toBe(400);
    }
  });

  it("los avisos deben ser audios ad de la misma emisora", async () => {
    const music = await addAsset(harness.db, fx.stationA, { title: "Tema", category: "music" });
    const foreign = await addAsset(harness.db, fx.stationB, { title: "Ajeno", category: "ad" });
    expect((await call("POST", campaignsUrl(), sales, body({ assetIds: [music.id] }))).statusCode).toBe(422);
    expect((await call("POST", campaignsUrl(), sales, body({ assetIds: [foreign.id] }))).statusCode).toBe(422);
    expect((await call("POST", campaignsUrl(), sales, body({ assetIds: [spot1, music.id] }))).statusCode).toBe(422);
  });

  it("el anunciante debe ser del mismo cliente", async () => {
    const other = await login(harness.app, fx.email.otherOwner);
    const foreignAdvertiser = (await call("POST", "/advertisers", other, { name: "Ajeno" })).json().id as string;
    expect((await call("POST", campaignsUrl(), sales, body({ advertiserId: foreignAdvertiser }))).statusCode).toBe(404);
  });

  it("permisos y aislamiento entre clientes", async () => {
    const created = (await call("POST", campaignsUrl(), sales, body())).json();
    const programmer = await login(harness.app, fx.email.programmer);
    expect((await call("GET", campaignsUrl(), programmer)).statusCode).toBe(200);
    expect((await call("POST", campaignsUrl(), programmer, body())).statusCode).toBe(403);

    const other = await login(harness.app, fx.email.otherOwner);
    expect((await call("GET", campaignsUrl(), other)).statusCode).toBe(404);
    expect((await call("POST", campaignsUrl(), other, body())).statusCode).toBe(404);
    expect((await call("PUT", `${campaignsUrl()}/${created.id}`, other, body())).statusCode).toBe(404);
    expect((await call("DELETE", `${campaignsUrl()}/${created.id}`, other)).statusCode).toBe(404);
  });

  it("borrar el anunciante borra sus campañas", async () => {
    await call("POST", campaignsUrl(), sales, body());
    await call("DELETE", `/advertisers/${advertiserId}`, sales);
    expect((await call("GET", campaignsUrl(), sales)).json().items).toHaveLength(0);
  });
});
