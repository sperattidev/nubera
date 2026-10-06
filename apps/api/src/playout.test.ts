import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAgent, addAllDayBlock, addAsset } from "./testing/fixtures.js";

let clock = new Date("2026-10-06T15:00:00Z");
const tick = () => {
  clock = new Date(clock.getTime() + 60_000);
};

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let owner: string;
let token: string;

beforeAll(async () => {
  harness = await createHarness({ now: () => clock, random: () => 0 });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  clock = new Date("2026-10-06T15:00:00Z");
  fx = await harness.reset();
  owner = await login(harness.app, fx.email.owner);
  token = await addAgent(harness.db, fx.stationA);
});

const agent = (method: "GET" | "POST", url: string, bearer = token) =>
  harness.app.inject({ method, url, headers: { authorization: `Bearer ${bearer}` } });
const next = () => agent("GET", "/playout/next");
const panel = (method: "GET" | "POST" | "DELETE", url: string, cookie = owner, payload?: unknown) =>
  harness.app.inject({ method, url, headers: { cookie }, payload: payload as object });

const fastRotation = { pool: [{ category: "music", weight: 1 }], artistSeparation: 0, trackSeparationMinutes: 0 };

describe("cola de reproducción", () => {
  it("exige un token de agente válido", async () => {
    expect((await harness.app.inject({ method: "GET", url: "/playout/next" })).statusCode).toBe(401);
    expect((await agent("GET", "/playout/next", "nbr_inventado")).statusCode).toBe(401);
    expect((await agent("GET", "/playout/next", "sin-prefijo")).statusCode).toBe(401);
    // Una sesión de usuario no sirve como agente.
    expect((await panel("GET", "/playout/next")).statusCode).toBe(401);
  });

  it("responde 204 sin bloque vigente o sin audios", async () => {
    expect((await next()).statusCode).toBe(204);
    await addAllDayBlock(harness.db, fx.stationA, fastRotation);
    expect((await next()).statusCode).toBe(204);
  });

  it("elige un audio del bloque y lo registra", async () => {
    const block = await addAllDayBlock(harness.db, fx.stationA, fastRotation);
    const asset = await addAsset(harness.db, fx.stationA, { title: "Tema", artist: "Banda" });

    const response = await next();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      assetId: asset.id,
      blockId: block.id,
      storageKey: asset.storageKey,
      title: "Tema",
      artist: "Banda",
      category: "music",
    });
    expect(response.json().playId).toBeTruthy();
  });

  it("no usa audios de otra emisora", async () => {
    await addAllDayBlock(harness.db, fx.stationA, fastRotation);
    await addAsset(harness.db, fx.stationB, { title: "Ajeno" });
    expect((await next()).statusCode).toBe(204);
  });

  it("intercala un jingle cada 2 temas usando el historial", async () => {
    await addAllDayBlock(harness.db, fx.stationA, { ...fastRotation, insertions: [{ category: "jingle", everyTracks: 2 }] });
    await addAsset(harness.db, fx.stationA, { title: "Tema" });
    await addAsset(harness.db, fx.stationA, { title: "Jingle", category: "jingle" });

    const categories: string[] = [];
    for (let i = 0; i < 6; i++) {
      categories.push((await next()).json().category);
      tick();
    }
    expect(categories).toEqual(["music", "music", "jingle", "music", "music", "jingle"]);
  });

  it("separa artistas entre emisiones consecutivas", async () => {
    await addAllDayBlock(harness.db, fx.stationA, { pool: [{ category: "music", weight: 1 }], artistSeparation: 1, trackSeparationMinutes: 0 });
    await addAsset(harness.db, fx.stationA, { title: "A1", artist: "Banda" });
    await addAsset(harness.db, fx.stationA, { title: "A2", artist: "Banda" });
    await addAsset(harness.db, fx.stationA, { title: "B1", artist: "Otro" });

    const artists: string[] = [];
    for (let i = 0; i < 4; i++) {
      artists.push((await next()).json().artist);
      tick();
    }
    for (let i = 1; i < artists.length; i++) {
      expect(artists[i]).not.toBe(artists[i - 1]);
    }
  });
});

