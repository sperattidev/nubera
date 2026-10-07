import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, login, PASSWORD, type Fixtures } from "./testing/harness.js";

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;
let owner: string;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
  owner = await login(harness.app, fx.email.owner);
});

type Method = "GET" | "POST" | "PATCH";
const call = (method: Method, url: string, cookie: string | undefined, payload?: unknown) =>
  harness.app.inject({ method, url, headers: cookie ? { cookie } : {}, payload: payload as object });

const userIdByEmail = async (email: string) => {
  const list = await call("GET", "/users", owner);
  return (list.json().items as { id: string; email: string }[]).find((user) => user.email === email)!.id;
};

describe("PATCH /users/:id", () => {
  it("cambia el nombre, el rol y el estado de otra persona", async () => {
    const id = await userIdByEmail(fx.email.announcer);
    const response = await call("PATCH", `/users/${id}`, owner, { name: "Locutora Nueva", role: "programmer", isActive: false });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id, name: "Locutora Nueva", role: "programmer", isActive: false });
    expect(response.json()).not.toHaveProperty("passwordHash");
  });

  it("permite cambiar solo un dato y deja el resto como estaba", async () => {
    const id = await userIdByEmail(fx.email.sales);
    const response = await call("PATCH", `/users/${id}`, owner, { name: "Otro nombre" });
    expect(response.json()).toMatchObject({ name: "Otro nombre", role: "sales", isActive: true });
  });

  it("al desactivar a alguien se le cierran las sesiones y no puede volver a entrar", async () => {
    const session = await login(harness.app, fx.email.programmer);
    expect((await call("GET", "/auth/me", session)).statusCode).toBe(200);

    const id = await userIdByEmail(fx.email.programmer);
    await call("PATCH", `/users/${id}`, owner, { isActive: false });

    expect((await call("GET", "/auth/me", session)).statusCode).toBe(401);
    const attempt = await call("POST", "/auth/login", undefined, { email: fx.email.programmer, password: PASSWORD });
    expect(attempt.statusCode).toBe(401);

    await call("PATCH", `/users/${id}`, owner, { isActive: true });
    expect((await call("POST", "/auth/login", undefined, { email: fx.email.programmer, password: PASSWORD })).statusCode).toBe(200);
  });

  it("nadie puede quitarse su propio rol ni desactivarse, pero sí cambiar su nombre", async () => {
    const id = await userIdByEmail(fx.email.owner);
    expect((await call("PATCH", `/users/${id}`, owner, { role: "sales" })).statusCode).toBe(409);
    expect((await call("PATCH", `/users/${id}`, owner, { isActive: false })).statusCode).toBe(409);
    expect((await call("PATCH", `/users/${id}`, owner, { role: "owner", isActive: true })).statusCode).toBe(200);
    expect((await call("PATCH", `/users/${id}`, owner, { name: "Nuevo nombre" })).json().name).toBe("Nuevo nombre");
    // Sigue pudiendo entrar.
    expect((await call("GET", "/auth/me", owner)).statusCode).toBe(200);
  });

  it("valida el cuerpo", async () => {
    const id = await userIdByEmail(fx.email.sales);
    for (const payload of [{}, { role: "jefe" }, { name: " " }, { isActive: "si" }]) {
      expect((await call("PATCH", `/users/${id}`, owner, payload)).statusCode).toBe(400);
    }
    expect((await call("PATCH", "/users/no-es-uuid", owner, { name: "x" })).statusCode).toBe(400);
  });

  it("solo el dueño, y solo sobre usuarios de su cliente", async () => {
    const id = await userIdByEmail(fx.email.sales);
    const programmer = await login(harness.app, fx.email.programmer);
    expect((await call("PATCH", `/users/${id}`, programmer, { name: "x" })).statusCode).toBe(403);
    expect((await call("PATCH", `/users/${id}`, undefined, { name: "x" })).statusCode).toBe(401);

    const other = await login(harness.app, fx.email.otherOwner);
    expect((await call("PATCH", `/users/${id}`, other, { name: "x" })).statusCode).toBe(404);
    expect((await call("PATCH", "/users/00000000-0000-4000-8000-000000000000", owner, { name: "x" })).statusCode).toBe(404);
  });
});

