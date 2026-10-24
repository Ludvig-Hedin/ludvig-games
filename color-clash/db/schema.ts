import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// The state column contains server-only shuffled cards and token digests.
// Only viewFor() output is ever returned by the rooms API.
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey().notNull(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('rooms_expires_at_idx').on(table.expiresAt)]);
