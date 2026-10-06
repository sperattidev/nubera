import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { desc, eq, userRoles, users, type Database } from "@nubera/db";
import { hashPassword } from "../auth/password.js";
import { emailSchema, newPasswordSchema } from "../auth/schemas.js";
import { HttpError } from "../errors.js";

const createUserBody = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  role: z.enum(userRoles),
  password: newPasswordSchema,
});

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

export const userRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.get("/users", { preHandler: app.authorize("users:manage") }, async (request) => {
    const items = await db
      .select(publicColumns)
      .from(users)
      .where(eq(users.tenantId, request.user!.tenantId))
      .orderBy(desc(users.createdAt));
    return { items };
  });

  app.post("/users", { preHandler: app.authorize("users:manage") }, async (request, reply) => {
    const body = createUserBody.parse(request.body);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (existing) {
      throw new HttpError(409, "Ya existe un usuario con ese email");
    }
    const [created] = await db
      .insert(users)
      .values({
        tenantId: request.user!.tenantId,
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password),
      })
      .returning(publicColumns);
    return reply.code(201).send(created);
  });
};
