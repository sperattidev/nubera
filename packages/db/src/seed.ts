import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { stations, tenants } from "./schema.js";

// Datos de demostración para desarrollo. Idempotente.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Definir DATABASE_URL");
}

const { db, close } = createDb(url);
try {
  await db
    .insert(tenants)
    .values({ name: "Radio Demo", slug: "demo" })
    .onConflictDoNothing({ target: tenants.slug });
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "demo"));
  if (!tenant) {
    throw new Error("No se pudo crear el tenant de demostración");
  }

  await db
    .insert(stations)
    .values({ tenantId: tenant.id, name: "FM Demo", slug: "fm-demo" })
    .onConflictDoNothing();
  const [station] = await db.select().from(stations).where(eq(stations.tenantId, tenant.id));
  console.log(`Emisora de demostración: ${station?.id}`);
} finally {
  await close();
}
