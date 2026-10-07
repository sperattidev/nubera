import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, plays, stations } from "@nubera/db";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAdvertiser, addAsset, addCampaign } from "./testing/fixtures.js";

const START = new Date("2026-10-10T12:00:00Z");
let clock = START;

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let sales: string;
let advertiserId: string;

beforeAll(async () => {
  harness = await createHarness({ now: () => clock, loginRateLimitMax: 1000 });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  clock = START;
  fx = await harness.reset();
  sales = await login(harness.app, fx.email.sales);
  advertiserId = (await addAdvertiser(harness.db, fx.tenantA, { name: "Ferretería Sur" })).id;
});

const PERIOD = { from: "2026-10-01T00:00:00Z", to: "2026-10-31T00:00:00Z" };

const send = (method: "GET" | "POST" | "DELETE", url: string, cookie: string | null = sales, payload?: unknown) =>
  harness.app.inject({ method, url, headers: cookie ? { cookie } : {}, payload: payload as object });

const createLink = (body: object = {}, cookie: string | null = sales, advertiser = advertiserId) =>
  send("POST", `/advertisers/${advertiser}/certificate-links`, cookie, { stationId: fx.stationA, ...PERIOD, ...body });

const publicGet = (token: string, query = "") => send("GET", `/public/certificates/${token}${query}`, null);

/** Un aviso del anunciante emitido en la fecha indicada. */
async function addEmission(at: string, options: { advertiser?: string; stationId?: string; title?: string } = {}) {
  const stationId = options.stationId ?? fx.stationA;
  const spot = await addAsset(harness.db, stationId, { title: options.title ?? "Aviso Ferretería", category: "ad" });
  const campaign = await addCampaign(harness.db, stationId, options.advertiser ?? advertiserId, [spot.id], { name: "Campaña Primavera" });
  await harness.db.insert(plays).values({
    stationId,
    assetId: spot.id,
    campaignId: campaign.id,
    title: spot.title,
    category: "ad",
    pickedAt: new Date(at),
    startedAt: new Date(at),
  });
}

describe("crear un enlace", () => {
  it("devuelve el token una sola vez y no lo guarda en claro", async () => {
    const response = await createLink();
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token).toMatch(/^cert_[A-Za-z0-9_-]{43}$/);
    expect(body.path).toBe(`/certificado/${body.token}`);
    expect(new Date(body.expiresAt).getTime()).toBe(START.getTime() + 30 * 86_400_000);

    const list = await send("GET", `/advertisers/${advertiserId}/certificate-links`);
    expect(list.json().items).toHaveLength(1);
    expect(JSON.stringify(list.json())).not.toContain(body.token);
    expect(Object.keys(list.json().items[0]).sort()).toEqual(["createdAt", "expiresAt", "from", "id", "revokedAt", "stationId", "to"]);
  });

  it("permite elegir cuánto dura, de 1 a 90 días", async () => {
    const body = (await createLink({ expiresInDays: 7 })).json();
    expect(new Date(body.expiresAt).getTime()).toBe(START.getTime() + 7 * 86_400_000);
    expect((await createLink({ expiresInDays: 0 })).statusCode).toBe(400);
    expect((await createLink({ expiresInDays: 91 })).statusCode).toBe(400);
    expect((await createLink({ expiresInDays: 1.5 })).statusCode).toBe(400);
  });

  it("valida el período", async () => {
    expect((await createLink({ from: PERIOD.to, to: PERIOD.from })).statusCode).toBe(400);
    expect((await createLink({ from: "2024-01-01T00:00:00Z", to: "2026-10-01T00:00:00Z" })).statusCode).toBe(400);
    expect((await createLink({ from: "no-es-fecha" })).statusCode).toBe(400);
  });

  it("lo crean el dueño y ventas; el programador y el locutor no", async () => {
    expect((await createLink({}, await login(harness.app, fx.email.owner))).statusCode).toBe(201);
    expect((await createLink({}, sales)).statusCode).toBe(201);
    expect((await createLink({}, await login(harness.app, fx.email.programmer))).statusCode).toBe(403);
    expect((await createLink({}, await login(harness.app, fx.email.announcer))).statusCode).toBe(403);
    expect((await createLink({}, null)).statusCode).toBe(401);
  });

  it("no sirve con un anunciante o una emisora de otro cliente", async () => {
    const [stationB] = await harness.db.select({ tenantId: stations.tenantId }).from(stations).where(eq(stations.id, fx.stationB));
    const foreign = await addAdvertiser(harness.db, stationB!.tenantId, { name: "De otro cliente" });
    expect((await createLink({}, sales, foreign.id)).statusCode).toBe(404);
    expect((await createLink({ stationId: fx.stationB })).statusCode).toBe(404);
    const otherOwner = await login(harness.app, fx.email.otherOwner);
    expect((await createLink({}, otherOwner)).statusCode).toBe(404);
  });
});

