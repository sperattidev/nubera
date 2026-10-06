import { access } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assets } from "@nubera/db";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAdvertiser, addAsset, addCampaign } from "./testing/fixtures.js";

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let programmer: string;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
  programmer = await login(harness.app, fx.email.programmer);
});

type Method = "GET" | "PATCH" | "DELETE";
const call = (method: Method, url: string, cookie = programmer, payload?: unknown, headers: Record<string, string> = {}) =>
  harness.app.inject({ method, url, headers: { cookie, ...headers }, payload: payload as object });

async function upload(stationId: string, fields: Record<string, string>, name: string, bytes: Uint8Array, cookie = programmer) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), name);
  const response = new Response(form);
  return harness.app.inject({
    method: "POST",
    url: `/stations/${stationId}/assets`,
    payload: Buffer.from(await response.arrayBuffer()),
    headers: { "content-type": response.headers.get("content-type") ?? "", cookie },
  });
}

const bytes = (seed: number, length = 200) => Uint8Array.from({ length }, (_, i) => (seed + i) % 256);
const base = () => `/stations/${fx.stationA}/assets`;

describe("búsqueda y paginación", () => {
  beforeEach(async () => {
    await upload(fx.stationA, { title: "La Bamba", artist: "Los Lobos" }, "a.mp3", bytes(1));
    await upload(fx.stationA, { title: "Bamboleo", artist: "Gipsy Kings" }, "b.mp3", bytes(2));
    await upload(fx.stationA, { title: "Cumbia 100% real", artist: "Banda Sur" }, "c.mp3", bytes(3));
    await upload(fx.stationA, { title: "Jingle", category: "jingle" }, "d.mp3", bytes(4));
  });

  const search = async (query: string) => (await call("GET", `${base()}?${query}`)).json();

  it("busca por título o artista sin distinguir mayúsculas", async () => {
    expect((await search("q=bamb")).items.map((a: { title: string }) => a.title).sort()).toEqual(["Bamboleo", "La Bamba"]);
    expect((await search("q=LOBOS")).items.map((a: { title: string }) => a.title)).toEqual(["La Bamba"]);
    expect((await search("q=banda")).items.map((a: { title: string }) => a.title)).toEqual(["Cumbia 100% real"]);
  });

  it("trata % y _ como texto literal", async () => {
    expect((await search("q=100%25")).items).toHaveLength(1);
    expect((await search("q=%25")).items).toHaveLength(1);
    expect((await search("q=_")).items).toHaveLength(0);
  });

  it("combina búsqueda y categoría, e informa el total sin paginar", async () => {
    expect((await search("q=jingle&category=jingle")).total).toBe(1);
    expect((await search("q=jingle&category=music")).total).toBe(0);
    const page = await search("limit=2&offset=1");
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(4);
    expect((await search("category=music")).total).toBe(3);
  });
});

describe("edición", () => {
  it("modifica título, artista y categoría", async () => {
    const asset = (await upload(fx.stationA, { title: "Viejo", artist: "X" }, "a.mp3", bytes(1))).json();
    const updated = await call("PATCH", `${base()}/${asset.id}`, programmer, { title: "  Nuevo ", artist: "Banda", category: "jingle" });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ title: "Nuevo", artist: "Banda", category: "jingle" });
  });

  it("borra el artista con vacío o null y lo conserva si se omite", async () => {
    const asset = (await upload(fx.stationA, { title: "T", artist: "X" }, "a.mp3", bytes(1))).json();
    expect((await call("PATCH", `${base()}/${asset.id}`, programmer, { title: "Otro" })).json().artist).toBe("X");
    expect((await call("PATCH", `${base()}/${asset.id}`, programmer, { artist: "" })).json().artist).toBeNull();
    await call("PATCH", `${base()}/${asset.id}`, programmer, { artist: "Y" });
    expect((await call("PATCH", `${base()}/${asset.id}`, programmer, { artist: null })).json().artist).toBeNull();
  });

  it("valida el contenido", async () => {
    const asset = (await upload(fx.stationA, { title: "T" }, "a.mp3", bytes(1))).json();
    for (const payload of [{}, { title: " " }, { category: "inexistente" }, { title: "x".repeat(201) }]) {
      expect((await call("PATCH", `${base()}/${asset.id}`, programmer, payload)).statusCode).toBe(400);
    }
  });

  it("no deja sacar de la categoría ad a un aviso que está en una campaña", async () => {
    const advertiser = await addAdvertiser(harness.db, fx.tenantA, { name: "Anunciante" });
    const spot = await addAsset(harness.db, fx.stationA, { title: "Aviso", category: "ad" });
    await addCampaign(harness.db, fx.stationA, advertiser.id, [spot.id]);
    expect((await call("PATCH", `${base()}/${spot.id}`, programmer, { category: "music" })).statusCode).toBe(409);
    expect((await call("PATCH", `${base()}/${spot.id}`, programmer, { title: "Aviso nuevo" })).statusCode).toBe(200);
  });

  it("exige permiso de escritura y respeta el aislamiento entre clientes", async () => {
    const asset = (await upload(fx.stationA, { title: "T" }, "a.mp3", bytes(1))).json();
    const announcer = await login(harness.app, fx.email.announcer);
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await call("PATCH", `${base()}/${asset.id}`, announcer, { title: "x" })).statusCode).toBe(403);
    expect((await call("DELETE", `${base()}/${asset.id}`, announcer)).statusCode).toBe(403);
    expect((await call("PATCH", `${base()}/${asset.id}`, other, { title: "x" })).statusCode).toBe(404);
    expect((await call("DELETE", `${base()}/${asset.id}`, other)).statusCode).toBe(404);
    expect((await call("PATCH", `${base()}/00000000-0000-4000-8000-000000000000`, programmer, { title: "x" })).statusCode).toBe(404);
  });
});

