// Crea un usuario desde la línea de comandos (alta del primer dueño de un cliente).
//
//   NUBERA_USER_PASSWORD='...' pnpm --filter @nubera/api create-user \
//     --tenant demo --email dueno@radio.com --name "Nombre" --role owner
//
// La contraseña se lee de una variable de entorno para no dejarla en el historial del shell.
import { parseArgs } from "node:util";
import { z } from "zod";
import { createDb, eq, tenants, userRoles, users } from "@nubera/db";
import { hashPassword } from "../auth/password.js";
import { emailSchema, newPasswordSchema } from "../auth/schemas.js";

const { values } = parseArgs({
  options: {
    tenant: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
  },
});

const input = z
  .object({
    tenant: z.string().min(1),
    email: emailSchema,
    name: z.string().trim().min(1).max(120),
    role: z.enum(userRoles),
    password: newPasswordSchema,
  })
  .parse({ ...values, password: process.env.NUBERA_USER_PASSWORD });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Definir DATABASE_URL");
}

const { db, close } = createDb(databaseUrl);
try {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, input.tenant)).limit(1);
  if (!tenant) {
    throw new Error(`No existe el cliente "${input.tenant}"`);
  }
  await db.insert(users).values({
    tenantId: tenant.id,
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(input.password),
  });
  console.log(`Usuario creado: ${input.email} (${input.role}) en "${tenant.slug}"`);
} finally {
  await close();
}
