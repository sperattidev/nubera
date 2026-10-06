import { and, eq, stations, type Database } from "@nubera/db";
import { HttpError } from "../errors.js";

/**
 * Devuelve la emisora si pertenece al cliente. Una emisora de otro cliente se
 * informa como inexistente para no revelar que existe.
 */
export async function requireStation(db: Database, stationId: string, tenantId: string) {
  const [station] = await db
    .select({ id: stations.id, timezone: stations.timezone })
    .from(stations)
    .where(and(eq(stations.id, stationId), eq(stations.tenantId, tenantId)))
    .limit(1);
  if (!station) {
    throw new HttpError(404, "Emisora no encontrada");
  }
  return station;
}
