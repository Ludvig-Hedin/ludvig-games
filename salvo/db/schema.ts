import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Fleet coordinates and resume-token hashes are server-only. */
export const navalRooms = sqliteTable("naval_rooms", {
  code: text("code").primaryKey(),
  version: integer("version").notNull().default(1),
  data: text("data").notNull(),
  p0Hash: text("p0_hash").notNull(),
  p1Hash: text("p1_hash"),
  p0Seen: integer("p0_seen").notNull(),
  p1Seen: integer("p1_seen").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("naval_rooms_expiry_idx").on(table.expiresAt), uniqueIndex("naval_rooms_host_token_idx").on(table.p0Hash)]);

export const navalRateLimits = sqliteTable("naval_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("naval_rate_limits_expiry_idx").on(table.expiresAt)]);
