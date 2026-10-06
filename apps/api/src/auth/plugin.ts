import cookie from "@fastify/cookie";
import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { Database } from "@nubera/db";
import { HttpError } from "../errors.js";
import { can, type Permission } from "./permissions.js";
import { findSessionUser, SESSION_COOKIE, type AuthUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    /** preHandler que exige sesión válida y, si se indica, un permiso. */
    authorize(permission?: Permission): (request: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp<{ db: Database }>(async (app, { db }) => {
  await app.register(cookie);
  app.decorateRequest("user", null);

  app.decorate("authorize", (permission?: Permission) => async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    const user = token ? await findSessionUser(db, token) : null;
    if (!user) {
      throw new HttpError(401, "Autenticación requerida");
    }
    if (permission && !can(user.role, permission)) {
      throw new HttpError(403, "No tenés permiso para esta acción");
    }
    request.user = user;
  });
});
