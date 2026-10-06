import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, login, MAX_BYTES, type Fixtures } from "./testing/harness.js";

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

interface FileInput {
  name: string;
  bytes: Uint8Array;
}

async function upload(stationId: string, fields: Record<string, string>, file?: FileInput, cookie = programmer) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  if (file) {
    form.append("file", new Blob([new Uint8Array(file.bytes)], { type: "audio/mpeg" }), file.name);
  }
  const response = new Response(form);
  return harness.app.inject({
    method: "POST",
    url: `/stations/${stationId}/assets`,
    payload: Buffer.from(await response.arrayBuffer()),
    headers: { "content-type": response.headers.get("content-type") ?? "", cookie },
  });
}

const get = (url: string, cookie = programmer) => harness.app.inject({ method: "GET", url, headers: { cookie } });
const tone = (seed: number) => new Uint8Array(200).fill(seed);

describe("biblioteca de audios", () => {
  it("sube un audio y lo lista", async () => {
    const created = await upload(fx.stationA, { title: "Tema", artist: "Banda", category: "music" }, { name: "tema.mp3", bytes: tone(1) });
    expect(created.statusCode).toBe(201);
    const asset = created.json();
    expect(asset).toMatchObject({ title: "Tema", artist: "Banda", category: "music", sizeBytes: 200, mimeType: "audio/mpeg" });
    expect(asset.sha256).toHaveLength(64);

    const list = await get(`/stations/${fx.stationA}/assets`);
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect((await get(`/stations/${fx.stationA}/assets/${asset.id}`)).json().id).toBe(asset.id);
  });

  it("usa el nombre del archivo como título por defecto", async () => {
    const created = await upload(fx.stationA, {}, { name: "sin-titulo.mp3", bytes: tone(2) });
    expect(created.statusCode).toBe(201);
    expect(created.json().title).toBe("sin-titulo");
  });

  it("filtra por categoría", async () => {
    await upload(fx.stationA, { category: "jingle" }, { name: "a.mp3", bytes: tone(3) });
    await upload(fx.stationA, { category: "music" }, { name: "b.mp3", bytes: tone(4) });
    const list = await get(`/stations/${fx.stationA}/assets?category=jingle`);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].category).toBe("jingle");
  });

  it("rechaza un audio duplicado en la misma emisora", async () => {
    await upload(fx.stationA, {}, { name: "a.mp3", bytes: tone(5) });
    const again = await upload(fx.stationA, {}, { name: "copia.mp3", bytes: tone(5) });
    expect(again.statusCode).toBe(409);
  });

  it("rechaza formatos no soportados, archivos grandes, vacíos y sin archivo", async () => {
    expect((await upload(fx.stationA, {}, { name: "virus.exe", bytes: tone(6) })).statusCode).toBe(415);
    expect((await upload(fx.stationA, {}, { name: "grande.mp3", bytes: new Uint8Array(MAX_BYTES + 100) })).statusCode).toBe(413);
    expect((await upload(fx.stationA, {}, { name: "vacio.mp3", bytes: new Uint8Array(0) })).statusCode).toBe(400);
    expect((await upload(fx.stationA, { title: "x" })).statusCode).toBe(400);
  });

  it("valida la categoría", async () => {
    const response = await upload(fx.stationA, { category: "inexistente" }, { name: "a.mp3", bytes: tone(7) });
    expect(response.statusCode).toBe(400);
  });

  it("responde 404 si la emisora no existe y 400 si el id es inválido", async () => {
    expect((await get("/stations/00000000-0000-4000-8000-000000000000/assets")).statusCode).toBe(404);
    expect((await get("/stations/no-es-uuid/assets")).statusCode).toBe(400);
  });
});

describe("permisos por rol", () => {
  it("exige sesión", async () => {
    expect((await harness.app.inject({ method: "GET", url: `/stations/${fx.stationA}/assets` })).statusCode).toBe(401);
    const form = new Response(new FormData());
    const response = await harness.app.inject({
      method: "POST",
      url: `/stations/${fx.stationA}/assets`,
      payload: Buffer.from(await form.arrayBuffer()),
      headers: { "content-type": form.headers.get("content-type") ?? "" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("el locutor puede leer pero no subir", async () => {
    const announcer = await login(harness.app, fx.email.announcer);
    expect((await get(`/stations/${fx.stationA}/assets`, announcer)).statusCode).toBe(200);
    const created = await upload(fx.stationA, {}, { name: "a.mp3", bytes: tone(8) }, announcer);
    expect(created.statusCode).toBe(403);
  });

  it("el vendedor no accede a la biblioteca", async () => {
    const sales = await login(harness.app, fx.email.sales);
    expect((await get(`/stations/${fx.stationA}/assets`, sales)).statusCode).toBe(403);
  });
});

describe("aislamiento entre clientes", () => {
  it("otro cliente ve la emisora como inexistente (lectura, detalle y subida)", async () => {
    const created = await upload(fx.stationA, {}, { name: "a.mp3", bytes: tone(9) });
    const assetId = created.json().id as string;

    const intruder = await login(harness.app, fx.email.otherOwner);
    expect((await get(`/stations/${fx.stationA}/assets`, intruder)).statusCode).toBe(404);
    expect((await get(`/stations/${fx.stationA}/assets/${assetId}`, intruder)).statusCode).toBe(404);
    const attempt = await upload(fx.stationA, {}, { name: "b.mp3", bytes: tone(10) }, intruder);
    expect(attempt.statusCode).toBe(404);

    expect((await get(`/stations/${fx.stationB}/assets`, intruder)).statusCode).toBe(200);
  });
});
