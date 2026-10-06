import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.js";

/** Tipo común a node-postgres (producción) y PGlite (tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };
}
