import { Hono } from 'hono';
import {
    PackageCard,
    PackageCardPage,
    PackageCatalogueQuery,
    PackageCreate,
    PackageListPage,
    PackageListing,
    PackagePage,
    PackagePublicPage,
    PackagePublish,
    PackageReport,
    PackagePublishAccepted,
    PackageVersion,
} from '@voyage/shared';
import { roleSatisfies } from '../auth/roles';
import { ensureProfile } from '../auth/profile';
import { originAllowed, requireUser, ulid, type SessionUser } from '../auth/session';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { markPublishFailed, PublishRefusal, resolvePublish } from '../jobs/publish_queue';
import { coverOf, mountCoverRoutes } from './package_covers';

const HEX_CAP = 1280;
const RECORD_CAP = 500;
const VERSION_CAP = 100;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** `packages.truth_version` is NOT NULL (0010). An own-map package stores the empty string (F9). */
export const OWN_MAP = '';

type Ctx = Parameters<typeof fail>[0];

type UniverseRow = {
    id: string;
    ownerId: string;
    editionDefault: string;
    truthVersion: string | null;
    engineVersion: string;
    deletedAt: string | null;
};

type PackageRow = {
    id: string;
    authorId: string;
    universeId: string;
    kind: string;
    title: string;
    description: string;
    tags: string;
    edition: string;
    truthVersion: string;
    latestVersion: number;
    updatedAt: string;
    hexCount: number;
};

const packagesRoute = new Hono<AppEnv>();

function newPackageId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(26));
    let tail = '';
    for (let i = 0; i < bytes.length; i += 1) tail += CROCKFORD[bytes[i]! % 32];
    return `pk_${tail}`;
}

function slugFor(title: string, id: string): string {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    const tail = id.slice(-8).toLowerCase();
    return base ? `${base}-${tail}` : tail;
}

async function readJson(c: Ctx): Promise<unknown | Response> {
    try {
        return await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'Invalid JSON.');
    }
}

