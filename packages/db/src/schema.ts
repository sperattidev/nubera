import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoles = ["owner", "programmer", "announcer", "sales"] as const;
export const assetCategories = [
  "music",
  "jingle",
  "institutional",
  "ad",
  "sweeper",
  "other",
] as const;

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
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_tenant_email_idx").on(t.tenantId, t.email)],
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

export type Tenant = typeof tenants.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Asset = typeof assets.$inferSelect;
