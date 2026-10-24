import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const arenaRooms = sqliteTable("arena_rooms", {
  code: text("code").primaryKey(),
  version: integer("version").notNull(),
  state: text("state").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  lastSeen1: integer("last_seen_1").notNull().default(0),
  lastSeen2: integer("last_seen_2").notNull().default(0),
}, (table) => [index("arena_rooms_expiry").on(table.expiresAt)]);
