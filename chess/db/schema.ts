import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('chess_rooms', {
  code: text('code').primaryKey(), version: integer('version').notNull().default(0), state: text('state').notNull(),
  whiteSeen: integer('white_seen').notNull().default(0), blackSeen: integer('black_seen').notNull().default(0),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [index('chess_rooms_updated').on(table.updatedAt)]);
// chess_rate_limits was dropped on 24 Oct 2026 (drizzle/0001): limits now use the Workers rate-limit binding.
