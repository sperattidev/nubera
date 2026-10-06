import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, ne, sessions, users, type Database } from "@nubera/db";
import type { Role } from "./permissions.js";

export const SESSION_COOKIE = "nubera_session";
export const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Database, userId: string, ttlSeconds: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function findSessionUser(db: Database, token: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      name: users.name,
      role: users.role,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function destroySession(db: Database, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Cierra todas las sesiones del usuario, salvo opcionalmente una. */
export async function destroyUserSessions(db: Database, userId: string, exceptSessionId?: string) {
  const filter = exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
    : eq(sessions.userId, userId);
  await db.delete(sessions).where(filter);
}