describe("ver el certificado con el enlace", () => {
  it("muestra lo emitido en el período, sin sesión y sin datos internos", async () => {
    await addEmission("2026-10-05T15:00:00Z");
    await addEmission("2026-10-07T15:00:00Z");
    await addEmission("2026-09-20T15:00:00Z"); // fuera del período
    const { token } = (await createLink()).json();

    const response = await publicGet(token);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-robots-tag"]).toContain("noindex");
    const body = response.json();
    expect(body.advertiser).toEqual({ name: "Ferretería Sur" });
    expect(body.station).toEqual({ name: "FM A", timezone: "America/Argentina/Buenos_Aires" });
    expect(body.total).toBe(2);
    expect(body.perDay).toEqual([
      { date: "2026-10-05", count: 1 },
      { date: "2026-10-07", count: 1 },
    ]);
    expect(body.perCampaign).toEqual([
      { name: "Campaña Primavera", count: 1 },
      { name: "Campaña Primavera", count: 1 },
    ]);
    expect(body.items[0]).toMatchObject({ campaign: "Campaña Primavera", spot: "Aviso Ferretería" });
    expect(body.generatedOn).toBe("2026-10-10");

    const text = JSON.stringify(body);
    for (const internal of [fx.stationA, fx.tenantA, advertiserId]) {
      expect(text).not.toContain(internal);
    }
  });

  it("solo incluye la emisora y el anunciante del enlace", async () => {
    await addEmission("2026-10-05T15:00:00Z");
    const other = await addAdvertiser(harness.db, fx.tenantA, { name: "Otro anunciante" });
    await addEmission("2026-10-06T15:00:00Z", { advertiser: other.id, title: "Aviso ajeno" });
    const { token } = (await createLink()).json();
    const body = (await publicGet(token)).json();
    expect(body.total).toBe(1);
    expect(JSON.stringify(body)).not.toContain("Aviso ajeno");
  });

  it("se puede bajar en CSV", async () => {
    await addEmission("2026-10-05T15:00:00Z");
    const { token } = (await createLink()).json();
    const response = await publicGet(token, "?format=csv");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("certificado-ferreteria-sur-2026-10-01_2026-10-31.csv");
    expect(response.body.charCodeAt(0)).toBe(0xfeff);
    expect(response.body).toContain("Aviso Ferretería");
  });

  it("deja de abrirse al vencer", async () => {
    const { token } = (await createLink({ expiresInDays: 2 })).json();
    expect((await publicGet(token)).statusCode).toBe(200);
    clock = new Date(START.getTime() + 2 * 86_400_000 + 1000);
    expect((await publicGet(token)).statusCode).toBe(404);
  });

  it("no revela nada con un token inventado o mal formado", async () => {
    expect((await publicGet(`cert_${"a".repeat(43)}`)).statusCode).toBe(404);
    expect((await publicGet("nbr_" + "a".repeat(43))).statusCode).toBe(400);
    expect((await publicGet("cualquier-cosa")).statusCode).toBe(400);
  });
});

describe("revocar", () => {
  it("corta el acceso de inmediato y es idempotente", async () => {
    const { token, id } = (await createLink()).json();
    expect((await publicGet(token)).statusCode).toBe(200);

    expect((await send("DELETE", `/certificate-links/${id}`)).statusCode).toBe(204);
    expect((await send("DELETE", `/certificate-links/${id}`)).statusCode).toBe(204);
    expect((await publicGet(token)).statusCode).toBe(404);

    const [item] = (await send("GET", `/advertisers/${advertiserId}/certificate-links`)).json().items;
    expect(item.revokedAt).not.toBeNull();
  });

  it("solo quien puede modificar publicidad, y solo dentro de su cliente", async () => {
    const { id } = (await createLink()).json();
    expect((await send("DELETE", `/certificate-links/${id}`, await login(harness.app, fx.email.programmer))).statusCode).toBe(403);
    expect((await send("DELETE", `/certificate-links/${id}`, await login(harness.app, fx.email.otherOwner))).statusCode).toBe(404);
    expect((await send("DELETE", `/certificate-links/${id}`, null)).statusCode).toBe(401);
    expect((await send("DELETE", "/certificate-links/no-es-uuid")).statusCode).toBe(400);
  });

  it("el listado es del cliente: otro cliente no lo ve", async () => {
    await createLink();
    const otherOwner = await login(harness.app, fx.email.otherOwner);
    expect((await send("GET", `/advertisers/${advertiserId}/certificate-links`, otherOwner)).statusCode).toBe(404);
    const programmer = await login(harness.app, fx.email.programmer);
    expect((await send("GET", `/advertisers/${advertiserId}/certificate-links`, programmer)).statusCode).toBe(200);
  });
});
