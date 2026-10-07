/** Enlaces públicos al certificado de emisión: tipos y lógica, sin interfaz. */

export interface CertificateLink {
  id: string;
  stationId: string;
  from: string;
  to: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedCertificateLink {
  id: string;
  token: string;
  path: string;
  expiresAt: string;
}

/** Lo mínimo para dibujar un certificado: lo cumplen el del panel y el público. */
export interface CertificateData {
  advertiser: { name: string };
  from: string;
  to: string;
  total: number;
  truncated: boolean;
  perDay: { date: string; count: number }[];
  perCampaign: { name: string; count: number }[];
  items: { startedAt: string; localTime: string; campaign: string; spot: string }[];
}

export interface PublicCertificate extends CertificateData {
  station: { name: string; timezone: string };
  expiresAt: string;
  /** Día local de la emisora en que se abrió, "2026-10-10". */
  generatedOn: string;
}

/** Cuánto puede durar un enlace, en días. */
export const EXPIRY_OPTIONS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

export type LinkStatus = "active" | "expired" | "revoked";

export function linkStatus(link: Pick<CertificateLink, "expiresAt" | "revokedAt">, now: number): LinkStatus {
  if (link.revokedAt) return "revoked";
  return new Date(link.expiresAt).getTime() <= now ? "expired" : "active";
}

export function certificateUrl(origin: string, path: string): string {
  return `${origin}${path}`;
}

/** Enlace de WhatsApp con el mensaje ya escrito (el vendedor solo elige a quién se lo manda). */
export function whatsappUrl(advertiserName: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Certificado de emisión de ${advertiserName}: ${url}`)}`;
}

const TOKEN = /^cert_[A-Za-z0-9_-]{43}$/;

export function isCertificateToken(value: string): boolean {
  return TOKEN.test(value);
}
