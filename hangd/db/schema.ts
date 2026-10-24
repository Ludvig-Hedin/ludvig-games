import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    code: text("code").primaryKey(),
    state: text("state").notNull(),
    version: integer("version").notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("rooms_expiry_idx").on(table.expiresAt)],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: integer("reset_at").notNull(),
  },
  (table) => [index("rate_limits_expiry_idx").on(table.resetAt)],
);
