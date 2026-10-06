import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./testing/harness.js";

let harness: Awaited<ReturnType<typeof createHarness>>;

beforeAll(async () => {
  harness = await createHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("GET /health", () => {
  it("responde ok sin autenticación", async () => {
    const response = await harness.app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("manejo de errores", () => {
  it("devuelve 400 ante un JSON inválido en lugar de 500", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{no es json",
    });
    expect(response.statusCode).toBe(400);
  });
});
