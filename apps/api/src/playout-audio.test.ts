import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agentTokens, plays } from "@nubera/db";
import { createHarness, login, type Fixtures } from "./testing/harness.js";
import { addAgent, addAllDayBlock, addAsset } from "./testing/fixtures.js";

const AUDIO = Buffer.from("ID3-contenido-de-audio-de-prueba");

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let token: string;

beforeAll(async () => {
  harness = await createHarness({ random: () => 0 });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
  token = await addAgent(harness.db, fx.stationA);
});

const fastRotation = { pool: [{ category: "music", weight: 1 }], artistSeparation: 0, trackSeparationMinutes: 0 };

const get = (url: string, bearer: string | null = token) =>
  harness.app.inject({ method: "GET", url, headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });

/** Programa un audio con su archivo en disco y devuelve la emisión que el motor recibiría. */
async function nextPlay(options: { withFile?: boolean } = {}) {
  await addAllDayBlock(harness.db, fx.stationA, fastRotation);
  const asset = await addAsset(harness.db, fx.stationA, { title: "Tema", artist: "Banda" });
  if (options.withFile ?? true) {
    const file = path.join(harness.dir, asset.storageKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, AUDIO);
  }
  const playId = (await get("/playout/next")).json().playId as string;
  return { playId, asset };
}

describe("GET /playout/plays/:playId/audio", () => {
  it("entrega el archivo de la emisión con su tipo y tamaño", async () => {
    const { playId } = await nextPlay();
    const response = await get(`/playout/plays/${playId}/audio`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("audio/mpeg");
    expect(response.headers["content-length"]).toBe(String(AUDIO.length));
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.rawPayload.equals(AUDIO)).toBe(true);
  });

  it("exige un token de agente: ni sin credenciales, ni inventado, ni una sesión de usuario", async () => {
    const { playId } = await nextPlay();
    expect((await get(`/playout/plays/${playId}/audio`, null)).statusCode).toBe(401);
    expect((await get(`/playout/plays/${playId}/audio`, "nbr_inventado")).statusCode).toBe(401);
    const cookie = await login(harness.app, fx.email.owner);
    const withSession = await harness.app.inject({ method: "GET", url: `/playout/plays/${playId}/audio`, headers: { cookie } });
    expect(withSession.statusCode).toBe(401);
  });

  it("un token no puede bajar audios de otra emisora", async () => {
    const { playId } = await nextPlay();
    const otherToken = await addAgent(harness.db, fx.stationB);
    expect((await get(`/playout/plays/${playId}/audio`, otherToken)).statusCode).toBe(404);
  });

  it("un token revocado deja de servir audios", async () => {
    const { playId } = await nextPlay();
    await harness.db.update(agentTokens).set({ revokedAt: new Date() });
    expect((await get(`/playout/plays/${playId}/audio`)).statusCode).toBe(401);
  });

  it("responde 404 si la emisión no existe", async () => {
    expect((await get("/playout/plays/00000000-0000-4000-8000-000000000000/audio")).statusCode).toBe(404);
  });

  it("responde 404 si el archivo falta en el almacenamiento", async () => {
    const { playId } = await nextPlay({ withFile: false });
    expect((await get(`/playout/plays/${playId}/audio`)).statusCode).toBe(404);
  });

  it("responde 404 si el audio ya se borró de la biblioteca", async () => {
    const { playId } = await nextPlay();
    await harness.db.update(plays).set({ assetId: null });
    expect((await get(`/playout/plays/${playId}/audio`)).statusCode).toBe(404);
  });

  it("rechaza un identificador que no es un UUID", async () => {
    expect((await get("/playout/plays/../../etc/passwd/audio")).statusCode).toBe(404);
    expect((await get("/playout/plays/no-es-uuid/audio")).statusCode).toBe(400);
  });
});
