import { pgTable, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const gameSaves = pgTable('phoenix_game_saves', {
  id: text('id').primaryKey(),
  sessionHash: text('session_hash').notNull().unique(),
  state: jsonb('state').$type<Record<string, any>>().notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
