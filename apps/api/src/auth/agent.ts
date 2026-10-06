import { createHash, randomBytes } from "node:crypto";
import { and, agentTokens, eq, isNull, type Database } from "@nubera/db";

export interface AgentContext {
  tokenId: string;
  stationId: string;
}

const TOKEN_PREFIX = "nbr_";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Genera un token nuevo. El prefijo permite detectarlo si se filtra en un repositorio. */
export function generateAgentToken(): { token: string; tokenHash: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export async function findAgent(db: Database, token: string): Promise<AgentContext | null> {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const [row] = await db
    .select({ tokenId: agentTokens.id, stationId: agentTokens.stationId })
    .from(agentTokens)
    .where(and(eq(agentTokens.tokenHash, hashToken(token)), isNull(agentTokens.revokedAt)))
    .limit(1);
  if (!row) {
    return null;
  }
  await db.update(agentTokens).set({ lastSeenAt: new Date() }).where(eq(agentTokens.id, row.tokenId));
  return row;
}