describe("confirmación y registro de emisiones", () => {
  it("solo figura en el historial lo que empezó a sonar", async () => {
    await addAllDayBlock(harness.db, fx.stationA, fastRotation);
    await addAsset(harness.db, fx.stationA, { title: "Tema", artist: "Banda" });
    const playId = (await next()).json().playId as string;

    const before = await panel("GET", `/stations/${fx.stationA}/plays`);
    expect(before.json().items).toHaveLength(0);

    expect((await agent("POST", `/playout/plays/${playId}/started`)).statusCode).toBe(204);
    expect((await agent("POST", `/playout/plays/${playId}/started`)).statusCode).toBe(204);

    const after = await panel("GET", `/stations/${fx.stationA}/plays`);
    expect(after.json().items).toHaveLength(1);
    expect(after.json().items[0]).toMatchObject({ title: "Tema", artist: "Banda", category: "music" });
  });

  it("acepta la confirmación con cuerpo JSON, como la envía Liquidsoap", async () => {
    await addAllDayBlock(harness.db, fx.stationA, fastRotation);
    await addAsset(harness.db, fx.stationA, { title: "Tema" });
    const playId = (await next()).json().playId as string;
    const response = await harness.app.inject({
      method: "POST",
      url: `/playout/plays/${playId}/started`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: "{}",
    });
    expect(response.statusCode).toBe(204);
    expect((await panel("GET", `/stations/${fx.stationA}/plays`)).json().items).toHaveLength(1);
  });

  it("filtra por rango de fechas y límite", async () => {
    await addAllDayBlock(harness.db, fx.stationA, fastRotation);
    await addAsset(harness.db, fx.stationA, { title: "Tema" });
    for (let i = 0; i < 3; i++) {
      const playId = (await next()).json().playId as string;
      await agent("POST", `/playout/plays/${playId}/started`);
      tick();
    }
    const url = `/stations/${fx.stationA}/plays`;
    expect((await panel("GET", `${url}?limit=2`)).json().items).toHaveLength(2);
    const from = new Date("2026-10-06T15:01:00Z").toISOString();
    expect((await panel("GET", `${url}?from=${from}`)).json().items).toHaveLength(2);
    const to = new Date("2026-10-06T15:01:00Z").toISOString();
    expect((await panel("GET", `${url}?to=${to}`)).json().items).toHaveLength(1);
    expect((await panel("GET", `${url}?limit=0`)).statusCode).toBe(400);
  });

  it("un agente no puede confirmar emisiones de otra emisora", async () => {
    await addAllDayBlock(harness.db, fx.stationA, fastRotation);
    await addAsset(harness.db, fx.stationA, { title: "Tema" });
    const playId = (await next()).json().playId as string;
    const otherToken = await addAgent(harness.db, fx.stationB);
    expect((await agent("POST", `/playout/plays/${playId}/started`, otherToken)).statusCode).toBe(404);
    expect((await agent("POST", "/playout/plays/00000000-0000-4000-8000-000000000000/started")).statusCode).toBe(404);
  });

  it("el vendedor puede ver el historial; otro cliente no", async () => {
    const sales = await login(harness.app, fx.email.sales);
    expect((await panel("GET", `/stations/${fx.stationA}/plays`, sales)).statusCode).toBe(200);
    const intruder = await login(harness.app, fx.email.otherOwner);
    expect((await panel("GET", `/stations/${fx.stationA}/plays`, intruder)).statusCode).toBe(404);
  });
});

describe("tokens de agente", () => {
  const url = () => `/stations/${fx.stationA}/agent-tokens`;

  it("el dueño crea un token que se muestra una sola vez y funciona", async () => {
    const created = await panel("POST", url(), owner, { name: "Estudio" });
    expect(created.statusCode).toBe(201);
    expect(created.json().token.startsWith("nbr_")).toBe(true);
    expect((await agent("GET", "/playout/next", created.json().token)).statusCode).toBe(204);

    const list = await panel("GET", url());
    const listed = list.json().items.find((t: { name: string }) => t.name === "Estudio");
    expect(listed).toBeTruthy();
    expect(listed).not.toHaveProperty("token");
    expect(listed).not.toHaveProperty("tokenHash");
    expect(listed.lastSeenAt).not.toBeNull();
  });

  it("un token revocado deja de funcionar", async () => {
    const created = await panel("POST", url(), owner, { name: "Temporal" });
    const revoked = await panel("DELETE", `${url()}/${created.json().id}`);
    expect(revoked.statusCode).toBe(204);
    expect((await agent("GET", "/playout/next", created.json().token)).statusCode).toBe(401);
    expect((await panel("DELETE", `${url()}/${created.json().id}`)).statusCode).toBe(404);
  });

  it("solo el dueño del cliente los gestiona", async () => {
    const programmer = await login(harness.app, fx.email.programmer);
    expect((await panel("POST", url(), programmer, { name: "x" })).statusCode).toBe(403);
    expect((await panel("GET", url(), programmer)).statusCode).toBe(403);
    const intruder = await login(harness.app, fx.email.otherOwner);
    expect((await panel("POST", url(), intruder, { name: "x" })).statusCode).toBe(404);
  });
});
