import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, agentTokens, eq, isNull, type Database } from "@nubera/db";
import { generateAgentToken } from "../auth/agent.js";
import { HttpError } from "../errors.js";
import { requireStation } from "./helpers.js";

const stationParams = z.object({ stationId: z.string().uuid() });
const tokenParams = stationParams.extend({ tokenId: z.string().uuid() });
const createBody = z.object({ name: z.string().trim().min(1).max(80) });

const publicColumns = {
  id: agentTokens.id,
  name: agentTokens.name,
  createdAt: agentTokens.createdAt,
  lastSeenAt: agentTokens.lastSeenAt,
};

export const agentRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  const manage = { preHandler: app.authorize("agents:manage") };

  // El token se muestra una sola vez: después solo queda su hash.
  app.post("/stations/:stationId/agent-tokens", manage, async (request, reply) => {
    const { stationId } = stationParams.parse(request.params);
    const { name } = createBody.parse(request.body);
    await requireStation(db, stationId, request.user!.tenantId);
    const { token, tokenHash } = generateAgentToken();
    const [created] = await db
      .insert(agentTokens)
      .values({ stationId, name, tokenHash })
      .returning(publicColumns);
    return reply.code(201).send({ ...created, token });
  });

  app.get("/stations/:stationId/agent-tokens", manage, async (request) => {
    const { stationId } = stationParams.parse(request.params);
    await requireStation(db, stationId, request.user!.tenantId);
    const items = await db
      .select(publicColumns)
      .from(agentTokens)
      .where(and(eq(agentTokens.stationId, stationId), isNull(agentTokens.revokedAt)));
    return { items };
  });

  app.delete("/stations/:stationId/agent-tokens/:tokenId", manage, async (request, reply) => {
    const { stationId, tokenId } = tokenParams.parse(request.params);
    await requireStation(db, stationId, request.user!.tenantId);
    const revoked = await db
      .update(agentTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentTokens.id, tokenId), eq(agentTokens.stationId, stationId), isNull(agentTokens.revokedAt)))
      .returning({ id: agentTokens.id });
    if (revoked.length === 0) {
      throw new HttpError(404, "Token no encontrado");
    }
    return reply.code(204).send();
  });
};
