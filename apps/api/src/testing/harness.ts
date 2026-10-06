import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { sql, stations, tenants, users, type Database } from "@nubera/db";
import { createTestDb } from "@nubera/db/testing";
import { buildApp, type AppDependencies } from "../app.js";
import { hashPassword } from "../auth/password.js";
import type { Role } from "../auth/permissions.js";
import { LocalMediaStorage } from "../storage.js";

export const MAX_BYTES = 1024;
export const PASSWORD = "contraseña-de-prueba-123";

const ROLES: Role[] = ["owner", "programmer", "announcer", "sales"];

export interface Fixtures {
  stationA: string;
  stationB: string;
  tenantA: string;
  /** Email de cada rol del cliente A; "otherOwner" pertenece al cliente B. */
  email: Record<Role | "otherOwner", string>;
}

/**
 * Base en memoria + app. Arrancar PGlite y hashear contraseñas es lento, por eso
 * se hace una vez por archivo de test y `reset()` solo limpia y vuelve a sembrar.
 */
export async function createHarness(overrides: Partial<AppDependencies> = {}) {
  const { db, close } = await createTestDb();
  const dir = await mkdtemp(path.join(os.tmpdir(), "nubera-test-"));
  const passwordHash = await hashPassword(PASSWORD);

  const app = buildApp({
    db,
    storage: new LocalMediaStorage(dir, MAX_BYTES),
    maxUploadBytes: MAX_BYTES,
    loginRateLimitMax: 1000,
    ...overrides,
  });
  await app.ready();

  async function reset(): Promise<Fixtures> {
    await db.execute(sql`truncate table tenants cascade`);
    const [a, b] = await db
      .insert(tenants)
      .values([
        { name: "Radio A", slug: "a" },
        { name: "Radio B", slug: "b" },
      ])
      .returning();
    const [stationA, stationB] = await db
      .insert(stations)
      .values([
        { tenantId: a!.id, name: "FM A", slug: "fm-a" },
        { tenantId: b!.id, name: "FM B", slug: "fm-b" },
      ])
      .returning();
    const email = { otherOwner: "owner@b.test" } as Fixtures["email"];
    for (const role of ROLES) {
      email[role] = `${role}@a.test`;
      await db.insert(users).values({ tenantId: a!.id, email: email[role], name: role, role, passwordHash });
    }
    await db.insert(users).values({ tenantId: b!.id, email: email.otherOwner, name: "otro", role: "owner", passwordHash });
    return { stationA: stationA!.id, stationB: stationB!.id, tenantA: a!.id, email };
  }

  async function close_() {
    await app.close();
    await close();
    await rm(dir, { recursive: true, force: true });
  }

  return { app, db, dir, reset, close: close_ };
}

/** Inicia sesión y devuelve el valor para el header Cookie. */
export async function login(app: FastifyInstance, email: string, password = PASSWORD): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  if (response.statusCode !== 200) {
    throw new Error(`Login falló (${response.statusCode}): ${response.body}`);
  }
  const cookie = response.cookies[0];
  return `${cookie!.name}=${cookie!.value}`;
}

export type { Database };
