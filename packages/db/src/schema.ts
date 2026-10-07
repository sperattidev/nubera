import { ASSET_CATEGORIES, BLOCK_MODES, USER_ROLES, type Rotation } from "@nubera/core";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoles = USER_ROLES;
export const assetCategories = ASSET_CATEGORIES;

export const userRole = pgEnum("user_role", userRoles);
export const assetCategory = pgEnum("asset_category", assetCategories);
export const blockMode = pgEnum("block_mode", BLOCK_MODES);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Cliente de la plataforma (una radio o un grupo de radios). */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

/** Emisora. Un tenant puede tener varias. */
export const stations = pgTable(
  "stations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
    createdAt: createdAt(),
  },
  // El slug forma parte de la dirección pública de la emisora, por eso es único en toda la plataforma.
  (t) => [uniqueIndex("stations_slug_idx").on(t.slug)],
);

/** Usuarios del panel. La autenticación se agrega en una etapa posterior. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Siempre en minúsculas; un email identifica a una sola cuenta. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull(),
    /** Hash scrypt con sal y parámetros (ver apps/api/src/auth/password.ts). */
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Sesiones del panel. Se guarda el hash del token, nunca el token. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Archivo de audio de la biblioteca de una emisora. */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    artist: text("artist"),
    category: assetCategory("category").notNull().default("music"),
    durationMs: integer("duration_ms"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("assets_station_sha256_idx").on(t.stationId, t.sha256),
    index("assets_station_category_idx").on(t.stationId, t.category),
  ],
);

/** Bloque de la grilla semanal de una emisora (ver @nubera/core). */
export const scheduleBlocks = pgTable(
  "schedule_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "live" = programa en vivo: la automatización no emite durante el bloque. */
    mode: blockMode("mode").notNull().default("auto"),
    /** Días de aplicación, 1 = lunes ... 7 = domingo. */
    days: integer("days").array().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    rotation: jsonb("rotation").$type<Rotation>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("schedule_blocks_station_idx").on(t.stationId)],
);

/** Anunciante de un cliente. El rubro se usa para la exclusividad dentro de una tanda. */
export const advertisers = pgTable(
  "advertisers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("advertisers_tenant_name_idx").on(t.tenantId, t.name)],
);

/** Campaña de un anunciante en una emisora. Las fechas son locales de la emisora. */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => advertisers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    /** Tope de emisiones por día local; null = sin tope. */
    dailyPlays: integer("daily_plays"),
    weight: integer("weight").notNull().default(1),
    days: integer("days").array().notNull(),
    startMinute: integer("start_minute").notNull().default(0),
    endMinute: integer("end_minute").notNull().default(1440),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("campaigns_station_idx").on(t.stationId),
    index("campaigns_advertiser_idx").on(t.advertiserId),
  ],
);

/** Avisos (audios de categoría "ad") que rota una campaña. */
export const campaignAssets = pgTable(
  "campaign_assets",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.assetId] })],
);

/**
 * Registro de emisiones (base del as-run y de los reportes de derechos).
 * Guarda una copia de los datos del audio para conservar el historial exacto.
 */
export const plays = pgTable(
  "plays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    blockId: uuid("block_id").references(() => scheduleBlocks.id, { onDelete: "set null" }),
    /** Solo en avisos: campaña a la que pertenece la emisión. */
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    artist: text("artist"),
    category: assetCategory("category").notNull(),
    /** Cuándo el sistema eligió el audio. */
    pickedAt: timestamp("picked_at", { withTimezone: true }).notNull().defaultNow(),
    /** Cuándo el motor de audio confirmó que empezó a sonar. */
    startedAt: timestamp("started_at", { withTimezone: true }),
  },
  (t) => [index("plays_station_picked_idx").on(t.stationId, t.pickedAt)],
);

/** Credencial del motor de audio de una emisora. Solo se guarda el hash. */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("agent_tokens_station_idx").on(t.stationId)],
);

export type Tenant = typeof tenants.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ScheduleBlock = typeof scheduleBlocks.$inferSelect;
export type Advertiser = typeof advertisers.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Play = typeof plays.$inferSelect;
export type AgentToken = typeof agentTokens.$inferSelect;

/**
 * Enlace público a un certificado de emisión. Fija emisora y período, vence y se puede revocar.
 * Solo se guarda el hash del token: el valor completo se muestra una única vez, al crearlo.
 */
export const certificateLinks = pgTable(
  "certificate_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => advertisers.id, { onDelete: "cascade" }),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
    periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("certificate_links_token_idx").on(t.tokenHash), index("certificate_links_advertiser_idx").on(t.advertiserId)],
);