describe("POST /users/:id/password", () => {
  const NEW_PASSWORD = "contraseña-nueva-segura-1";

  it("define una contraseña nueva y cierra las sesiones de esa persona", async () => {
    const session = await login(harness.app, fx.email.announcer);
    const id = await userIdByEmail(fx.email.announcer);

    expect((await call("POST", `/users/${id}/password`, owner, { password: NEW_PASSWORD })).statusCode).toBe(204);

    expect((await call("GET", "/auth/me", session)).statusCode).toBe(401);
    expect((await call("POST", "/auth/login", undefined, { email: fx.email.announcer, password: PASSWORD })).statusCode).toBe(401);
    expect((await call("POST", "/auth/login", undefined, { email: fx.email.announcer, password: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it("rechaza contraseñas débiles", async () => {
    const id = await userIdByEmail(fx.email.announcer);
    expect((await call("POST", `/users/${id}/password`, owner, { password: "corta" })).statusCode).toBe(400);
    expect((await call("POST", `/users/${id}/password`, owner, {})).statusCode).toBe(400);
  });

  it("la propia contraseña se cambia desde Mi cuenta, no por acá", async () => {
    const id = await userIdByEmail(fx.email.owner);
    expect((await call("POST", `/users/${id}/password`, owner, { password: NEW_PASSWORD })).statusCode).toBe(409);
  });

  it("solo el dueño, y solo sobre usuarios de su cliente", async () => {
    const id = await userIdByEmail(fx.email.sales);
    const programmer = await login(harness.app, fx.email.programmer);
    expect((await call("POST", `/users/${id}/password`, programmer, { password: NEW_PASSWORD })).statusCode).toBe(403);
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await call("POST", `/users/${id}/password`, other, { password: NEW_PASSWORD })).statusCode).toBe(404);
    // La contraseña de la persona no cambió.
    expect((await call("POST", "/auth/login", undefined, { email: fx.email.sales, password: PASSWORD })).statusCode).toBe(200);
  });
});

describe("PATCH /stations/:id", () => {
  const url = () => `/stations/${fx.stationA}`;

  it("cambia el nombre y la zona horaria, y se refleja en el listado", async () => {
    const response = await call("PATCH", url(), owner, { name: "FM Firmat 98.3", timezone: "America/Argentina/Cordoba" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: fx.stationA, name: "FM Firmat 98.3", timezone: "America/Argentina/Cordoba", slug: "fm-a" });

    const list = await call("GET", "/stations", owner);
    expect(list.json().items[0]).toMatchObject({ name: "FM Firmat 98.3", timezone: "America/Argentina/Cordoba" });
  });

  it("permite cambiar solo un dato", async () => {
    const response = await call("PATCH", url(), owner, { name: "Solo el nombre" });
    expect(response.json()).toMatchObject({ name: "Solo el nombre", timezone: "America/Argentina/Buenos_Aires" });
  });

  it("valida el cuerpo y la zona horaria", async () => {
    for (const payload of [{}, { name: " " }, { timezone: "Marte/Olympus_Mons" }, { timezone: "" }, { name: "x".repeat(121) }]) {
      expect((await call("PATCH", url(), owner, payload)).statusCode).toBe(400);
    }
  });

  it("solo el dueño, y solo sobre emisoras de su cliente", async () => {
    const programmer = await login(harness.app, fx.email.programmer);
    expect((await call("PATCH", url(), programmer, { name: "x" })).statusCode).toBe(403);
    expect((await call("PATCH", url(), undefined, { name: "x" })).statusCode).toBe(401);
    const other = await login(harness.app, fx.email.otherOwner);
    expect((await call("PATCH", url(), other, { name: "x" })).statusCode).toBe(404);
    expect((await call("GET", "/stations", owner)).json().items[0].name).toBe("FM A");
  });
});
