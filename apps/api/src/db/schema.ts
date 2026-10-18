import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

export { account, accountRelations, passkey, passkeyRelations, session, sessionRelations, user, userRelations, verification } from './auth-schema';

export const recoveryCode = sqliteTable('recovery_code', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    usedAt: integer('used_at'),
}, (t) => [index('recovery_code_userId_idx').on(t.userId)]);

export const recoveryFailure = sqliteTable('recovery_failure', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
}, (t) => [index('recovery_failure_userId_idx').on(t.userId)]);

export const recoveryEnvelope = sqliteTable('recovery_envelope', {
    userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
});

export const passkeySignup = sqliteTable('passkey_signup', {
    id: text('id').primaryKey(),
    address: text('address').notNull(),
    createdAt: integer('created_at').notNull(),
}, (t) => [index('passkey_signup_address_idx').on(t.address, t.createdAt)]);

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
    derivedFrom: text('derived_from'),
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
    canonical: integer('canonical'),
}, (t) => [
    primaryKey({ columns: [t.version, t.sectorSlug] }),
    check('truth_build_sectors_state_check', sql`${t.state} in ('queued', 'building', 'done', 'failed')`),
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

export const universes = sqliteTable('universes', {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => user.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    truthVersion: text('truth_version'),
    engineVersion: text('engine_version').notNull(),
    editionDefault: text('edition_default').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    purgeAfter: text('purge_after'),
    hexOverrideCount: integer('hex_override_count').notNull().default(0),
    objectBytes: integer('object_bytes').notNull().default(0),
    lastSnapshotAt: text('last_snapshot_at'),
}, (t) => [
    index('universes_owner_id').on(t.ownerId),
]);
// 0013 `public_games`, 0018 `show_referee` and `example`, and 0020 `show_course` stay off this
// table. A Drizzle whole-row select would name the column and fail before that migration.
// `public_cards.course` (0020) is raw SQL for the same reason. There is no Drizzle table for it.

export const characters = sqliteTable('characters', {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => user.id),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    schema: text('schema').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
}, (t) => [
    index('characters_owner_id').on(t.ownerId),
]);

export const characterAccess = sqliteTable('character_access', {
    characterId: text('character_id').notNull().references(() => characters.id),
    userId: text('user_id').notNull().references(() => user.id),
    role: text('role').notNull(),
    grantedBy: text('granted_by').notNull().references(() => user.id),
    createdAt: text('created_at').notNull(),
}, (t) => [
    primaryKey({ columns: [t.characterId, t.userId] }),
    index('character_access_user_id').on(t.userId),
    check('character_access_role_check', sql`${t.role} in ('owner', 'editor')`),
]);

export const characterInvites = sqliteTable('character_invites', {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    characterId: text('character_id').notNull().references(() => characters.id),
    role: text('role').notNull(),
    createdBy: text('created_by').notNull().references(() => user.id),
    expiresAt: text('expires_at').notNull(),
    claimedBy: text('claimed_by').references(() => user.id),
    claimedAt: text('claimed_at'),
    revokedAt: text('revoked_at'),
}, (t) => [
    index('character_invites_character_id').on(t.characterId),
    check('character_invites_role_check', sql`${t.role} = 'editor'`),
]);

