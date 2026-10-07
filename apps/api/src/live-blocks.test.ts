import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAgent, addAllDayBlock, addAsset } from "./testing/fixtures.js";

// Martes 6 de octubre de 2026, 12:00 en Buenos Aires (UTC-3).
const NOON = new Date("2026-10-06T15:00:00Z");
let clock = NOON;

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let owner: string;
let token: string;

beforeAll(async () => {
  harness = await createHarness({ now: () => clock, random: () => 0, publicCacheSeconds: 0, publicStreamUrl: "https://stream.example.test/live" });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  clock = NOON;
  fx = await harness.reset();
  owner = await login(harness.app, fx.email.owner);
  token = await addAgent(harness.db, fx.stationA);
});

const rotation = { pool: [{ category: "music", weight: 1 }], artistSeparation: 0, trackSeparationMinutes: 0 };
const liveBody = { name: "Mañanas con Juan", days: [1, 2, 3, 4, 5], start: "11:00", end: "13:00", mode: "live" };

const panel = (method: "GET" | "POST" | "PUT", url: string, payload?: unknown, cookie = owner) =>
  harness.app.inject({ method, url, headers: { cookie }, payload: payload as object });
const agent = (url: string, bearer = token) => harness.app.inject({ method: "GET", url, headers: { authorization: `Bearer ${bearer}` } });
const createBlock = (body: object, cookie = owner) => panel("POST", `/stations/${fx.stationA}/schedule`, body, cookie);

describe("bloques en vivo en la grilla", () => {
  it("se crea sin rotación y la grilla lo devuelve como en vivo", async () => {
    const response = await createBlock(liveBody);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "Mañanas con Juan", mode: "live", start: "11:00", end: "13:00" });

    const list = (await panel("GET", `/stations/${fx.stationA}/schedule`)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].mode).toBe("live");
  });

  it("si se manda una rotación en un programa en vivo, se descarta", async () => {
    const created = (await createBlock({ ...liveBody, rotation: { pool: [{ category: "jingle", weight: 5 }] } })).json();
    expect(created.rotation.pool).toEqual([{ category: "music", weight: 1 }]);
  });

  it("un bloque automático sigue exigiendo su rotación", async () => {
    const response = await createBlock({ ...liveBody, mode: "auto" });
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain("rotación");
    const withoutMode = await createBlock({ name: "Sin modo", days: [1], start: "08:00", end: "09:00" });
    expect(withoutMode.statusCode).toBe(400);
  });

  it("sin indicar el modo, un bloque es automático (compatibilidad)", async () => {
    const created = await createBlock({ name: "Mañana", days: [1], start: "08:00", end: "09:00", rotation });
    expect(created.statusCode).toBe(201);
    expect(created.json().mode).toBe("auto");
  });

  it("se puede pasar de automático a en vivo y volver", async () => {
    const { id } = (await createBlock({ name: "Mediodía", days: [2], start: "11:00", end: "13:00", rotation })).json();
    const toLive = await panel("PUT", `/stations/${fx.stationA}/schedule/${id}`, { name: "Mediodía", days: [2], start: "11:00", end: "13:00", mode: "live" });
    expect(toLive.json().mode).toBe("live");
    const back = await panel("PUT", `/stations/${fx.stationA}/schedule/${id}`, { name: "Mediodía", days: [2], start: "11:00", end: "13:00", mode: "auto", rotation });
    expect(back.json().mode).toBe("auto");
  });

  it("lo crea quien puede modificar la grilla y no el locutor", async () => {
    expect((await createBlock(liveBody, await login(harness.app, fx.email.programmer))).statusCode).toBe(201);
    expect((await createBlock(liveBody, await login(harness.app, fx.email.announcer))).statusCode).toBe(403);
  });
});

describe("la automatización durante un programa en vivo", () => {
  beforeEach(async () => {
    await addAllDayBlock(harness.db, fx.stationA, rotation);
    await addAsset(harness.db, fx.stationA, { title: "Tema", artist: "Banda" });
  });

  it("no emite nada mientras dura el programa, y retoma al terminar", async () => {
    await createBlock(liveBody);

    expect((await agent("/playout/next")).statusCode).toBe(204); // 12:00, en vivo

    clock = new Date("2026-10-06T16:30:00Z"); // 13:30, el programa ya terminó
    expect((await agent("/playout/next")).statusCode).toBe(200);
  });

  it("los días en que el programa no va, suena la automatización", async () => {
    await createBlock({ ...liveBody, days: [1] }); // solo lunes
    expect((await agent("/playout/next")).statusCode).toBe(200); // hoy es martes
  });

  it("el motor consulta el modo y recibe el nombre del programa", async () => {
    expect((await agent("/playout/mode")).json()).toEqual({ mode: "auto", program: null });
    await createBlock(liveBody);
    expect((await agent("/playout/mode")).json()).toEqual({ mode: "live", program: "Mañanas con Juan" });
    clock = new Date("2026-10-06T16:30:00Z");
    expect((await agent("/playout/mode")).json()).toEqual({ mode: "auto", program: null });
  });

  it("el modo exige un token de agente", async () => {
    expect((await harness.app.inject({ method: "GET", url: "/playout/mode" })).statusCode).toBe(401);
    expect((await agent("/playout/mode", "nbr_inventado")).statusCode).toBe(401);
    expect((await harness.app.inject({ method: "GET", url: "/playout/mode", headers: { cookie: owner } })).statusCode).toBe(401);
  });

  it("el panel ve el bloque vigente como en vivo", async () => {
    await createBlock(liveBody);
    const data = (await panel("GET", `/stations/${fx.stationA}/on-air`)).json();
    expect(data.block).toMatchObject({ name: "Mañanas con Juan", mode: "live" });
  });
});

describe("la página pública durante un programa en vivo", () => {
  const publicGet = () => harness.app.inject({ method: "GET", url: "/public/stations/fm-a" });

  it("muestra el nombre del programa y no un tema", async () => {
    await addAllDayBlock(harness.db, fx.stationA, rotation);
    expect((await publicGet()).json().live).toBeNull();

    await createBlock(liveBody);
    const body = (await publicGet()).json();
    expect(body.live).toEqual({ program: "Mañanas con Juan" });
    expect(body.nowPlaying).toBeNull();
  });

  it("vuelve a la normalidad cuando termina el programa", async () => {
    await createBlock(liveBody);
    clock = new Date("2026-10-06T16:30:00Z");
    expect((await publicGet()).json().live).toBeNull();
  });
});
