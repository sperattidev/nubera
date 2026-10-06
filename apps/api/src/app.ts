import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Database } from "@nubera/db";
import { HttpError } from "./errors.js";
import { assetRoutes } from "./routes/assets.js";
import { EmptyFileError, FileTooLargeError, type MediaStorage } from "./storage.js";

export interface AppDependencies {
  db: Database;
  storage: MediaStorage;
  /** Tamaño máximo de un archivo subido, en bytes. */
  maxUploadBytes: number;
}

export function buildApp({ db, storage, maxUploadBytes }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // El límite de multipart es 1 byte mayor al del almacenamiento para que sea
  // éste el que detecte (y rechace) un archivo que excede el máximo.
  app.register(multipart, { limits: { fileSize: maxUploadBytes + 1, files: 1 } });

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
    app.log.error(error);
    return reply.code(500).send({ error: "Error interno" });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.register(assetRoutes, { db, storage });

  return app;
}
