import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

export { account, accountRelations, session, sessionRelations, user, userRelations, verification } from './auth-schema';

export const profile = sqliteTable('profile', {
    userId: text('user_id').primaryKey().references(() => user.id),
    handle: text('handle').notNull().unique(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at'),
});

export const truthVersions = sqliteTable('truth_versions', {
    version: text('version').primaryKey(),
    engineVersion: text('engine_version').notNull(),
    milieu: text('milieu').notNull().default(''),
    seed: text('seed').notNull().default(''),
    settings: text('settings').notNull().default('{}'),
    sectors: text('sectors').notNull().default('[]'),
    state: text('state').notNull(),
    startedAt: text('started_at').notNull(),
    releasedAt: text('released_at'),
    notes: text('notes'),
    manifestHash: text('manifest_hash'),
    sectorsTotal: integer('sectors_total').notNull(),
    sectorsDone: integer('sectors_done').notNull(),
    sectorsFailed: text('sectors_failed').notNull().default('[]'),
}, (t) => [
    check('truth_versions_state_check', sql`${t.state} in ('building', 'released', 'withdrawn')`),
]);

export const truthBuildSectors = sqliteTable('truth_build_sectors', {
    version: text('version').notNull(),
    sectorSlug: text('sector_slug').notNull(),
    state: text('state').notNull(),
    systems: integer('systems').notNull().default(0),
    built: integer('built').notNull().default(0),
    partial: integer('partial').notNull().default(0),
    indexHash: text('index_hash'),
    error: text('error'),
    updatedAt: text('updated_at').notNull(),
}, (t) => [
    primaryKey({ columns: [t.version, t.sectorSlug] }),
    check('truth_build_sectors_state_check', sql`${t.state} in ('building', 'done', 'failed')`),
]);

export const truthSystems = sqliteTable('truth_systems', {
    version: text('version').notNull(),
    sectorSlug: text('sector_slug').notNull(),
    hex: text('hex').notNull(),
    name: text('name'),
    uwp: text('uwp'),
    allegiance: text('allegiance'),
    zone: text('zone'),
    treeHash: text('tree_hash'),
    partial: text('partial'),
}, (t) => [
    primaryKey({ columns: [t.version, t.sectorSlug, t.hex] }),
]);

export const auditLog = sqliteTable('audit_log', {
    id: text('id').primaryKey(),
    at: text('at').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetKind: text('target_kind'),
    targetId: text('target_id'),
    details: text('details'),
});
