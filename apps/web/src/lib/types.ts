import type { AssetCategory, Role } from "@nubera/core";

/** Tipos de las respuestas de la API que usa el panel. */

export interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
}

export interface Station {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface Asset {
  id: string;
  stationId: string;
  title: string;
  artist: string | null;
  category: AssetCategory;
  durationMs: number | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AssetPage {
  items: Asset[];
  total: number;
  limit: number;
  offset: number;
}

export interface OnAirPlay {
  id: string;
  title: string;
  artist: string | null;
  category: AssetCategory;
  startedAt: string | null;
  pickedAt: string;
  /** Solo en avisos publicitarios. */
  advertiser: string | null;
}

export interface OnAirBlock {
  id: string;
  name: string;
  /** "live" = programa en vivo: la automatización no emite. */
  mode?: "auto" | "live";
  start: string;
  end: string;
  rotation: {
    pool: { category: AssetCategory; weight: number }[];
    insertions: { category: AssetCategory; everyTracks: number }[];
    artistSeparation: number;
    trackSeparationMinutes: number;
    ads?: { everyTracks: number; spotsPerBreak: number };
  };
}

export interface OnAir {
  now: string;
  timezone: string;
  engine: { online: boolean; lastSeenAt: string | null };
  block: OnAirBlock | null;
  current: OnAirPlay | null;
  queued: OnAirPlay[];
  recent: OnAirPlay[];
}

export interface PlayLogEntry {
  id: string;
  title: string;
  artist: string | null;
  category: AssetCategory;
  blockId: string | null;
  startedAt: string;
}
