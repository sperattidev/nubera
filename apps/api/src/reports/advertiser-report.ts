import { formatLocal, localDate } from "@nubera/core";
import { advertisers, and, asc, campaigns, eq, gte, isNotNull, lt, plays, stations, type Database } from "@nubera/db";
import { HttpError } from "../errors.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;
const MAX_ROWS = 10_000;

/** Un período válido empieza antes de terminar y no supera un año. */
export function assertValidRange(from: Date, to: Date): void {
  if (from >= to) {
    throw new HttpError(400, "El inicio del período debe ser anterior al fin");
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new HttpError(400, `El período no puede superar ${MAX_RANGE_DAYS} días`);
  }
}

export interface ReportItem {
  startedAt: Date;
  localTime: string;
  station: string;
  campaign: string;
  campaignId: string;
  spot: string;
  /** Día local de la emisora, "2026-10-06". */
  date: string;
}

export interface AdvertiserReport {
  advertiser: { id: string; name: string };
  truncated: boolean;
  items: ReportItem[];
  perDay: { date: string; count: number }[];
  perCampaign: { campaignId: string; name: string; count: number }[];
}

/**
 * Certificado de emisión (as-run): cada aviso del anunciante que efectivamente salió al aire en el
 * período. Devuelve null si el anunciante no es del cliente indicado.
 */
export async function loadAdvertiserReport(
  db: Database,
  options: { advertiserId: string; tenantId: string; from: Date; to: Date; stationId?: string },
): Promise<AdvertiserReport | null> {
  const { advertiserId, tenantId, from, to, stationId } = options;

  const [advertiser] = await db
    .select({ id: advertisers.id, name: advertisers.name })
    .from(advertisers)
    .where(and(eq(advertisers.id, advertiserId), eq(advertisers.tenantId, tenantId)))
    .limit(1);
  if (!advertiser) {
    return null;
  }

  const filters = [
    eq(campaigns.advertiserId, advertiserId),
    isNotNull(plays.startedAt),
    gte(plays.startedAt, from),
    lt(plays.startedAt, to),
  ];
  if (stationId) {
    filters.push(eq(plays.stationId, stationId));
  }
  const rows = await db
    .select({
      startedAt: plays.startedAt,
      station: stations.name,
      timezone: stations.timezone,
      campaignId: campaigns.id,
      campaign: campaigns.name,
      spot: plays.title,
    })
    .from(plays)
    .innerJoin(campaigns, eq(plays.campaignId, campaigns.id))
    .innerJoin(stations, eq(plays.stationId, stations.id))
    .where(and(...filters))
    .orderBy(asc(plays.startedAt))
    .limit(MAX_ROWS + 1);

  const truncated = rows.length > MAX_ROWS;
  const items: ReportItem[] = rows.slice(0, MAX_ROWS).map((row) => ({
    startedAt: row.startedAt!,
    localTime: formatLocal(row.startedAt!, row.timezone),
    station: row.station,
    campaign: row.campaign,
    campaignId: row.campaignId,
    spot: row.spot,
    date: localDate(row.startedAt!, row.timezone),
  }));

  const perDay = new Map<string, number>();
  const perCampaign = new Map<string, { campaignId: string; name: string; count: number }>();
  for (const item of items) {
    perDay.set(item.date, (perDay.get(item.date) ?? 0) + 1);
    const entry = perCampaign.get(item.campaignId) ?? { campaignId: item.campaignId, name: item.campaign, count: 0 };
    entry.count += 1;
    perCampaign.set(item.campaignId, entry);
  }

  return {
    advertiser,
    truncated,
    items,
    perDay: [...perDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    perCampaign: [...perCampaign.values()],
  };
}

/** Escapa una celda CSV y neutraliza fórmulas (=, +, -, @) que un programa de planillas ejecutaría. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function fileSlug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "anunciante"
  );
}

/** El CSV del certificado, con su nombre de archivo. Lleva BOM para que Excel respete los acentos. */
export function reportCsv(report: AdvertiserReport, from: Date, to: Date): { filename: string; body: string } {
  const lines = [
    ["fecha_hora_local", "emisora", "campana", "aviso"].join(","),
    ...report.items.map((item) => [item.localTime, item.station, item.campaign, item.spot].map(csvCell).join(",")),
  ];
  return {
    filename: `certificado-${fileSlug(report.advertiser.name)}-${localDate(from, "UTC")}_${localDate(to, "UTC")}.csv`,
    body: `\uFEFF${lines.join("\r\n")}\r\n`,
  };
}