describe("borrado", () => {
  const fileExists = (key: string) =>
    access(path.join(harness.dir, key)).then(
      () => true,
      () => false,
    );

  it("borra el audio y su archivo", async () => {
    const asset = (await upload(fx.stationA, { title: "T" }, "a.mp3", bytes(1))).json();
    expect(await fileExists(asset.storageKey)).toBe(true);

    expect((await call("DELETE", `${base()}/${asset.id}`)).statusCode).toBe(204);
    expect(await fileExists(asset.storageKey)).toBe(false);
    expect((await call("GET", `${base()}/${asset.id}`)).statusCode).toBe(404);
    expect((await call("DELETE", `${base()}/${asset.id}`)).statusCode).toBe(404);
  });

  it("conserva el archivo mientras otro audio lo siga usando", async () => {
    const original = (await upload(fx.stationA, { title: "T" }, "a.mp3", bytes(7))).json();
    // Otro audio que apunta al mismo archivo (el almacenamiento es por contenido).
    await harness.db.insert(assets).values({
      stationId: fx.stationA,
      title: "Copia lógica",
      category: "music",
      mimeType: original.mimeType,
      sizeBytes: original.sizeBytes,
      sha256: "f".repeat(64),
      storageKey: original.storageKey,
    });

    await call("DELETE", `${base()}/${original.id}`);
    expect(await fileExists(original.storageKey)).toBe(true);
  });

  it("borrar un aviso lo quita de sus campañas", async () => {
    const advertiser = await addAdvertiser(harness.db, fx.tenantA, { name: "Anunciante" });
    const spot = await addAsset(harness.db, fx.stationA, { title: "Aviso", category: "ad" });
    const campaign = await addCampaign(harness.db, fx.stationA, advertiser.id, [spot.id]);
    const owner = await login(harness.app, fx.email.owner);
    await call("DELETE", `${base()}/${spot.id}`, owner);
    const detail = await call("GET", `/stations/${fx.stationA}/campaigns/${campaign.id}`, owner);
    expect(detail.json().assets).toEqual([]);
  });
});

describe("escucha del audio", () => {
  const content = bytes(10, 300);
  let id: string;

  beforeEach(async () => {
    id = (await upload(fx.stationA, { title: "T" }, "a.mp3", content)).json().id;
  });

  const audio = (headers: Record<string, string> = {}, cookie = programmer) =>
    harness.app.inject({ method: "GET", url: `${base()}/${id}/audio`, headers: { cookie, ...headers } });

  it("entrega el archivo completo con su tipo", async () => {
    const response = await audio();
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("audio/mpeg");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-length"]).toBe("300");
    expect(Buffer.from(response.rawPayload).equals(Buffer.from(content))).toBe(true);
  });

  it("atiende pedidos por tramos", async () => {
    const partial = await audio({ range: "bytes=10-19" });
    expect(partial.statusCode).toBe(206);
    expect(partial.headers["content-range"]).toBe("bytes 10-19/300");
    expect(Buffer.from(partial.rawPayload).equals(Buffer.from(content.slice(10, 20)))).toBe(true);

    const open = await audio({ range: "bytes=290-" });
    expect(open.headers["content-range"]).toBe("bytes 290-299/300");
    const tail = await audio({ range: "bytes=-5" });
    expect(tail.headers["content-range"]).toBe("bytes 295-299/300");
    const beyond = await audio({ range: "bytes=250-9999" });
    expect(beyond.headers["content-range"]).toBe("bytes 250-299/300");
  });

  it("rechaza tramos inválidos con 416", async () => {
    for (const range of ["bytes=500-600", "bytes=20-10", "items=1-2", "bytes=-"]) {
      const response = await audio({ range });
      expect(response.statusCode).toBe(416);
      expect(response.headers["content-range"]).toBe("bytes */300");
    }
  });

  it("exige permiso y respeta el aislamiento entre clientes", async () => {
    expect((await harness.app.inject({ method: "GET", url: `${base()}/${id}/audio` })).statusCode).toBe(401);
    const announcer = await login(harness.app, fx.email.announcer);
    expect((await audio({}, announcer)).statusCode).toBe(200);
    const sales = await login(harness.app, fx.email.sales);
    expect((await audio({}, sales)).statusCode).toBe(403);
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await audio({}, other)).statusCode).toBe(404);
  });
});
