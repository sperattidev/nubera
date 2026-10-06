import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, login, type Fixtures } from "./testing/harness.js";

// Martes 2026-10-06, 12:00 en Buenos Aires.
const NOW = new Date("2026-10-06T15:00:00Z");

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let programmer: string;

beforeAll(async () => {
  harness = await createHarness({ now: () => NOW });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
  programmer = await login(harness.app, fx.email.programmer);
});

const rotation = { pool: [{ category: "music", weight: 1 }] };
const morning = { name: "Mañana", days: [1, 2, 3, 4, 5], start: "06:00", end: "12:00", rotation };

const request = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, cookie: string, payload?: unknown) =>
  harness.app.inject({ method, url, headers: { cookie }, payload: payload as object });

const base = () => `/stations/${fx.stationA}/schedule`;

describe("grilla semanal", () => {
  it("crea, lista, edita y borra bloques", async () => {
    const created = await request("POST", base(), programmer, morning);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "Mañana", days: [1, 2, 3, 4, 5], start: "06:00", end: "12:00" });
    expect(created.json().rotation).toMatchObject({ artistSeparation: 3, trackSeparationMinutes: 120, insertions: [] });
    const id = created.json().id as string;

    await request("POST", base(), programmer, { ...morning, name: "Tarde", start: "12:00", end: "24:00" });
    const list = await request("GET", base(), programmer);
    expect(list.json().items.map((b: { name: string }) => b.name)).toEqual(["Mañana", "Tarde"]);
    expect(list.json().items[1].end).toBe("24:00");

    const updated = await request("PUT", `${base()}/${id}`, programmer, { ...morning, name: "Mañana larga", end: "13:30" });
    expect(updated.json()).toMatchObject({ name: "Mañana larga", end: "13:30" });

    expect((await request("DELETE", `${base()}/${id}`, programmer)).statusCode).toBe(204);
    expect((await request("GET", base(), programmer)).json().items).toHaveLength(1);
    expect((await request("DELETE", `${base()}/${id}`, programmer)).statusCode).toBe(404);
    expect((await request("PUT", `${base()}/${id}`, programmer, morning)).statusCode).toBe(404);
  });

  it("normaliza los días (sin repetidos y ordenados)", async () => {
    const created = await request("POST", base(), programmer, { ...morning, days: [5, 1, 1, 3] });
    expect(created.json().days).toEqual([1, 3, 5]);
  });

  it("valida horarios, días y rotación", async () => {
    const cases = [
      { ...morning, start: "12:00", end: "06:00" },
      { ...morning, start: "10:00", end: "10:00" },
      { ...morning, start: "6:00" },
      { ...morning, end: "25:00" },
      { ...morning, days: [] },
      { ...morning, days: [0, 8] },
      { ...morning, rotation: { pool: [] } },
      { ...morning, rotation: { pool: [{ category: "inventada", weight: 1 }] } },
      { ...morning, name: "  " },
    ];
    for (const body of cases) {
      expect((await request("POST", base(), programmer, body)).statusCode).toBe(400);
    }
  });

  it("informa el bloque vigente en un instante", async () => {
    await request("POST", base(), programmer, { ...morning, days: [2], start: "11:00", end: "13:00" });

    const now = await request("GET", `${base()}/now`, programmer);
    expect(now.json().block).toMatchObject({ name: "Mañana" });
    expect(now.json().timezone).toBe("America/Argentina/Buenos_Aires");

    const sunday = await request("GET", `${base()}/now?at=2026-10-11T15:00:00Z`, programmer);
    expect(sunday.json().block).toBeNull();
    expect((await request("GET", `${base()}/now?at=no-es-fecha`, programmer)).statusCode).toBe(400);
  });
});

describe("permisos y aislamiento", () => {
  it("el locutor lee pero no modifica; el vendedor no accede", async () => {
    const announcer = await login(harness.app, fx.email.announcer);
    const sales = await login(harness.app, fx.email.sales);
    expect((await request("GET", base(), announcer)).statusCode).toBe(200);
    expect((await request("POST", base(), announcer, morning)).statusCode).toBe(403);
    expect((await request("GET", base(), sales)).statusCode).toBe(403);
    expect((await harness.app.inject({ method: "GET", url: base() })).statusCode).toBe(401);
  });

  it("otro cliente ve la emisora como inexistente", async () => {
    const created = await request("POST", base(), programmer, morning);
    const intruder = await login(harness.app, fx.email.otherOwner);
    expect((await request("GET", base(), intruder)).statusCode).toBe(404);
    expect((await request("POST", base(), intruder, morning)).statusCode).toBe(404);
    expect((await request("PUT", `${base()}/${created.json().id}`, intruder, morning)).statusCode).toBe(404);
    expect((await request("DELETE", `${base()}/${created.json().id}`, intruder)).statusCode).toBe(404);
  });
});
