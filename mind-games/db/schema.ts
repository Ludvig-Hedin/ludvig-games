import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

// Room JSON is changed with a version-checked compare-and-swap. Pending
// selections in this row never leave the server before both players lock.
export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  hostSeen: integer("host_seen").notNull(),
  guestSeen: integer("guest_seen").notNull().default(0),
}, (table) => [index("rooms_expiry_idx").on(table.expiresAt)]);

// room_rate_limits was dropped on 24 Oct 2026 (drizzle/0001): limits now use the Workers rate-limit binding.
