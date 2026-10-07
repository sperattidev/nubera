import { localDate, parseClock } from "@nubera/core";

// ---------------------------------------------------------------------------
// Tipos de la API
// ---------------------------------------------------------------------------

export interface Advertiser {
  id: string;
  name: string;
  industry: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  advertiserName: string;
  name: string;
  /** Fechas locales de la emisora, "AAAA-MM-DD", inclusivas. */
  startsOn: string;
  endsOn: string;
  dailyPlays: number | null;
  weight: number;
  days: number[];
  start: string;
  end: string;
  isActive: boolean;
  assets: { id: string; title: string }[];
}

export interface ReportItem {
  startedAt: string;
  localTime: string;
  station: string;
  campaign: string;
  campaignId: string;
  spot: string;
}

export interface AdReport {
  advertiser: { id: string; name: string };
  from: string;
  to: string;
  total: number;
  truncated: boolean;
  perDay: { date: string; count: number }[];
  perCampaign: { campaignId: string; name: string; count: number }[];
  items: ReportItem[];
}

// ---------------------------------------------------------------------------
// Fechas (en formato "AAAA-MM-DD", sin zonas horarias de por medio)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtc(value));

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Días entre dos fechas (positivo si `to` es posterior). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** "2026-10-06" → "6 oct 2026". */
export function formatDate(iso: string): string {
  // Se arma desde las partes: el texto completo de Intl en es-AR trae "de" ("6 de oct de 2026").
  const parts = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatToParts(new Date(toUtc(iso)));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month").replace(".", "")} ${part("year")}`;
}

// ---------------------------------------------------------------------------
// Estado de una campaña
// ---------------------------------------------------------------------------

export type CampaignStatus = "active" | "scheduled" | "ended" | "paused";

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  active: "Vigente",
  scheduled: "Programada",
  ended: "Finalizada",
  paused: "Pausada",
};

/**
 * Estado a una fecha local dada. Si ya terminó, es "Finalizada" aunque esté
 * pausada; una pausa solo importa mientras la campaña todavía puede salir al aire.
 */
export function campaignStatus(campaign: Pick<Campaign, "startsOn" | "endsOn" | "isActive">, today: string): CampaignStatus {
  if (today > campaign.endsOn) return "ended";
  if (!campaign.isActive) return "paused";
  if (today < campaign.startsOn) return "scheduled";
  return "active";
}

/** Avance de la campaña entre 0 y 1 (0 si todavía no empezó, 1 si ya terminó). */
export function flightProgress(campaign: Pick<Campaign, "startsOn" | "endsOn">, today: string): number {
  const total = daysBetween(campaign.startsOn, campaign.endsOn) + 1;
  const elapsed = daysBetween(campaign.startsOn, today) + 1;
  return Math.min(Math.max(elapsed / total, 0), 1);
}

/** "Faltan 12 días", "Termina hoy", "Empieza en 3 días", "Terminó hace 2 días". */
export function flightCaption(campaign: Pick<Campaign, "startsOn" | "endsOn">, today: string): string {
  const plural = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
  if (today < campaign.startsOn) return `Empieza en ${plural(daysBetween(today, campaign.startsOn))}`;
  if (today > campaign.endsOn) return `Terminó hace ${plural(daysBetween(campaign.endsOn, today))}`;
  const left = daysBetween(today, campaign.endsOn);
  return left === 0 ? "Termina hoy" : `Faltan ${plural(left)}`;
}

// ---------------------------------------------------------------------------
// Formulario de campaña
// ---------------------------------------------------------------------------

export interface CampaignForm {
  advertiserId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  days: number[];
  start: string;
  end: string;
  limitDaily: boolean;
  dailyPlays: number;
  weight: number;
  isActive: boolean;
  assetIds: string[];
}

export function newCampaignForm(today: string, advertiserId = ""): CampaignForm {
  return {
    advertiserId,
    name: "",
    startsOn: today,
    endsOn: addDays(today, 29),
    days: [1, 2, 3, 4, 5, 6, 7],
    start: "00:00",
    end: "24:00",
    limitDaily: false,
    dailyPlays: 20,
    weight: 1,
    isActive: true,
    assetIds: [],
  };
}

export function campaignToForm(campaign: Campaign): CampaignForm {
  return {
    advertiserId: campaign.advertiserId,
    name: campaign.name,
    startsOn: campaign.startsOn,
    endsOn: campaign.endsOn,
    days: [...campaign.days],
    start: campaign.start,
    end: campaign.end,
    limitDaily: campaign.dailyPlays !== null,
    dailyPlays: campaign.dailyPlays ?? 20,
    weight: campaign.weight,
    isActive: campaign.isActive,
    assetIds: campaign.assets.map((asset) => asset.id),
  };
}

