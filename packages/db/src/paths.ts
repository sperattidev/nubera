import { fileURLToPath } from "node:url";

/** Carpeta con las migraciones SQL generadas por drizzle-kit. */
export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
