import { TABLE_SET_BYTES, TableKind, validateTableSet, type TableKind as Kind, type TableSetData } from '@voyage/shared';
import { Hono } from 'hono';
import { detectPlayers } from '../auth/players_schema';
import { originAllowed, requireUser, ulid, type AppContext } from '../auth/session';
import type { AppEnv, Env } from '../env';
import { fail, ok } from '../http';
import { privateNoStore } from '../universe/door_headers';
import passengerTables from '../../../../rules/mgt2e_random_passenger.json';
import tradeTables from '../../../../rules/mgt2e_trade.json';

const SET_CAP = 20;
const BODY_CAP = TABLE_SET_BYTES * 2;
const EDITION = 'MgT2E';
const TOO_BIG = 'A table set is at most 256 KB.';
const ACCOUNT_CAP = 'An account holds at most 20 table sets.';
const CONFLICT = 'Someone else saved this table set. Reload it and try again.';
const MISSING = 'No such table set.';
const UNAVAILABLE = 'Your own tables are not available yet.';
const INVALID = 'Invalid request.';
const BLOCKED = 'That request was blocked. Reload the page and try again.';

const OFFICIAL: Record<Kind, unknown> = {
    randomPassenger: passengerTables,
    trade: tradeTables,
};

const OFFICIAL_NAME: Record<Kind, string> = {
    randomPassenger: 'Official passengers',
    trade: 'Official trade',
};

let tableSetsReady = false;

