import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";
import { migrationsFolder } from "./paths.js";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Definir DATABASE_URL");
}

const { db, close } = createDb(url);
try {
  await migrate(db, { migrationsFolder });
  console.log("Migraciones aplicadas");
} finally {
  await close();
}