export const packages = sqliteTable('packages', {
    id: text('id').primaryKey(),
    authorId: text('author_id').notNull().references(() => user.id),
    universeId: text('universe_id').notNull().references(() => universes.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull(),
    tags: text('tags').notNull(),
    edition: text('edition').notNull(),
    truthVersion: text('truth_version').notNull(),
    engineVersion: text('engine_version').notNull(),
    latestVersion: integer('latest_version').notNull().default(0),
    installs: integer('installs').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    hidden: integer('hidden').notNull().default(0),
    takedownReason: text('takedown_reason'),
    takedownBy: text('takedown_by'),
    /** 0019. The publisher's uploaded cover (F17). */
    coverHash: text('cover_hash'),
    coverThumbHash: text('cover_thumb_hash'),
}, (t) => [
    index('packages_author_id').on(t.authorId),
]);

export const packageVersions = sqliteTable('package_versions', {
    packageId: text('package_id').notNull().references(() => packages.id),
    version: integer('version').notNull(),
    state: text('state').notNull(),
    error: text('error'),
    manifestHash: text('manifest_hash'),
    contentHash: text('content_hash'),
    bytes: integer('bytes'),
    hexCount: integer('hex_count').notNull(),
    recordCount: integer('record_count').notNull(),
    hexKeys: text('hex_keys').notNull(),
    recordIds: text('record_ids').notNull(),
    createdAt: text('created_at').notNull(),
    /** 0019. The record-art pair, every published image hash, and whether they were worked out (F17). */
    artHash: text('art_hash'),
    artThumbHash: text('art_thumb_hash'),
    imageHashes: text('image_hashes'),
    artFilled: integer('art_filled').notNull().default(0),
}, (t) => [
    primaryKey({ columns: [t.packageId, t.version] }),
    check('package_versions_state_check', sql`${t.state} in ('queued', 'running', 'done', 'failed')`),
]);

/** 0015. One row per in-place install of a package into a universe; an update rewrites it. */
export const packageInstalls = sqliteTable('package_installs', {
    id: text('id').primaryKey(),
    universeId: text('universe_id').notNull(),
    packageId: text('package_id').notNull(),
    version: integer('version').notNull(),
    placement: text('placement'),
    hexCount: integer('hex_count').notNull(),
    recordCount: integer('record_count').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
}, (t) => [
    index('package_installs_universe').on(t.universeId),
    index('package_installs_package').on(t.packageId),
]);

/** 0015. A reader's report of a package. One open report per reader per package. */
export const packageReports = sqliteTable('package_reports', {
    id: text('id').primaryKey(),
    packageId: text('package_id').notNull(),
    userId: text('user_id').notNull(),
    reason: text('reason').notNull(),
    state: text('state').notNull(),
    createdAt: text('created_at').notNull(),
}, (t) => [
    check('package_reports_state_check', sql`${t.state} in ('open', 'closed')`),
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

/** 0021. One row per account that plays in a universe. The owner is not a row. */
export const universeMembers = sqliteTable('universe_members', {
    universeId: text('universe_id').notNull().references(() => universes.id),
    userId: text('user_id').notNull().references(() => user.id),
    role: text('role').notNull(),
    personId: text('person_id'),
    status: text('status').notNull().default('active'),
    archivedAt: text('archived_at'),
    archivedBy: text('archived_by'),
    createdAt: text('created_at').notNull(),
}, (t) => [
    primaryKey({ columns: [t.universeId, t.userId] }),
    index('universe_members_user_id').on(t.userId),
    check('universe_members_role_check', sql`${t.role} = 'player'`),
    check('universe_members_status_check', sql`${t.status} in ('active', 'archived')`),
    check('universe_members_archived_by_check', sql`${t.archivedBy} is null or ${t.archivedBy} in ('owner', 'self')`),
]);

/** 0021. One invite link. `uses` counts claims and never refuses. There is no max_uses column. */
export const universeInvites = sqliteTable('universe_invites', {
    id: text('id').primaryKey(),
    universeId: text('universe_id').notNull().references(() => universes.id),
    token: text('token'),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    uses: integer('uses').notNull().default(0),
    createdAt: text('created_at').notNull(),
}, (t) => [
    index('universe_invites_universe_id').on(t.universeId),
    check('universe_invites_role_check', sql`${t.role} = 'player'`),
]);

/** 0023. One bearer token. The secret is stored only as a SHA-256 hex. */
export const accessTokens = sqliteTable('access_tokens', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scopes: text('scopes').notNull(),
    universeId: text('universe_id'),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
}, (t) => [
    index('access_tokens_user_id').on(t.userId),
]);

/** 0023. Tokens and MCP stay off until `agent_access` is the row `on`. */
export const platformFlags = sqliteTable('platform_flags', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
});

/** 0024. One custom rules table per account. The bytes live in R2. A deleted row stays so a campaign can fall back. */
export const tableSets = sqliteTable('table_sets', {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => user.id),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    basedOn: text('based_on'),
    edition: text('edition').notNull(),
    objectKey: text('object_key').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    rev: integer('rev').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
}, (t) => [
    index('table_sets_owner_kind').on(t.ownerId, t.kind, t.updatedAt),
]);

/** 0022. One campaign-list summary per universe. The list joins this and does not call the Durable Object. */
export const universeSummaries = sqliteTable('universe_summaries', {
    universeId: text('universe_id').primaryKey().references(() => universes.id),
    vessels: text('vessels').notNull(),
    aboard: integer('aboard').notNull(),
    clockDays: real('clock_days'),
    recordCount: integer('record_count').notNull(),
    changedAt: text('changed_at').notNull(),
});