/** A yes is kept for the isolate. A no is asked again, so applying 0024 needs no restart. */
export async function detectTableSets(db: D1Database): Promise<boolean> {
    if (tableSetsReady) return true;
    const row = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'table_sets'`,
    ).first<{ name: string }>();
    tableSetsReady = row?.name === 'table_sets';
    return tableSetsReady;
}

type SetRow = {
    id: string;
    ownerId: string;
    kind: string;
    name: string;
    basedOn: string | null;
    edition: string;
    objectKey: string;
    bytes: number;
    rev: number;
    updatedAt: string;
    deletedAt: string | null;
};

function field(row: Record<string, unknown>, camel: string, snake: string): unknown {
    return row[camel] ?? row[snake];
}

function text(row: Record<string, unknown>, camel: string, snake: string): string {
    const value = field(row, camel, snake);
    return typeof value === 'string' ? value : '';
}

function rowOf(raw: Record<string, unknown>): SetRow {
    const based = field(raw, 'basedOn', 'based_on');
    const deleted = field(raw, 'deletedAt', 'deleted_at');
    return {
        id: text(raw, 'id', 'id'),
        ownerId: text(raw, 'ownerId', 'owner_id'),
        kind: text(raw, 'kind', 'kind'),
        name: text(raw, 'name', 'name'),
        basedOn: typeof based === 'string' ? based : null,
        edition: text(raw, 'edition', 'edition'),
        objectKey: text(raw, 'objectKey', 'object_key'),
        bytes: Number(field(raw, 'bytes', 'bytes') ?? 0),
        rev: Number(field(raw, 'rev', 'rev') ?? 0),
        updatedAt: text(raw, 'updatedAt', 'updated_at'),
        deletedAt: typeof deleted === 'string' ? deleted : null,
    };
}

function listed(row: SetRow) {
    return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        basedOn: row.basedOn,
        edition: row.edition,
        bytes: row.bytes,
        rev: row.rev,
        updatedAt: row.updatedAt,
    };
}

function refused(c: AppContext, status: 400 | 401 | 403 | 404 | 409 | 500 | 503, code: string, message: string, details?: unknown): Response {
    return privateNoStore(fail(c, status, code, message, details));
}

function invalid(c: AppContext, problems?: { path: string; words: string }[]): Response {
    return refused(c, 400, 'validation', INVALID, problems && problems.length > 0 ? { problems } : undefined);
}

function kindProblems(kind: string): { path: string; words: string }[] | null {
    if (TableKind.safeParse(kind).success) return null;
    const checked = validateTableSet({
        schemaVersion: 1,
        kind,
        id: 'x',
        name: 'x',
        basedOn: null,
        edition: EDITION,
        tables: {},
    });
    return checked.problems;
}

async function sha256Hex(textBody: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(textBody));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readObject(env: Env, key: string): Promise<TableSetData | null> {
    const object = await env.PRIVATE_BUCKET.get(key);
    if (!object) return null;
    const parsed = await object.json();
    const checked = validateTableSet(parsed);
    return checked.set;
}

async function liveCount(db: D1Database, ownerId: string): Promise<number> {
    const row = await db.prepare(
        `SELECT COUNT(*) AS n FROM table_sets WHERE owner_id = ? AND deleted_at IS NULL`,
    ).bind(ownerId).first<{ n: number }>();
    return Number(row?.n ?? 0);
}

async function ownedRow(db: D1Database, id: string, ownerId: string): Promise<SetRow | null> {
    const raw = await db.prepare(
        `SELECT id, owner_id, kind, name, based_on, edition, object_key, bytes, rev, updated_at, deleted_at
         FROM table_sets WHERE id = ? AND owner_id = ?`,
    ).bind(id, ownerId).first<Record<string, unknown>>();
    if (!raw) return null;
    const row = rowOf(raw);
    return row.deletedAt ? null : row;
}

async function anyRow(db: D1Database, id: string): Promise<SetRow | null> {
    const raw = await db.prepare(
        `SELECT id, owner_id, kind, name, based_on, edition, object_key, bytes, rev, updated_at, deleted_at
         FROM table_sets WHERE id = ?`,
    ).bind(id).first<Record<string, unknown>>();
    if (!raw) return null;
    const row = rowOf(raw);
    return row.deletedAt ? null : row;
}

async function chosenId(env: Env, universeId: string, kind: string): Promise<string | null> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const response = await stub.fetch(new Request('https://universe.internal/campaign?after=0&limit=1'));
    if (!response.ok) return null;
    const body = await response.json() as { ok?: boolean; data?: { settings?: { tableSets?: Record<string, unknown> } } };
    const id = body.data?.settings?.tableSets?.[kind];
    return typeof id === 'string' ? id : null;
}

/** A player may read one set only when a campaign they play has chosen that id and the set belongs to that campaign's owner. */
async function memberMayRead(env: Env, userId: string, row: SetRow): Promise<boolean> {
    if (!await detectPlayers(env.DB)) return false;
    const memberships = await env.DB.prepare(
        `SELECT universe_id AS universeId FROM universe_members WHERE user_id = ? AND status = 'active'`,
    ).bind(userId).all<{ universeId: string }>();
    for (const membership of memberships.results ?? []) {
        const universeId = membership.universeId ?? (membership as { universe_id?: string }).universe_id;
        if (!universeId) continue;
        if (await chosenId(env, universeId, row.kind) !== row.id) continue;
        const owner = await env.DB.prepare(
            `SELECT owner_id AS ownerId FROM universes WHERE id = ?`,
        ).bind(universeId).first<{ ownerId: string }>();
        const ownerId = owner?.ownerId ?? (owner as { owner_id?: string } | null)?.owner_id;
        if (ownerId != null && row.ownerId === ownerId) return true;
    }
    return false;
}

type Built = { kind: Kind; name: string; basedOn: string | null; edition: string; tables: unknown } | Response;

async function sourceOf(c: AppContext, ownerId: string, body: Record<string, unknown>): Promise<Built> {
    const hasCopy = Object.hasOwn(body, 'copyOf');
    const hasTables = Object.hasOwn(body, 'tables') || Object.hasOwn(body, 'kind');
    if (hasCopy === hasTables) return invalid(c);
    if (hasCopy) {
        if (typeof body.copyOf !== 'string' || body.copyOf.length < 1) return invalid(c);
        if (body.name !== undefined && typeof body.name !== 'string') return invalid(c);
        if (body.copyOf.startsWith('official:')) {
            const kind = body.copyOf.slice('official:'.length);
            const problems = kindProblems(kind);
            if (problems) return invalid(c, problems);
            const known = kind as Kind;
            return {
                kind: known,
                name: typeof body.name === 'string' ? body.name : OFFICIAL_NAME[known],
                basedOn: body.copyOf,
                edition: EDITION,
                tables: JSON.parse(JSON.stringify(OFFICIAL[known])) as unknown,
            };
        }
        const source = await ownedRow(c.env.DB, body.copyOf, ownerId);
        if (!source) return refused(c, 404, 'not_found', MISSING);
        const stored = await readObject(c.env, source.objectKey);
        if (!stored) return refused(c, 500, 'internal', 'Something went wrong. Try again.');
        const known = TableKind.safeParse(stored.kind);
        if (!known.success) return invalid(c);
        return {
            kind: known.data,
            name: typeof body.name === 'string' ? body.name : stored.name,
            basedOn: source.id,
            edition: stored.edition,
            tables: stored.tables,
        };
    }
    if (typeof body.kind !== 'string' || typeof body.name !== 'string' || !Object.hasOwn(body, 'tables')) return invalid(c);
    const problems = kindProblems(body.kind);
    if (problems) return invalid(c, problems);
    return {
        kind: body.kind as Kind,
        name: body.name,
        basedOn: null,
        edition: EDITION,
        tables: body.tables,
    };
}

function envelope(id: string, built: Exclude<Built, Response>): unknown {
    return {
        schemaVersion: 1,
        kind: built.kind,
        id,
        name: built.name,
        basedOn: built.basedOn,
        edition: built.edition,
        tables: built.tables,
    };
}

async function storeObject(env: Env, ownerId: string, id: string, value: unknown): Promise<{ key: string; json: string; hash: string; bytes: number; set: TableSetData } | { problems: { path: string; words: string }[] } | { tooBig: true }> {
    const checked = validateTableSet(value);
    if (!checked.ok || !checked.set) {
        if (checked.problems.some((problem) => problem.words === TOO_BIG)) return { tooBig: true };
        return { problems: checked.problems };
    }
    const json = JSON.stringify(checked.set);
    const bytes = new TextEncoder().encode(json).length;
    const hash = await sha256Hex(json);
    const key = `table-sets/${ownerId}/${id}/${hash}.json`;
    await env.PRIVATE_BUCKET.put(key, json, { httpMetadata: { contentType: 'application/json' } });
    return { key, json, hash, bytes, set: checked.set };
}

export const tableSetsRoute = new Hono<AppEnv>();

tableSetsRoute.get('/', async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return privateNoStore(user);
    if (!await detectTableSets(c.env.DB)) return refused(c, 503, 'table_sets_unavailable', UNAVAILABLE);
    const kind = c.req.query('kind');
    if (!kind) return invalid(c);
    const problems = kindProblems(kind);
    if (problems) return invalid(c, problems);
    const raws = await c.env.DB.prepare(
        `SELECT id, kind, name, based_on, edition, bytes, rev, updated_at
         FROM table_sets WHERE owner_id = ? AND kind = ? AND deleted_at IS NULL
         ORDER BY updated_at DESC`,
    ).bind(user.id, kind).all<Record<string, unknown>>();
    const items = (raws.results ?? []).map((raw) => listed(rowOf(raw)));
    return privateNoStore(ok(c, { items }));
});

tableSetsRoute.post('/', async (c) => {
    if (!originAllowed(c)) return refused(c, 403, 'forbidden', BLOCKED);
    const user = await requireUser(c);
    if (user instanceof Response) return privateNoStore(user);
    if (!await detectTableSets(c.env.DB)) return refused(c, 503, 'table_sets_unavailable', UNAVAILABLE);
    const textBody = await c.req.text();
    if (new TextEncoder().encode(textBody).length > BODY_CAP) return refused(c, 400, 'too_large', TOO_BIG);
    let body: Record<string, unknown>;
    try {
        const parsed = JSON.parse(textBody) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid(c);
        body = parsed as Record<string, unknown>;
    } catch {
        return invalid(c);
    }
    if (await liveCount(c.env.DB, user.id) >= SET_CAP) return refused(c, 400, 'too_large', ACCOUNT_CAP);
    const built = await sourceOf(c, user.id, body);
    if (built instanceof Response) return built;
    const id = `ts_${ulid()}`;
    const stored = await storeObject(c.env, user.id, id, envelope(id, built));
    if ('tooBig' in stored) return refused(c, 400, 'too_large', TOO_BIG);
    if ('problems' in stored) return invalid(c, stored.problems);
    const now = new Date().toISOString();
    await c.env.DB.prepare(
        `INSERT INTO table_sets (
            id, owner_id, kind, name, based_on, edition, object_key, bytes, sha256, rev, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
    ).bind(
        id,
        user.id,
        stored.set.kind,
        stored.set.name,
        stored.set.basedOn,
        stored.set.edition,
        stored.key,
        stored.bytes,
        stored.hash,
        now,
        now,
    ).run();
    return privateNoStore(ok(c, { ...listed({
        id,
        ownerId: user.id,
        kind: stored.set.kind,
        name: stored.set.name,
        basedOn: stored.set.basedOn,
        edition: stored.set.edition,
        objectKey: stored.key,
        bytes: stored.bytes,
        rev: 1,
        updatedAt: now,
        deletedAt: null,
    }), set: stored.set }, 201));
});