export function campaignPayload(form: CampaignForm) {
  return {
    advertiserId: form.advertiserId,
    name: form.name.trim(),
    startsOn: form.startsOn,
    endsOn: form.endsOn,
    dailyPlays: form.limitDaily ? form.dailyPlays : null,
    weight: form.weight,
    days: [...form.days].sort((a, b) => a - b),
    start: form.start,
    end: form.end,
    assetIds: form.assetIds,
    isActive: form.isActive,
  };
}

const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

/** Motivos por los que la campaña no se puede guardar (vacío si es válida). */
export function campaignProblems(form: CampaignForm): string[] {
  const problems: string[] = [];
  if (!form.advertiserId) problems.push("Elegí el anunciante.");
  if (!form.name.trim()) problems.push("Poné un nombre a la campaña.");
  if (!isIsoDate(form.startsOn) || !isIsoDate(form.endsOn)) {
    problems.push("Completá las fechas de inicio y de fin.");
  } else if (form.endsOn < form.startsOn) {
    problems.push("La campaña no puede terminar antes de empezar.");
  }
  if (form.days.length === 0) problems.push("Elegí al menos un día.");
  if ((parseClock(form.end) ?? 0) <= (parseClock(form.start) ?? 0)) {
    problems.push("El fin de la franja horaria tiene que ser posterior al inicio.");
  }
  if (form.assetIds.length === 0) problems.push("Elegí al menos un aviso.");
  if (form.assetIds.length > 20) problems.push("Una campaña admite hasta 20 avisos.");
  if (!inRange(form.weight, 1, 100)) problems.push("El peso va de 1 a 100.");
  if (form.limitDaily && !inRange(form.dailyPlays, 1, 1000)) problems.push("El tope diario va de 1 a 1000 emisiones.");
  return problems;
}

// ---------------------------------------------------------------------------
// Formulario de anunciante
// ---------------------------------------------------------------------------

export interface AdvertiserForm {
  name: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  isActive: boolean;
}

export const emptyAdvertiserForm = (): AdvertiserForm => ({
  name: "",
  industry: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
  isActive: true,
});

export const advertiserToForm = (advertiser: Advertiser): AdvertiserForm => ({
  name: advertiser.name,
  industry: advertiser.industry ?? "",
  contactName: advertiser.contactName ?? "",
  contactEmail: advertiser.contactEmail ?? "",
  contactPhone: advertiser.contactPhone ?? "",
  notes: advertiser.notes ?? "",
  isActive: advertiser.isActive,
});

export function advertiserProblems(form: AdvertiserForm): string[] {
  const problems: string[] = [];
  if (!form.name.trim()) problems.push("Poné el nombre del anunciante.");
  if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
    problems.push("El email de contacto no es válido.");
  }
  return problems;
}

/** Los campos vacíos se envían como vacíos: la API los guarda como "sin dato". */
export function advertiserPayload(form: AdvertiserForm) {
  return {
    name: form.name.trim(),
    industry: form.industry.trim(),
    contactName: form.contactName.trim(),
    contactEmail: form.contactEmail.trim(),
    contactPhone: form.contactPhone.trim(),
    notes: form.notes.trim(),
    isActive: form.isActive,
  };
}

// ---------------------------------------------------------------------------
// Certificado de emisión
// ---------------------------------------------------------------------------

export const REPORT_PERIODS = [
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "month", label: "Este mes" },
  { id: "last-month", label: "Mes anterior" },
] as const;

export type ReportPeriodId = (typeof REPORT_PERIODS)[number]["id"];

/** Medianoche local (en la zona de la emisora) de un día, como instante UTC. */
function zonedMidnight(iso: string, timeZone: string): Date {
  const guess = Date.parse(`${iso}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(guess - (wallClockAsUtc - guess));
}

/**
 * Período del certificado como instantes UTC con los días contados en la zona
 * de la emisora. `to` es exclusivo; si falta, el período llega hasta ahora.
 */
export function reportRange(id: ReportPeriodId, now: Date, timeZone: string): { from: Date; to?: Date } {
  const today = localDate(now, timeZone);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (id) {
    case "7d":
      return { from: zonedMidnight(addDays(today, -6), timeZone) };
    case "30d":
      return { from: zonedMidnight(addDays(today, -29), timeZone) };
    case "month":
      return { from: zonedMidnight(monthStart, timeZone) };
    case "last-month": {
      const previousMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
      return { from: zonedMidnight(previousMonthStart, timeZone), to: zonedMidnight(monthStart, timeZone) };
    }
  }
}

/**
 * Completa con ceros los días sin emisiones, para que el gráfico muestre el
 * período completo y no solo los días con datos.
 */
export function fillDays(
  perDay: readonly { date: string; count: number }[],
  from: string,
  to: string,
): { date: string; count: number }[] {
  const counts = new Map(perDay.map((entry) => [entry.date, entry.count]));
  const days = Math.max(daysBetween(from, to), 0);
  return Array.from({ length: days + 1 }, (_, index) => {
    const date = addDays(from, index);
    return { date, count: counts.get(date) ?? 0 };
  });
}
