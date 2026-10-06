import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./client.js";
import { migrationsFolder } from "./paths.js";
import * as schema from "./schema.js";

/** Base de datos en memoria con las migraciones aplicadas, para tests. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  return { db: db as Database, close: () => client.close() };
}
