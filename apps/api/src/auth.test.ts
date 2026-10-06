import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sessions, users } from "@nubera/db";
import { createHarness, login, PASSWORD, type Fixtures } from "./testing/harness.js";
import { hashPassword, verifyPassword } from "./auth/password.js";

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

const post = (url: string, payload: unknown, cookie?: string) =>
  harness.app.inject({ method: "POST", url, payload: payload as object, headers: cookie ? { cookie } : {} });

describe("hash de contraseñas", () => {
  it("verifica la correcta y rechaza la incorrecta", async () => {
    const hash = await hashPassword("una-contraseña-larga");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("una-contraseña-larga", hash)).toBe(true);
    expect(await verifyPassword("otra-contraseña-larga", hash)).toBe(false);
    expect(await verifyPassword("x", "formato-invalido")).toBe(false);
  });

  it("genera sales distintas para la misma contraseña", async () => {
    expect(await hashPassword("misma-contraseña-12")).not.toBe(await hashPassword("misma-contraseña-12"));
  });
});

describe("login", () => {
  it("inicia sesión y entrega una cookie httpOnly", async () => {
    const response = await post("/auth/login", { email: fx.email.owner, password: PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ email: fx.email.owner, role: "owner" });
    expect(response.json().user).not.toHaveProperty("passwordHash");
    const cookie = response.cookies[0]!;
    expect(cookie).toMatchObject({ name: "nubera_session", httpOnly: true, sameSite: "Lax", path: "/" });
  });

  it("normaliza el email (mayúsculas y espacios)", async () => {
    const response = await post("/auth/login", { email: `  ${fx.email.owner.toUpperCase()} `, password: PASSWORD });
    expect(response.statusCode).toBe(200);
  });

  it("da el mismo error para email inexistente y contraseña incorrecta", async () => {
    const wrongPassword = await post("/auth/login", { email: fx.email.owner, password: "incorrecta" });
    const unknownEmail = await post("/auth/login", { email: "nadie@a.test", password: PASSWORD });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it("rechaza a un usuario desactivado", async () => {
    await harness.db.update(users).set({ isActive: false }).where(eq(users.email, fx.email.owner));
    const response = await post("/auth/login", { email: fx.email.owner, password: PASSWORD });
    expect(response.statusCode).toBe(401);
  });

  it("guarda solo el hash del token de sesión", async () => {
    const response = await post("/auth/login", { email: fx.email.owner, password: PASSWORD });
    const token = response.cookies[0]!.value;
    const stored = await harness.db.select().from(sessions);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toBe(token);
  });
});

describe("sesión", () => {
  it("/auth/me exige sesión y devuelve el usuario", async () => {
    expect((await harness.app.inject({ method: "GET", url: "/auth/me" })).statusCode).toBe(401);
    const cookie = await login(harness.app, fx.email.programmer);
    const me = await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: fx.email.programmer, role: "programmer" });
    expect(me.json().user).not.toHaveProperty("sessionId");
  });

  it("rechaza un token inventado", async () => {
    const me = await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: "nubera_session=inventado" } });
    expect(me.statusCode).toBe(401);
  });

  it("logout invalida la sesión", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    expect((await post("/auth/logout", undefined, cookie)).statusCode).toBe(204);
    const me = await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it("una sesión vencida deja de valer", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    await harness.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    const me = await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it("desactivar al usuario corta su sesión activa", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    await harness.db.update(users).set({ isActive: false }).where(eq(users.email, fx.email.owner));
    const me = await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});

describe("cambio de contraseña", () => {
  it("cambia la contraseña y cierra las otras sesiones", async () => {
    const current = await login(harness.app, fx.email.owner);
    const other = await login(harness.app, fx.email.owner);
    const nueva = "otra-contraseña-segura-9";

    const changed = await post("/auth/password", { currentPassword: PASSWORD, newPassword: nueva }, current);
    expect(changed.statusCode).toBe(204);

    expect((await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: current } })).statusCode).toBe(200);
    expect((await harness.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: other } })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: fx.email.owner, password: PASSWORD })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: fx.email.owner, password: nueva })).statusCode).toBe(200);
  });

  it("exige la contraseña actual y una nueva suficientemente larga", async () => {
    const cookie = await login(harness.app, fx.email.owner);
    expect((await post("/auth/password", { currentPassword: "mal", newPassword: "otra-contraseña-segura-9" }, cookie)).statusCode).toBe(401);
    expect((await post("/auth/password", { currentPassword: PASSWORD, newPassword: "corta" }, cookie)).statusCode).toBe(400);
  });
});

describe("límite de intentos", () => {
  it("responde 429 al superar los intentos por minuto", async () => {
    const limited = await createHarness({ loginRateLimitMax: 3 });
    try {
      const fixtures = await limited.reset();
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const response = await limited.app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: fixtures.email.owner, password: "incorrecta" },
        });
        codes.push(response.statusCode);
      }
      expect(codes).toEqual([401, 401, 401, 429, 429]);
    } finally {
      await limited.close();
    }
  });
});
