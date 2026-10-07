import { describe, expect, it } from "vitest";
import { embedCode, MAX_RETRIES, publicPageUrl, retryDelayMs, streamSrc, trackLabel } from "./public-player";

describe("retryDelayMs", () => {
  it("duplica la espera en cada intento y no pasa de 15 s", () => {
    expect([0, 1, 2, 3, 4].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 15_000]);
    expect(retryDelayMs(30)).toBe(15_000);
    expect(retryDelayMs(-1)).toBe(1000);
  });

  it("el tiempo total de reintentos es acotado", () => {
    const total = Array.from({ length: MAX_RETRIES }, (_, attempt) => retryDelayMs(attempt)).reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeLessThan(90_000);
  });
});

describe("streamSrc", () => {
  it("agrega el parámetro a una dirección absoluta", () => {
    expect(streamSrc("https://radio.example.test/live", 5)).toBe("https://radio.example.test/live?_=5");
  });

  it("conserva los parámetros que ya tenía y reemplaza el propio", () => {
    expect(streamSrc("https://radio.example.test/live?a=1&_=old", 7)).toBe("https://radio.example.test/live?a=1&_=7");
  });

  it("acepta una dirección relativa al sitio", () => {
    expect(streamSrc("/stream/fm-demo", 9)).toBe("/stream/fm-demo?_=9");
  });
});

describe("trackLabel", () => {
  it("muestra tema y artista", () => {
    expect(trackLabel({ title: "Tema", artist: "Artista", startedAt: "2026-10-06T12:00:00Z" }, "FM Demo")).toEqual({ title: "Tema", subtitle: "Artista" });
  });

  it("sin artista usa el nombre de la emisora", () => {
    expect(trackLabel({ title: "Tema", artist: null, startedAt: "2026-10-06T12:00:00Z" }, "FM Demo").subtitle).toBe("FM Demo");
  });

  it("sin dato muestra la emisora en vivo", () => {
    expect(trackLabel(null, "FM Demo")).toEqual({ title: "FM Demo", subtitle: "En vivo" });
  });
});

describe("direcciones y código para incrustar", () => {
  it("arma la dirección pública", () => {
    expect(publicPageUrl("https://nubera.example.test", "fm-demo")).toBe("https://nubera.example.test/radio/fm-demo");
  });

  it("el código para incrustar apunta al reproductor y escapa el nombre", () => {
    const code = embedCode("https://nubera.example.test", "fm-demo", 'Radio "Sur" <FM> & Co');
    expect(code).toContain('src="https://nubera.example.test/embed/fm-demo"');
    expect(code).toContain('title="Escuchá Radio &quot;Sur&quot; &lt;FM&gt; &amp; Co en vivo"');
    expect(code.match(/"/g)!.length % 2).toBe(0);
  });
});
