import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BLOCK_MODES, findActiveBlock, formatClock, LIVE_ROTATION, parseClock, rotationSchema } from "@nubera/core";
import { and, eq, scheduleBlocks, type ScheduleBlock, type Database } from "@nubera/db";
import { HttpError } from "../errors.js";
import { requireStation } from "./helpers.js";

const stationParams = z.object({ stationId: z.string().uuid() });
const blockParams = stationParams.extend({ blockId: z.string().uuid() });

const clock = z
  .string()
  .refine((value) => parseClock(value) !== null, { message: "Formato HH:MM (00:00 a 24:00)" })
  .transform((value) => parseClock(value)!);

const blockBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    start: clock,
    end: clock,
    mode: z.enum(BLOCK_MODES).default("auto"),
    /** Obligatoria en los bloques automáticos; un programa en vivo no la necesita. */
    rotation: rotationSchema.optional(),
  })
  .refine((block) => block.end > block.start, {
    message: "El fin debe ser posterior al inicio (para cruzar la medianoche, usar dos bloques)",
    path: ["end"],
  })
  .refine((block) => block.mode === "live" || block.rotation !== undefined, {
    message: "Un bloque automático necesita su rotación",
    path: ["rotation"],
  });

const rotationOf = (body: z.infer<typeof blockBody>) => (body.mode === "live" ? LIVE_ROTATION : body.rotation!);

const nowQuery = z.object({ at: z.coerce.date().optional() });

function serialize(block: ScheduleBlock) {
  return {
    id: block.id,
    name: block.name,
    mode: block.mode,
    days: block.days,
    start: formatClock(block.startMinute),
    end: formatClock(block.endMinute),
    rotation: block.rotation,
  };
}

interface Options {
  db: Database;
  now: () => Date;
}

export const scheduleRoutes: FastifyPluginAsync<Options> = async (app, { db, now }) => {
  const read = { preHandler: app.authorize("schedule:read") };
  const write = { preHandler: app.authorize("schedule:write") };

  app.get("/stations/:stationId/schedule", read, async (request) => {
    const { stationId } = stationParams.parse(request.params);
    await requireStation(db, stationId, request.user!.tenantId);
    const rows = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.stationId, stationId));
    const items = rows
      .map(serialize)
      .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    return { items };
  });

  // Bloque vigente en un instante (por defecto, ahora): útil para previsualizar la grilla.
  app.get("/stations/:stationId/schedule/now", read, async (request) => {
    const { stationId } = stationParams.parse(request.params);
    const { at = now() } = nowQuery.parse(request.query);
    const station = await requireStation(db, stationId, request.user!.tenantId);
    const rows = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.stationId, stationId));
    const active = findActiveBlock(rows, at, station.timezone);
    return { at, timezone: station.timezone, block: active ? serialize(active) : null };
  });

  app.post("/stations/:stationId/schedule", write, async (request, reply) => {
    const { stationId } = stationParams.parse(request.params);
    const body = blockBody.parse(request.body);
    await requireStation(db, stationId, request.user!.tenantId);
    const [created] = await db
      .insert(scheduleBlocks)
      .values({
        stationId,
        name: body.name,
        mode: body.mode,
        days: body.days,
        startMinute: body.start,
        endMinute: body.end,
        rotation: rotationOf(body),
      })
      .returning();
    return reply.code(201).send(serialize(created!));
  });

  app.put("/stations/:stationId/schedule/:blockId", write, async (request) => {
    const { stationId, blockId } = blockParams.parse(request.params);
    const body = blockBody.parse(request.body);
    await requireStation(db, stationId, request.user!.tenantId);
    const [updated] = await db
      .update(scheduleBlocks)
      .set({
        name: body.name,
        mode: body.mode,
        days: body.days,
        startMinute: body.start,
        endMinute: body.end,
        rotation: rotationOf(body),
      })
      .where(and(eq(scheduleBlocks.id, blockId), eq(scheduleBlocks.stationId, stationId)))
      .returning();
    if (!updated) {
      throw new HttpError(404, "Bloque no encontrado");
    }
    return serialize(updated);
  });

  app.delete("/stations/:stationId/schedule/:blockId", write, async (request, reply) => {
    const { stationId, blockId } = blockParams.parse(request.params);
    await requireStation(db, stationId, request.user!.tenantId);
    const deleted = await db
      .delete(scheduleBlocks)
      .where(and(eq(scheduleBlocks.id, blockId), eq(scheduleBlocks.stationId, stationId)))
      .returning({ id: scheduleBlocks.id });
    if (deleted.length === 0) {
      throw new HttpError(404, "Bloque no encontrado");
    }
    return reply.code(204).send();
  });
};
