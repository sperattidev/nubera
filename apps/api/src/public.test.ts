import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { plays } from "@nubera/db";
import { createHarness, type Fixtures } from "./testing/harness.js";

const STREAM_URL = "https://stream.example.test/live";

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;

beforeAll(async () => {
  harness = await createHarness({ publicStreamUrl: STREAM_URL, publicCacheSeconds: 0 });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
});

const get = (slug: string) => harness.app.inject({ method: "GET", url: `/public/stations/${slug}` });
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function addPlay(title: string, startedMinutesAgo: number | null, category: "music" | "ad" | "jingle" | "other" = "music", artist: string | null = null) {
  await harness.db.insert(plays).values({
    stationId: fx.stationA,
    title,
    artist,
    category,
    pickedAt: minutesAgo((startedMinutesAgo ?? 0) + 1),
    startedAt: startedMinutesAgo === null ? null : minutesAgo(startedMinutesAgo),
  });
}

describe("GET /public/stations/:slug", () => {
  it("responde sin sesión con el nombre, el flujo y nada sonando si todavía no hay emisiones", async () => {
    const response = await get("fm-a");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: "FM A", slug: "fm-a", streamUrl: STREAM_URL, nowPlaying: null, recent: [] });
  });

  it("informa qué suena y lo que sonó antes, del más nuevo al más viejo", async () => {
    await addPlay("Tema viejo", 12, "music", "Artista 1");
    await addPlay("Tema anterior", 8, "music", "Artista 2");
    await addPlay("Tema actual", 2, "music", "Artista 3");

    const body = (await get("fm-a")).json();
    expect(body.nowPlaying).toMatchObject({ title: "Tema actual", artist: "Artista 3" });
    expect(body.recent.map((play: { title: string }) => play.title)).toEqual(["Tema anterior", "Tema viejo"]);
  });

  it("no cuenta como sonando lo que el motor eligió pero todavía no empezó", async () => {
    await addPlay("Tema actual", 2);
    await addPlay("Tema en cola", null);
    expect((await get("fm-a")).json().nowPlaying.title).toBe("Tema actual");
  });

  it("durante un aviso muestra el nombre de la emisora y no lista avisos ni separadores", async () => {
    await addPlay("Tema anterior", 8);
    await addPlay("Separador", 5, "jingle");
    await addPlay("Aviso de la ferretería", 1, "ad");

    const body = (await get("fm-a")).json();
    expect(body.nowPlaying).toMatchObject({ title: "FM A", artist: null });
    expect(body.recent.map((play: { title: string }) => play.title)).toEqual(["Tema anterior"]);
    expect(JSON.stringify(body)).not.toContain("ferretería");
  });

  it("no anuncia nada si lo último que sonó fue hace mucho (el motor no está emitiendo)", async () => {
    await addPlay("Tema viejo", 90);
    const body = (await get("fm-a")).json();
    expect(body.nowPlaying).toBeNull();
    expect(body.recent.map((play: { title: string }) => play.title)).toEqual(["Tema viejo"]);
  });

  it("no expone identificadores ni datos internos", async () => {
    await addPlay("Tema actual", 2);
    const body = (await get("fm-a")).json();
    expect(Object.keys(body).sort()).toEqual(["name", "nowPlaying", "recent", "slug", "streamUrl"]);
    expect(Object.keys(body.nowPlaying).sort()).toEqual(["artist", "startedAt", "title"]);
    expect(JSON.stringify(body)).not.toContain(fx.stationA);
  });

  it("devuelve una emisora de cualquier cliente por su dirección, y solo la suya", async () => {
    await addPlay("Tema de A", 2);
    const other = (await get("fm-b")).json();
    expect(other.name).toBe("FM B");
    expect(other.nowPlaying).toBeNull();
  });

  it("responde 404 si no existe y 400 si la dirección no es válida", async () => {
    expect((await get("no-existe")).statusCode).toBe(404);
    expect((await get("FM-A")).statusCode).toBe(400);
    expect((await get("fm_a")).statusCode).toBe(400);
  });

  it("sin flujo configurado informa streamUrl nulo", async () => {
    const bare = await createHarness();
    try {
      await bare.reset();
      const response = await bare.app.inject({ method: "GET", url: "/public/stations/fm-a" });
      expect(response.json().streamUrl).toBeNull();
    } finally {
      await bare.close();
    }
  });
});

describe("caché de la respuesta pública", () => {
  it("reutiliza la respuesta unos segundos y la renueva después", async () => {
    let clock = new Date("2026-10-06T12:00:00Z");
    const cached = await createHarness({ publicCacheSeconds: 5, now: () => clock });
    try {
      const seeded = await cached.reset();
      const insert = (title: string, at: Date) =>
        cached.db.insert(plays).values({ stationId: seeded.stationA, title, category: "music", pickedAt: at, startedAt: at });
      const request = async () => (await cached.app.inject({ method: "GET", url: "/public/stations/fm-a" })).json();

      await insert("Primero", new Date("2026-10-06T11:59:00Z"));
      expect((await request()).nowPlaying.title).toBe("Primero");

      await insert("Segundo", new Date("2026-10-06T12:00:01Z"));
      clock = new Date("2026-10-06T12:00:03Z");
      expect((await request()).nowPlaying.title).toBe("Primero");

      clock = new Date("2026-10-06T12:00:06Z");
      expect((await request()).nowPlaying.title).toBe("Segundo");
    } finally {
      await cached.close();
    }
  });
});
