import cookie from "@fastify/cookie";
import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { Database } from "@nubera/db";
import { HttpError } from "../errors.js";
import { findAgent, type AgentContext } from "./agent.js";
import { can, type Permission } from "./permissions.js";
import { findSessionUser, SESSION_COOKIE, type AuthUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
    agent: AgentContext | null;
  }
  interface FastifyInstance {
    /** preHandler que exige sesión válida y, si se indica, un permiso. */
    authorize(permission?: Permission): (request: FastifyRequest) => Promise<void>;
    /** preHandler para el motor de audio: exige un token de agente (Authorization: Bearer). */
    authorizeAgent(): (request: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp<{ db: Database }>(async (app, { db }) => {
  await app.register(cookie);
  app.decorateRequest("user", null);
  app.decorateRequest("agent", null);

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

  app.decorate("authorizeAgent", () => async (request: FastifyRequest) => {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const agent = token ? await findAgent(db, token) : null;
    if (!agent) {
      throw new HttpError(401, "Token de agente inválido");
    }
    request.agent = agent;
  });
});
