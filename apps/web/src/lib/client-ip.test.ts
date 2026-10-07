import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const headers = (values: Record<string, string>) => new Headers(values);

describe("clientIp", () => {
  it("prefiere la IP que informa Cloudflare", () => {
    expect(clientIp(headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("sin Cloudflare toma el último valor de X-Forwarded-For, no el primero (que pone el visitante)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("acepta IPv6", () => {
    expect(clientIp(headers({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("descarta valores que no son una IP", () => {
    expect(clientIp(headers({ "cf-connecting-ip": "no-es-una-ip", "x-forwarded-for": "tampoco" }))).toBeNull();
  });

  it("sin encabezados devuelve null", () => {
    expect(clientIp(headers({}))).toBeNull();
  });
});
