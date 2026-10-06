import { ASSET_CATEGORIES, type Rotation } from "@nubera/core";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoles = ["owner", "programmer", "announcer", "sales"] as const;
export const assetCategories = ASSET_CATEGORIES;

export const userRole = pgEnum("user_role", userRoles);
export const assetCategory = pgEnum("asset_category", assetCategories);

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
  (t) => [uniqueIndex("stations_tenant_slug_idx").on(t.tenantId, t.slug)],
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
    /** Días de aplicación, 1 = lunes ... 7 = domingo. */
    days: integer("days").array().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    rotation: jsonb("rotation").$type<Rotation>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("schedule_blocks_station_idx").on(t.stationId)],
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
export type Play = typeof plays.$inferSelect;
export type AgentToken = typeof agentTokens.$inferSelect;
