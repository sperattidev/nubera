import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql, stations, tenants, type Database } from "@nubera/db";
import { createTestDb } from "@nubera/db/testing";
import { buildApp } from "./app.js";
import { LocalMediaStorage } from "./storage.js";

const MAX_BYTES = 1024;

interface Context {
  app: FastifyInstance;
  stationId: string;
  dir: string;
}

let ctx: Context;
let db: Database;
let closeDb: () => Promise<void>;

// Una sola base en memoria por archivo (arrancarla es lento); se limpia entre tests.
beforeAll(async () => {
  ({ db, close: closeDb } = await createTestDb());
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate table tenants cascade`);
  const dir = await mkdtemp(path.join(os.tmpdir(), "nubera-test-"));
  const [tenant] = await db.insert(tenants).values({ name: "Radio Test", slug: "test" }).returning();
  const [station] = await db
    .insert(stations)
    .values({ tenantId: tenant!.id, name: "FM Test", slug: "fm-test" })
    .returning();
  const app = buildApp({
    db,
    storage: new LocalMediaStorage(dir, MAX_BYTES),
    maxUploadBytes: MAX_BYTES,
  });
  await app.ready();
  ctx = { app, stationId: station!.id, dir };
});

afterEach(async () => {
  await ctx.app.close();
  await rm(ctx.dir, { recursive: true, force: true });
});

async function multipartBody(fields: Record<string, string>, file?: { name: string; bytes: Uint8Array }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  if (file) {
    form.append("file", new Blob([new Uint8Array(file.bytes)], { type: "audio/mpeg" }), file.name);
  }
  const response = new Response(form);
  return {
    payload: Buffer.from(await response.arrayBuffer()),
    headers: { "content-type": response.headers.get("content-type") ?? "" },
  };
}

function upload(stationId: string, fields: Record<string, string>, file?: { name: string; bytes: Uint8Array }) {
  return multipartBody(fields, file).then(({ payload, headers }) =>
    ctx.app.inject({ method: "POST", url: `/stations/${stationId}/assets`, payload, headers }),
  );
}

const tone = (seed: number) => new Uint8Array(200).fill(seed);

describe("GET /health", () => {
  it("responde ok", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("biblioteca de audios", () => {
  it("sube un audio y lo lista", async () => {
    const created = await upload(ctx.stationId, { title: "Tema", artist: "Banda", category: "music" }, { name: "tema.mp3", bytes: tone(1) });
    expect(created.statusCode).toBe(201);
    const asset = created.json();
    expect(asset).toMatchObject({ title: "Tema", artist: "Banda", category: "music", sizeBytes: 200, mimeType: "audio/mpeg" });
    expect(asset.sha256).toHaveLength(64);

    const list = await ctx.app.inject({ method: "GET", url: `/stations/${ctx.stationId}/assets` });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);

    const one = await ctx.app.inject({ method: "GET", url: `/stations/${ctx.stationId}/assets/${asset.id}` });
    expect(one.json().id).toBe(asset.id);
  });

  it("usa el nombre del archivo como título por defecto", async () => {
    const created = await upload(ctx.stationId, {}, { name: "sin-titulo.mp3", bytes: tone(2) });
    expect(created.statusCode).toBe(201);
    expect(created.json().title).toBe("sin-titulo");
  });

  it("filtra por categoría", async () => {
    await upload(ctx.stationId, { category: "jingle" }, { name: "a.mp3", bytes: tone(3) });
    await upload(ctx.stationId, { category: "music" }, { name: "b.mp3", bytes: tone(4) });
    const list = await ctx.app.inject({ method: "GET", url: `/stations/${ctx.stationId}/assets?category=jingle` });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].category).toBe("jingle");
  });

  it("rechaza un audio duplicado en la misma emisora", async () => {
    await upload(ctx.stationId, {}, { name: "a.mp3", bytes: tone(5) });
    const again = await upload(ctx.stationId, {}, { name: "copia.mp3", bytes: tone(5) });
    expect(again.statusCode).toBe(409);
  });

  it("rechaza formatos no soportados", async () => {
    const response = await upload(ctx.stationId, {}, { name: "virus.exe", bytes: tone(6) });
    expect(response.statusCode).toBe(415);
  });

  it("rechaza archivos que superan el máximo", async () => {
    const response = await upload(ctx.stationId, {}, { name: "grande.mp3", bytes: new Uint8Array(MAX_BYTES + 100) });
    expect(response.statusCode).toBe(413);
  });

  it("rechaza archivos vacíos y solicitudes sin archivo", async () => {
    const empty = await upload(ctx.stationId, {}, { name: "vacio.mp3", bytes: new Uint8Array(0) });
    expect(empty.statusCode).toBe(400);
    const none = await upload(ctx.stationId, { title: "x" });
    expect(none.statusCode).toBe(400);
  });

  it("valida la categoría", async () => {
    const response = await upload(ctx.stationId, { category: "inexistente" }, { name: "a.mp3", bytes: tone(7) });
    expect(response.statusCode).toBe(400);
  });

  it("responde 404 si la emisora no existe y 400 si el id es inválido", async () => {
    const missing = await ctx.app.inject({
      method: "GET",
      url: "/stations/00000000-0000-4000-8000-000000000000/assets",
    });
    expect(missing.statusCode).toBe(404);
    const invalid = await ctx.app.inject({ method: "GET", url: "/stations/no-es-uuid/assets" });
    expect(invalid.statusCode).toBe(400);
  });
});
