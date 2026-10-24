import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  state: text("state").notNull(),
  revision: integer("revision").notNull().default(1),
  matchNumber: integer("match_number").notNull().default(1),
  xTokenHash: text("x_token_hash").notNull(),
  oTokenHash: text("o_token_hash"),
  xReady: integer("x_ready").notNull().default(0),
  oReady: integer("o_ready").notNull().default(0),
  closed: integer("closed").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  xSeenAt: integer("x_seen_at").notNull(),
  oSeenAt: integer("o_seen_at"),
}, (table) => [index("rooms_expiry_idx").on(table.expiresAt)]);
