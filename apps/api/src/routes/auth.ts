import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { eq, users, type Database } from "@nubera/db";
import { emailSchema, newPasswordSchema } from "../auth/schemas.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../auth/password.js";
import {
  createSession,
  destroySession,
  destroyUserSessions,
  SESSION_COOKIE,
} from "../auth/session.js";
import { HttpError } from "../errors.js";

interface Options {
  db: Database;
  sessionTtlSeconds: number;
  secureCookies: boolean;
  loginRateLimitMax: number;
}

const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
});

export const authRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, sessionTtlSeconds, secureCookies, loginRateLimitMax },
) => {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: loginRateLimitMax, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { email, password } = loginBody.parse(request.body);
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
      if (!user || !valid || !user.isActive) {
        throw new HttpError(401, "Credenciales inválidas");
      }

      const { token, expiresAt } = await createSession(db, user.id, sessionTtlSeconds);
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
        expires: expiresAt,
      });
      return {
        user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role },
      };
    },
  );

  app.post("/auth/logout", { preHandler: app.authorize() }, async (request, reply) => {
    await destroySession(db, request.user!.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: app.authorize() }, async (request) => {
    const { sessionId: _sessionId, ...user } = request.user!;
    return { user };
  });

  // Cambia la contraseña y cierra el resto de las sesiones del usuario.
  app.post("/auth/password", { preHandler: app.authorize() }, async (request, reply) => {
    const { currentPassword, newPassword } = changePasswordBody.parse(request.body);
    const current = request.user!;
    const [user] = await db.select().from(users).where(eq(users.id, current.id)).limit(1);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(401, "La contraseña actual no es correcta");
    }
    await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
    await destroyUserSessions(db, user.id, current.sessionId);
    return reply.code(204).send();
  });
};
