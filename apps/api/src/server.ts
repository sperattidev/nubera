import path from "node:path";
import { createDb } from "@nubera/db";
import { buildApp } from "./app.js";
import { LocalMediaStorage } from "./storage.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Definir DATABASE_URL");
}
const mediaDir = path.resolve(process.env.MEDIA_DIR ?? "./data/storage");
const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB ?? 200) * 1024 * 1024;

const { db, close } = createDb(databaseUrl);
const app = buildApp({
  db,
  storage: new LocalMediaStorage(mediaDir, maxUploadBytes),
  maxUploadBytes,
});
app.addHook("onClose", async () => {
  await close();
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
