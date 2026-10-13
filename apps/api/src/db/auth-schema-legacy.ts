import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The user and session tables as they are before migration 0012.
 * Same columns as `auth-schema.ts`, without `username` and `must_add_passkey`.
 * Better Auth selects every column on the table it is given, so the pre-0012
 * database uses these tables and does not mention the new columns.
 */
export const legacyUser = sqliteTable('user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .$onUpdate(() => new Date())
        .notNull(),
    role: text('role'),
    banned: integer('banned', { mode: 'boolean' }).default(false),
    banReason: text('ban_reason'),
    banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
});

export const legacySession = sqliteTable('session', {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .$onUpdate(() => new Date())
        .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => legacyUser.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
}, (table) => [index('session_userId_idx').on(table.userId)]);

export const legacyUserRelations = relations(legacyUser, ({ many }) => ({
    sessions: many(legacySession),
}));

export const legacySessionRelations = relations(legacySession, ({ one }) => ({
    user: one(legacyUser, { fields: [legacySession.userId], references: [legacyUser.id] }),
}));