async function universeOf(c: Ctx, id: string, ownerId: string): Promise<UniverseRow | null> {
    return c.env.DB.prepare(
        `SELECT id, owner_id AS ownerId, edition_default AS editionDefault, truth_version AS truthVersion,
                engine_version AS engineVersion, deleted_at AS deletedAt
         FROM universes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    ).bind(id, ownerId).first<UniverseRow>();
}

async function packageOf(c: Ctx, id: string, authorId: string): Promise<PackageRow | null> {
    return c.env.DB.prepare(
        `SELECT id, author_id AS authorId, universe_id AS universeId, kind, title, description, tags, edition,
                truth_version AS truthVersion, latest_version AS latestVersion, updated_at AS updatedAt,
                0 AS hexCount
         FROM packages WHERE id = ? AND author_id = ?`,
    ).bind(id, authorId).first<PackageRow>();
}

function tagsOf(value: string): string[] {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

async function authorHandle(c: Ctx, packageId: string, latestVersion: number, fallback: string): Promise<string> {
    if (latestVersion < 1) return fallback;
    const object = await c.env.PUBLIC_BUCKET.get(`packages/${packageId}/${latestVersion}/manifest.json`);
    if (!object) return fallback;
    try {
        const parsed = JSON.parse(await object.text()) as { author?: { handle?: unknown } };
        if (typeof parsed.author?.handle === 'string' && parsed.author.handle) return parsed.author.handle;
    } catch {
        return fallback;
    }
    return fallback;
}

async function listingOf(c: Ctx, row: PackageRow, fallbackHandle: string): Promise<PackageListing> {
    const hexCount = row.latestVersion > 0
        ? (await c.env.DB.prepare(
            `SELECT hex_count AS hexCount FROM package_versions WHERE package_id = ? AND version = ?`,
        ).bind(row.id, row.latestVersion).first<{ hexCount: number }>())?.hexCount ?? 0
        : 0;
    return PackageListing.parse({
        id: row.id,
        title: row.title,
        authorHandle: await authorHandle(c, row.id, row.latestVersion, fallbackHandle),
        kind: row.kind,
        truthVersion: row.truthVersion === OWN_MAP ? null : row.truthVersion,
        edition: row.edition,
        hexCount,
        tags: tagsOf(row.tags),
        latestVersion: row.latestVersion,
    });
}

function versionNumber(value: string | undefined): number | null {
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    const version = Number(value);
    return Number.isSafeInteger(version) ? version : null;
}

packagesRoute.post('/', async (c) => {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const parsed = PackageCreate.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const universe = await universeOf(c, parsed.data.universeId, actor.id);
    if (!universe) return fail(c, 404, 'not_found', 'No such universe.');
    const profile = await ensureProfile(c.env, actor.id, actor.email);
    const id = newPackageId();
    const now = new Date().toISOString();
    let slug = slugFor(parsed.data.title, id);
    const taken = await c.env.DB.prepare(`SELECT id FROM packages WHERE slug = ?`).bind(slug).first();
    if (taken) slug = `${slug}-${id.slice(3, 7).toLowerCase()}`;
    await c.env.DB.prepare(
        `INSERT INTO packages (
            id, author_id, universe_id, kind, title, slug, description, tags, edition, truth_version,
            engine_version, latest_version, installs, created_at, updated_at, hidden, takedown_reason, takedown_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, NULL, NULL)`,
    ).bind(
        id,
        actor.id,
        universe.id,
        parsed.data.kind,
        parsed.data.title,
        slug,
        parsed.data.description,
        JSON.stringify(parsed.data.tags),
        universe.editionDefault,
        universe.truthVersion ?? OWN_MAP,
        universe.engineVersion,
        now,
        now,
    ).run();
    const row = await packageOf(c, id, actor.id);
    if (!row) throw new Error('Package was not stored.');
    return ok(c, await listingOf(c, row, profile.handle), 201);
});

packagesRoute.post('/:packageId/versions', async (c) => {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const parsed = PackagePublish.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const input = parsed.data;
    if (input.hexKeys.length > HEX_CAP) return fail(c, 400, 'too_large', 'A package holds at most 1280 hexes.');
    if (input.recordIds.length > RECORD_CAP) return fail(c, 400, 'too_large', 'A package holds at most 500 records.');
    const pkg = await packageOf(c, c.req.param('packageId') ?? '', actor.id);
    if (!pkg) return fail(c, 404, 'not_found', 'No such package.');
    const universe = await universeOf(c, input.universeId, actor.id);
    if (!universe) return fail(c, 404, 'not_found', 'No such universe.');
    if (universe.id !== pkg.universeId) return fail(c, 400, 'validation', 'This package publishes from a different universe.');
    const count = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM package_versions WHERE package_id = ?`,
    ).bind(pkg.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= VERSION_CAP) return fail(c, 400, 'too_large', 'This package has too many versions.');
    await ensureProfile(c.env, actor.id, actor.email);
    try {
        await resolvePublish(c.env, universe.id, universe.truthVersion, input.hexKeys, input.recordIds);
    } catch (err) {
        if (err instanceof PublishRefusal) return fail(c, 400, 'validation', err.message, err.details);
        throw err;
    }
    const max = await c.env.DB.prepare(
        `SELECT COALESCE(MAX(version), 0) AS n FROM package_versions WHERE package_id = ?`,
    ).bind(pkg.id).first<{ n: number }>();
    const version = (max?.n ?? 0) + 1;
    const now = new Date().toISOString();
    await c.env.DB.prepare(
        `INSERT INTO package_versions (
            package_id, version, state, error, manifest_hash, content_hash, bytes, hex_count, record_count,
            hex_keys, record_ids, created_at
         ) VALUES (?, ?, 'queued', NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
    ).bind(
        pkg.id,
        version,
        input.hexKeys.length,
        input.recordIds.length,
        JSON.stringify(input.hexKeys),
        JSON.stringify(input.recordIds),
        now,
    ).run();
    try {
        await c.env.PUBLISH_QUEUE.send({ kind: 'publish', packageId: pkg.id, version, universeId: universe.id });
    } catch (err) {
        await markPublishFailed(c.env, pkg.id, version, err);
        throw err;
    }
    return ok(c, PackagePublishAccepted.parse({ jobId: `${pkg.id}:${version}`, version }), 202);
});

async function ownList(c: Ctx, actor: SessionUser): Promise<Response> {
    const rawLimit = c.req.query('limit');
    let limit = 100;
    if (rawLimit !== undefined) {
        if (!/^-?\d+$/.test(rawLimit)) return fail(c, 400, 'validation', 'Invalid limit.');
        limit = Math.min(100, Math.max(1, Number(rawLimit)));
    }
    const rawCursor = c.req.query('cursor');
    let cursor: { updatedAt: string; id: string } | null = null;
    if (rawCursor) {
        const pipe = rawCursor.lastIndexOf('|');
        if (pipe <= 0 || pipe === rawCursor.length - 1) return fail(c, 400, 'validation', 'Invalid request.');
        cursor = { updatedAt: rawCursor.slice(0, pipe), id: rawCursor.slice(pipe + 1) };
    }
    const profile = await ensureProfile(c.env, actor.id, actor.email);
    const listed = cursor
        ? await c.env.DB.prepare(
            `SELECT id, author_id AS authorId, universe_id AS universeId, kind, title, description, tags, edition,
                    truth_version AS truthVersion, latest_version AS latestVersion, updated_at AS updatedAt
             FROM packages
             WHERE author_id = ? AND (updated_at < ? OR (updated_at = ? AND id < ?))
             ORDER BY updated_at DESC, id DESC
             LIMIT ?`,
        ).bind(actor.id, cursor.updatedAt, cursor.updatedAt, cursor.id, limit + 1).all<PackageRow>()
        : await c.env.DB.prepare(
            `SELECT id, author_id AS authorId, universe_id AS universeId, kind, title, description, tags, edition,
                    truth_version AS truthVersion, latest_version AS latestVersion, updated_at AS updatedAt
             FROM packages
             WHERE author_id = ?
             ORDER BY updated_at DESC, id DESC
             LIMIT ?`,
        ).bind(actor.id, limit + 1).all<PackageRow>();
    const rows = listed.results ?? [];
    const page = rows.slice(0, limit);
    const items = [];
    for (const row of page) items.push(await listingOf(c, { ...row, hexCount: 0 }, profile.handle));
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? `${last.updatedAt}|${last.id}` : null;
    return ok(c, PackageListPage.parse({ items, nextCursor }));
}

type CardRow = PackageRow & { installs: number; hidden: number };

const CARD_COLUMNS = `id, author_id AS authorId, universe_id AS universeId, kind, title, description, tags, edition,
    truth_version AS truthVersion, latest_version AS latestVersion, updated_at AS updatedAt, installs, hidden`;

/** The signed-in caller, or null. A public read does not refuse a missing or odd session. */
async function viewer(c: Ctx): Promise<SessionUser | null> {
    const actor = await requireUser(c);
    return actor instanceof Response ? null : actor;
}

async function cardOf(c: Ctx, row: CardRow, fallbackHandle: string, admin: boolean): Promise<PackageCard> {
    const listing = await listingOf(c, row, fallbackHandle);
    const hidden = Number(row.hidden) === 1;
    const cover = await coverOf(c.env, row.id, Number(row.latestVersion), hidden, admin);
    return PackageCard.parse({ ...listing, installs: Number(row.installs) || 0, updatedAt: row.updatedAt, hidden, cover });
}

async function handleOf(c: Ctx, authorId: string): Promise<string> {
    const row = await c.env.DB.prepare(`SELECT handle FROM profile WHERE user_id = ?`).bind(authorId).first<{ handle: string }>();
    return row?.handle ?? '';
}

type Cursor = { s: string; v: string | number; id: string };

function encodeCursor(cursor: Cursor): string {
    return btoa(JSON.stringify(cursor)).replace(/=+$/, '');
}

function decodeCursor(raw: string, sort: string): Cursor | null {
    try {
        const parsed = JSON.parse(atob(raw)) as Cursor;
        if (parsed.s !== sort || typeof parsed.id !== 'string') return null;
        if (sort === 'installs' ? typeof parsed.v !== 'number' : typeof parsed.v !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}

function likeOf(text: string): string {
    return `%${text.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

const CATALOGUE_KEYS = ['q', 'kind', 'tag', 'sort', 'mine', 'hidden'];

/** F2. Signed in with no catalogue key keeps the stub's own list, so the client in this tree keeps working. */
packagesRoute.get('/', async (c) => {
    const url = new URL(c.req.url);
    const catalogue = CATALOGUE_KEYS.some((key) => url.searchParams.has(key));
    if (!catalogue) {
        const actor = await viewer(c);
        if (actor) return ownList(c, actor);
    }
    const query: Record<string, string> = {};
    for (const key of CATALOGUE_KEYS) {
        const value = url.searchParams.get(key);
        if (value !== null) query[key] = value;
    }
    const parsed = PackageCatalogueQuery.safeParse(query);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const input = parsed.data;
    const rawLimit = url.searchParams.get('limit');
    let limit = 100;
    if (rawLimit !== null) {
        if (!/^-?\d+$/.test(rawLimit)) return fail(c, 400, 'validation', 'Invalid limit.');
        limit = Math.min(100, Math.max(1, Number(rawLimit)));
    }
    if (input.hidden) {
        const actor = await viewer(c);
        if (!actor || !roleSatisfies(actor.role, 'admin')) return fail(c, 403, 'forbidden', 'Role required.');
    }
    let mineId: string | null = null;
    if (input.mine) {
        const actor = await requireUser(c);
        if (actor instanceof Response) return actor;
        mineId = actor.id;
    }
    const sort = input.sort ?? 'updated';
    const rawCursor = url.searchParams.get('cursor');
    const cursor = rawCursor ? decodeCursor(rawCursor, sort) : null;
    if (rawCursor && !cursor) return fail(c, 400, 'validation', 'Invalid request.');
    const where: string[] = [];
    const binds: (string | number)[] = [];
    if (input.hidden) {
        where.push('hidden = 1');
    }
    if (mineId) {
        where.push('author_id = ?');
        binds.push(mineId);
    } else if (!input.hidden) {
        where.push('hidden = 0', 'latest_version > 0');
    }
    if (input.kind) {
        where.push('kind = ?');
        binds.push(input.kind);
    }
    if (input.tag) {
        where.push(`EXISTS (SELECT 1 FROM json_each(packages.tags) WHERE json_each.value = ?)`);
        binds.push(input.tag);
    }
    if (input.q) {
        where.push(`(lower(title) LIKE ? ESCAPE '\\' OR lower(description) LIKE ? ESCAPE '\\' OR lower(tags) LIKE ? ESCAPE '\\')`);
        const like = likeOf(input.q);
        binds.push(like, like, like);
    }
    let order: string;
    if (sort === 'installs') {
        order = 'installs DESC, id DESC';
        if (cursor) {
            where.push('(installs < ? OR (installs = ? AND id < ?))');
            binds.push(cursor.v, cursor.v, cursor.id);
        }
    } else if (sort === 'title') {
        order = 'title ASC, id ASC';
        if (cursor) {
            where.push('(title > ? OR (title = ? AND id > ?))');
            binds.push(cursor.v, cursor.v, cursor.id);
        }
    } else {
        order = 'updated_at DESC, id DESC';
        if (cursor) {
            where.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
            binds.push(cursor.v, cursor.v, cursor.id);
        }
    }
    const listed = await c.env.DB.prepare(
        `SELECT ${CARD_COLUMNS} FROM packages WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`,
    ).bind(...binds, limit + 1).all<CardRow>();
    const rows = listed.results ?? [];
    const page = rows.slice(0, limit);
    const handles = new Map<string, string>();
    const reader = await viewer(c);
    const readerAdmin = !!reader && roleSatisfies(reader.role, 'admin');
    const items: PackageCard[] = [];
    for (const row of page) {
        if (!handles.has(row.authorId)) handles.set(row.authorId, await handleOf(c, row.authorId));
        items.push(await cardOf(c, { ...row, hexCount: 0 }, handles.get(row.authorId) ?? '', readerAdmin));
    }
    const last = page[page.length - 1];
    let nextCursor: string | null = null;
    if (rows.length > limit && last) {
        const v = sort === 'installs' ? Number(last.installs) : sort === 'title' ? last.title : last.updatedAt;
        nextCursor = encodeCursor({ s: sort, v, id: last.id });
    }
    return ok(c, PackageCardPage.parse({ items, nextCursor }));
});
packagesRoute.get('/:packageId/versions/:version', async (c) => {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const pkg = await packageOf(c, c.req.param('packageId') ?? '', actor.id);
    if (!pkg) return fail(c, 404, 'not_found', 'No such package.');
    const version = versionNumber(c.req.param('version'));
    if (version == null) return fail(c, 404, 'not_found', 'No such version.');
    const row = await c.env.DB.prepare(
        `SELECT version, state, hex_count AS hexCount, record_count AS recordCount, manifest_hash AS manifestHash, error
         FROM package_versions WHERE package_id = ? AND version = ?`,
    ).bind(pkg.id, version).first<{
        version: number;
        state: string;
        hexCount: number;
        recordCount: number;
        manifestHash: string | null;
        error: string | null;
    }>();
    if (!row) return fail(c, 404, 'not_found', 'No such version.');
    return ok(c, PackageVersion.parse(row));
});

/** F2. Public for a package that is not hidden and has a done version. The author sees every state. */
packagesRoute.get('/:packageId', async (c) => {
    const actor = await viewer(c);
    const pkg = await c.env.DB.prepare(`SELECT ${CARD_COLUMNS} FROM packages WHERE id = ?`)
        .bind(c.req.param('packageId') ?? '').first<CardRow>();
    const author = !!pkg && !!actor && pkg.authorId === actor.id;
    const admin = !!actor && roleSatisfies(actor.role, 'admin');
    const hidden = !!pkg && Number(pkg.hidden) === 1;
    if (!pkg || (!author && !(admin && hidden) && (hidden || pkg.latestVersion < 1))) {
        return fail(c, 404, 'not_found', 'No such package.');
    }
    const fallback = author && actor ? (await ensureProfile(c.env, actor.id, actor.email)).handle : await handleOf(c, pkg.authorId);
    const versions = await c.env.DB.prepare(
        `SELECT version, state, hex_count AS hexCount, record_count AS recordCount, manifest_hash AS manifestHash, error
         FROM package_versions WHERE package_id = ? ${author ? '' : `AND state = 'done'`} ORDER BY version DESC`,
    ).bind(pkg.id).all<{
        version: number;
        state: string;
        hexCount: number;
        recordCount: number;
        manifestHash: string | null;
        error: string | null;
    }>();
    const card = await cardOf(c, { ...pkg, hexCount: 0 }, fallback, admin);
    return ok(c, PackagePublicPage.parse({
        ...card,
        description: pkg.description,
        versions: (versions.results ?? []).map((row) => PackageVersion.parse(row)),
        ...(admin && hidden ? { takedownReason: await takedownReasonOf(c, pkg.id) } : {}),
    }));
});

async function takedownReasonOf(c: Ctx, packageId: string): Promise<string | null> {
    const row = await c.env.DB.prepare(`SELECT takedown_reason AS reason FROM packages WHERE id = ?`).bind(packageId).first<{ reason: string | null }>();
    return row?.reason ?? null;
}

async function reportsReady(c: Ctx): Promise<boolean> {
    const row = await c.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'package_reports'`).first<{ name: string }>();
    return row?.name === 'package_reports';
}

/** F2. A signed-in reader flags a package. One open report per reader. */
packagesRoute.post('/:packageId/report', async (c) => {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const parsed = PackageReport.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const pkg = await c.env.DB.prepare(`SELECT id, author_id AS authorId, hidden, latest_version AS latestVersion FROM packages WHERE id = ?`)
        .bind(c.req.param('packageId') ?? '').first<{ id: string; authorId: string; hidden: number; latestVersion: number }>();
    if (!pkg || Number(pkg.hidden) === 1 || pkg.latestVersion < 1) return fail(c, 404, 'not_found', 'No such package.');
    if (pkg.authorId === actor.id) return fail(c, 400, 'validation', 'You cannot report your own package.');
    if (!(await reportsReady(c))) return fail(c, 503, 'unavailable', 'The marketplace is being updated. Try again soon.');
    const open = await c.env.DB.prepare(`SELECT id FROM package_reports WHERE package_id = ? AND user_id = ? AND state = 'open'`)
        .bind(pkg.id, actor.id).first();
    if (open) return ok(c, { reported: true });
    await c.env.DB.prepare(
        `INSERT INTO package_reports (id, package_id, user_id, reason, state, created_at) VALUES (?, ?, ?, ?, 'open', ?)`,
    ).bind(`pr_${ulid()}`, pkg.id, actor.id, parsed.data.reason, new Date().toISOString()).run();
    return ok(c, { reported: true }, 201);
});
mountCoverRoutes(packagesRoute);
export { packagesRoute };
