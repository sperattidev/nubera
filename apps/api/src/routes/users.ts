import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, desc, eq, userRoles, users, type Database } from "@nubera/db";
import { hashPassword } from "../auth/password.js";
import { emailSchema, newPasswordSchema } from "../auth/schemas.js";
import { destroyUserSessions } from "../auth/session.js";
import { HttpError } from "../errors.js";

const userParams = z.object({ userId: z.string().uuid() });

const createUserBody = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  role: z.enum(userRoles),
  password: newPasswordSchema,
});

const updateUserBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(userRoles).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), { message: "No hay nada para modificar" });

const resetPasswordBody = z.object({ password: newPasswordSchema });

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

export const userRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  const manage = { preHandler: app.authorize("users:manage") };

  /** Usuario del mismo cliente; uno de otro cliente se informa como inexistente. */
  async function findInTenant(userId: string, tenantId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }
    return user;
  }

  app.get("/users", manage, async (request) => {
    const items = await db
      .select(publicColumns)
      .from(users)
      .where(eq(users.tenantId, request.user!.tenantId))
      .orderBy(desc(users.createdAt));
    return { items };
  });

  app.post("/users", manage, async (request, reply) => {
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

  // Cambia nombre, rol o estado. Desactivar a alguien le cierra todas sus sesiones.
  // Nadie puede quitarse a sí mismo el rol de dueño ni desactivarse: así el cliente
  // siempre conserva al menos un dueño activo (quien está haciendo el cambio).
  app.patch("/users/:userId", manage, async (request) => {
    const { userId } = userParams.parse(request.params);
    const body = updateUserBody.parse(request.body);
    const target = await findInTenant(userId, request.user!.tenantId);

    if (target.id === request.user!.id) {
      const losesAccess = body.isActive === false;
      const changesRole = body.role !== undefined && body.role !== target.role;
      if (losesAccess || changesRole) {
        throw new HttpError(409, "No podés cambiar tu propio rol ni desactivar tu propia cuenta");
      }
    }

    const [updated] = await db.update(users).set(body).where(eq(users.id, target.id)).returning(publicColumns);
    if (body.isActive === false) {
      await destroyUserSessions(db, target.id);
    }
    return updated;
  });

  // El dueño define una contraseña nueva para otra persona (p. ej. si la olvidó).
  // Se cierran todas sus sesiones. La propia se cambia desde /auth/password.
  app.post("/users/:userId/password", manage, async (request, reply) => {
    const { userId } = userParams.parse(request.params);
    const { password } = resetPasswordBody.parse(request.body);
    const target = await findInTenant(userId, request.user!.tenantId);
    if (target.id === request.user!.id) {
      throw new HttpError(409, "Tu propia contraseña se cambia desde Mi cuenta");
    }
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, target.id));
    await destroyUserSessions(db, target.id);
    return reply.code(204).send();
  });
};