tableSetsRoute.get('/:id', async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return privateNoStore(user);
    if (!await detectTableSets(c.env.DB)) return refused(c, 503, 'table_sets_unavailable', UNAVAILABLE);
    const row = await anyRow(c.env.DB, c.req.param('id'));
    if (!row) return refused(c, 404, 'not_found', MISSING);
    const allowed = row.ownerId === user.id || await memberMayRead(c.env, user.id, row);
    if (!allowed) return refused(c, 404, 'not_found', MISSING);
    const set = await readObject(c.env, row.objectKey);
    if (!set) return refused(c, 500, 'internal', 'Something went wrong. Try again.');
    return privateNoStore(ok(c, set));
});

tableSetsRoute.put('/:id', async (c) => {
    if (!originAllowed(c)) return refused(c, 403, 'forbidden', BLOCKED);
    const user = await requireUser(c);
    if (user instanceof Response) return privateNoStore(user);
    if (!await detectTableSets(c.env.DB)) return refused(c, 503, 'table_sets_unavailable', UNAVAILABLE);
    const row = await ownedRow(c.env.DB, c.req.param('id'), user.id);
    if (!row) return refused(c, 404, 'not_found', MISSING);
    const textBody = await c.req.text();
    if (new TextEncoder().encode(textBody).length > BODY_CAP) return refused(c, 400, 'too_large', TOO_BIG);
    let body: Record<string, unknown>;
    try {
        const parsed = JSON.parse(textBody) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid(c);
        body = parsed as Record<string, unknown>;
    } catch {
        return invalid(c);
    }
    if (Object.hasOwn(body, 'kind') || typeof body.baseRev !== 'number' || !Number.isInteger(body.baseRev) || !Object.hasOwn(body, 'tables')) {
        return invalid(c);
    }
    if (body.name !== undefined && typeof body.name !== 'string') return invalid(c);
    const known = TableKind.safeParse(row.kind);
    if (!known.success) return invalid(c);
    const stored = await storeObject(c.env, user.id, row.id, {
        schemaVersion: 1,
        kind: known.data,
        id: row.id,
        name: typeof body.name === 'string' ? body.name : row.name,
        basedOn: row.basedOn,
        edition: row.edition || EDITION,
        tables: body.tables,
    });
    if ('tooBig' in stored) return refused(c, 400, 'too_large', TOO_BIG);
    if ('problems' in stored) return invalid(c, stored.problems);
    const now = new Date().toISOString();
    const nextRev = row.rev + 1;
    const result = await c.env.DB.prepare(
        `UPDATE table_sets
         SET name = ?, object_key = ?, bytes = ?, sha256 = ?, rev = ?, updated_at = ?
         WHERE id = ? AND owner_id = ? AND deleted_at IS NULL AND rev = ?`,
    ).bind(
        stored.set.name,
        stored.key,
        stored.bytes,
        stored.hash,
        nextRev,
        now,
        row.id,
        user.id,
        body.baseRev,
    ).run();
    if (Number(result.meta.changes ?? 0) === 0) return refused(c, 409, 'conflict', CONFLICT);
    return privateNoStore(ok(c, {
        ...listed({ ...row, name: stored.set.name, bytes: stored.bytes, rev: nextRev, updatedAt: now }),
        set: stored.set,
    }));
});

tableSetsRoute.delete('/:id', async (c) => {
    if (!originAllowed(c)) return refused(c, 403, 'forbidden', BLOCKED);
    const user = await requireUser(c);
    if (user instanceof Response) return privateNoStore(user);
    if (!await detectTableSets(c.env.DB)) return refused(c, 503, 'table_sets_unavailable', UNAVAILABLE);
    const row = await ownedRow(c.env.DB, c.req.param('id'), user.id);
    if (!row) return refused(c, 404, 'not_found', MISSING);
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
        `UPDATE table_sets SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    ).bind(now, row.id, user.id).run();
    if (Number(result.meta.changes ?? 0) === 0) return refused(c, 404, 'not_found', MISSING);
    return privateNoStore(ok(c, { id: row.id }));
});
