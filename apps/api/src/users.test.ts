import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, login, type Fixtures } from "./testing/harness.js";

let harness: Awaited<ReturnType<typeof createHarness>>;
let fx: Fixtures;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  fx = await harness.reset();
});

const newUser = { email: "Nuevo@A.test", name: "Nuevo", role: "announcer", password: "contraseña-nueva-123" };

describe("gestión de usuarios", () => {
  it("el dueño crea un usuario que puede iniciar sesión", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    const created = await harness.app.inject({ method: "POST", url: "/users", payload: newUser, headers: { cookie } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ email: "nuevo@a.test", role: "announcer", isActive: true });
    expect(created.json()).not.toHaveProperty("passwordHash");

    const session = await login(harness.app, "nuevo@a.test", newUser.password);
    expect(session).toContain("nubera_session=");
  });

  it("solo el dueño puede crear y listar usuarios", async () => {
    for (const role of ["programmer", "announcer", "sales"] as const) {
      const cookie = await login(harness.app, fx.email[role]);
      const create = await harness.app.inject({ method: "POST", url: "/users", payload: newUser, headers: { cookie } });
      const list = await harness.app.inject({ method: "GET", url: "/users", headers: { cookie } });
      expect([create.statusCode, list.statusCode]).toEqual([403, 403]);
    }
    expect((await harness.app.inject({ method: "GET", url: "/users" })).statusCode).toBe(401);
  });

  it("rechaza emails repetidos (incluso de otro cliente) y contraseñas débiles", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    const duplicate = await harness.app.inject({
      method: "POST",
      url: "/users",
      payload: { ...newUser, email: fx.email.otherOwner },
      headers: { cookie },
    });
    expect(duplicate.statusCode).toBe(409);
    const weak = await harness.app.inject({
      method: "POST",
      url: "/users",
      payload: { ...newUser, password: "corta" },
      headers: { cookie },
    });
    expect(weak.statusCode).toBe(400);
  });

  it("lista solo los usuarios del propio cliente", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    const list = await harness.app.inject({ method: "GET", url: "/users", headers: { cookie } });
    const emails = list.json().items.map((u: { email: string }) => u.email);
    expect(emails).toHaveLength(4);
    expect(emails).not.toContain(fx.email.otherOwner);
    expect(list.json().items[0]).not.toHaveProperty("passwordHash");
  });

  it("los usuarios nuevos quedan en el cliente de quien los crea", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    await harness.app.inject({ method: "POST", url: "/users", payload: newUser, headers: { cookie } });
    const created = await login(harness.app, "nuevo@a.test", newUser.password);
    const me = await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: created } });
    expect(me.json().user.tenantId).toBe(fx.tenantA);
  });
});
