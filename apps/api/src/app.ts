import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Database } from "@nubera/db";
import { authPlugin } from "./auth/plugin.js";
import { DEFAULT_SESSION_TTL_SECONDS } from "./auth/session.js";
import { HttpError } from "./errors.js";
import { adRoutes } from "./routes/ads.js";
import { agentRoutes } from "./routes/agents.js";
import { assetRoutes } from "./routes/assets.js";
import { authRoutes } from "./routes/auth.js";
import { playoutRoutes } from "./routes/playout.js";
import { reportRoutes } from "./routes/reports.js";
import { scheduleRoutes } from "./routes/schedule.js";
import { userRoutes } from "./routes/users.js";
import { EmptyFileError, FileTooLargeError, type MediaStorage } from "./storage.js";

export interface AppDependencies {
  db: Database;
  storage: MediaStorage;
  /** Tamaño máximo de un archivo subido, en bytes. */
  maxUploadBytes: number;
  /** Cookie de sesión solo por HTTPS. Activar en producción. */
  secureCookies?: boolean;
  sessionTtlSeconds?: number;
  /** Intentos de login por minuto y por IP. */
  loginRateLimitMax?: number;
  /** Confiar en X-Forwarded-For (solo detrás de un proxy propio). */
  trustProxy?: boolean;
  /** Reloj y azar inyectables, para tests deterministas. */
  now?: () => Date;
  random?: () => number;
}

export function buildApp({
  db,
  storage,
  maxUploadBytes,
  secureCookies = false,
  sessionTtlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  loginRateLimitMax = 5,
  trustProxy = false,
  now = () => new Date(),
  random,
}: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", trustProxy });

  // El límite de multipart es 1 byte mayor al del almacenamiento para que sea
  // éste el que detecte (y rechace) un archivo que excede el máximo.
  app.register(multipart, { limits: { fileSize: maxUploadBytes + 1, files: 1 } });
  app.register(rateLimit, { global: false });
  app.register(authPlugin, { db });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Solicitud inválida", issues: error.issues });
    }
    if (error instanceof FileTooLargeError) {
      return reply.code(413).send({ error: error.message });
    }
    if (error instanceof EmptyFileError) {
      return reply.code(400).send({ error: error.message });
    }
    // Errores de Fastify y de plugins con código 4xx (429, JSON inválido, etc.).
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: (error as Error).message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "Error interno" });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.register(authRoutes, { db, sessionTtlSeconds, secureCookies, loginRateLimitMax });
  app.register(userRoutes, { db });
  app.register(assetRoutes, { db, storage });
  app.register(scheduleRoutes, { db, now });
  app.register(agentRoutes, { db });
  app.register(playoutRoutes, { db, now, random });
  app.register(adRoutes, { db });
  app.register(reportRoutes, { db, now });

  return app;
}
