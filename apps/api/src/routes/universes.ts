import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import enginesPackage from '../../../../packages/engines/package.json' with { type: 'json' };
import { originAllowed, requireUser, ulid } from '../auth/session';
import { rateLimited, requireAgent, tokenReadLimited } from '../auth/tokens';
import { universes } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { CAMPAIGN_LIMITS, UniverseCreate, UniverseUpdate } from '@voyage/shared';
import { privateNoStore } from '../universe/door_headers';
import { loadHandles, memberUniverse, originBlocked, ownedUniverse, type UniverseRow } from '../universe/forward';
import { memberReadLimited, memberWriteBlocked, memberWriteCommit } from '../universe/player_rate';
import { mountBuilderRoutes } from './builder';
import { mountCampaignExport } from './campaign_export';
import { mountObjectRoutes } from './objects';
import { mountAgentRoutes } from './agent';
import { mountPlayerRoutes } from './players';
import { courseReady, detectPublicCards, detectPublicGames, publicCardsReady, publicGamesReady, readPublicGames } from '../auth/public_schema';
import { deletePublicMark } from '../universe/public_mark';
import { refreshAfterCampaign, setPublicGames } from './public_games';
import { readSummaries, readSummary, rememberCampaignSummary, splitSummary } from '../universe/summary_sync';
import { storedTableChoice, tableChoiceOf, tableChoiceRefusal } from './table_sets';

const LIVE_LIMIT = CAMPAIGN_LIMITS.universes;
const PURGE_DAYS = 30;

export const universesRoute = new Hono<AppEnv>();
mountPlayerRoutes(universesRoute);
mountAgentRoutes(universesRoute);
mountObjectRoutes(universesRoute);
mountCampaignExport(universesRoute);
mountBuilderRoutes(universesRoute);

function database(c: { env: AppEnv['Bindings'] }) {
    return drizzle(c.env.DB, { schema: { universes } });
}

function present(row: UniverseRow, flags?: { publicGames?: boolean; showReferee?: boolean; showCourse?: boolean }) {
    const body = {
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        slug: row.slug,
        truthVersion: row.truthVersion,
        engineVersion: row.engineVersion,
        editionDefault: row.editionDefault,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
        purgeAfter: row.purgeAfter,
        hexOverrideCount: row.hexOverrideCount,
        objectBytes: row.objectBytes,
        lastSnapshotAt: row.lastSnapshotAt,
    };
    if (!flags) return body;
    return { ...body, ...flags };
}

/** `undefined` leaves the key off. `null` is a universe with no summary row yet. */
async function withSummary<T extends object>(c: { env: AppEnv['Bindings'] }, id: string, body: T) {
    const summary = await readSummary(c.env.DB, id);
    if (summary === undefined) return body;
    return { ...body, summary };
}

/** Attach `publicGames` only when migration 0013 is present, and `showReferee` only when 0018 is. */
async function presentOwned(c: { env: AppEnv['Bindings'] }, row: UniverseRow) {
    await detectPublicGames(c.env.DB);
    await detectPublicCards(c.env.DB);
    if (!publicGamesReady()) return withSummary(c, row.id, present(row));
    const flag = await readPublicGames(c.env.DB, row.id);
    if (flag === null) return withSummary(c, row.id, present(row));
    const flags: { publicGames: boolean; showReferee?: boolean; showCourse?: boolean } = { publicGames: flag === 1 };
    const course = await courseReady(c.env.DB);
    if (publicCardsReady() && course) {
        const extra = await c.env.DB.prepare(
            `SELECT show_referee AS showReferee, show_course AS showCourse FROM universes WHERE id = ?`,
        ).bind(row.id).first<{ showReferee: number; showCourse: number }>();
        flags.showReferee = Number(extra?.showReferee) === 1;
        flags.showCourse = Number(extra?.showCourse) !== 0;
    } else if (publicCardsReady()) {
        const extra = await c.env.DB.prepare(
            `SELECT show_referee AS showReferee FROM universes WHERE id = ?`,
        ).bind(row.id).first<{ showReferee: number }>();
        flags.showReferee = Number(extra?.showReferee) === 1;
    } else if (course) {
        const extra = await c.env.DB.prepare(
            `SELECT show_course AS showCourse FROM universes WHERE id = ?`,
        ).bind(row.id).first<{ showCourse: number }>();
        flags.showCourse = Number(extra?.showCourse) !== 0;
    }
    return withSummary(c, row.id, present(row, flags));
}

/** The current bundle sends this. A cached tab does not, and still needs the rewrite. */
function asksForPublicJournal(request: Request): boolean {
    return request.headers.get('x-voyage-journal') === 'public';
}

/** Owner reads ask the Durable Object for `authorId`, then this replaces it with the handle. */
async function withAuthorNames(response: Response, handles: Record<string, string>): Promise<Response> {
    if (!response.ok) return response;
    const text = await response.text();
    let body: { data?: { journal?: Array<Record<string, unknown>> } };
    try {
        body = JSON.parse(text) as typeof body;
    } catch {
        return new Response(text, { status: response.status, headers: response.headers });
    }
    for (const entry of body.data?.journal ?? []) {
        if (!entry || typeof entry !== 'object') continue;
        const authorId = entry.authorId;
        if (typeof authorId === 'string' && authorId) entry.authorName = handles[authorId] ?? '';
        delete entry.authorId;
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(body), { status: response.status, headers });
}

/** A cached tab cannot parse `visibility: "public"`. The stored row stays public. */
async function maskOwnerJournal(request: Request, response: Response): Promise<Response> {
    if (asksForPublicJournal(request)) return response;
    if (!response.ok) return response;
    const text = await response.text();
    let body: { data?: { journal?: { visibility?: string }[]; conflicts?: { table?: string; current?: { visibility?: string } }[] } };
    try {
        body = JSON.parse(text) as typeof body;
    } catch {
        return new Response(text, { status: response.status, headers: response.headers });
    }
    const data = body.data;
    if (data) {
        for (const entry of data.journal ?? []) {
            if (entry && entry.visibility === 'public') entry.visibility = 'players';
        }
        for (const conflict of data.conflicts ?? []) {
            if (conflict?.table === 'journal' && conflict.current?.visibility === 'public') conflict.current.visibility = 'players';
        }
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(body), { status: response.status, headers });
}

function slugFor(name: string, id: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    const tail = id.slice(-8).toLowerCase();
    return base ? `${base}-${tail}` : tail;
}

async function readJson(c: Parameters<typeof fail>[0]): Promise<unknown | Response> {
    try {
        return await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'That request could not be read. Try again.');
    }
}

universesRoute.get('/', async (c) => {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const rows = await database(c).select().from(universes).where(and(
        eq(universes.ownerId, actor.id),
        isNull(universes.deletedAt),
    )).orderBy(asc(universes.createdAt));
    await detectPublicGames(c.env.DB);
    await detectPublicCards(c.env.DB);
    const plain = rows.map((row) => present(row));
    if (!publicGamesReady()) {
        const summaries = await readSummaries(c.env.DB, rows.map((row) => row.id));
        if (!summaries) return ok(c, plain);
        return ok(c, plain.map((item) => ({ ...item, summary: summaries.get(item.id) ?? null })));
    }
    const cards = publicCardsReady();
    const course = await courseReady(c.env.DB);
    const flags = await c.env.DB.prepare(
        cards && course
            ? `SELECT id, public_games AS publicGames, show_referee AS showReferee, show_course AS showCourse FROM universes WHERE owner_id = ? AND deleted_at IS NULL`
            : cards
                ? `SELECT id, public_games AS publicGames, show_referee AS showReferee FROM universes WHERE owner_id = ? AND deleted_at IS NULL`
                : course
                    ? `SELECT id, public_games AS publicGames, show_course AS showCourse FROM universes WHERE owner_id = ? AND deleted_at IS NULL`
                    : `SELECT id, public_games AS publicGames FROM universes WHERE owner_id = ? AND deleted_at IS NULL`,
    ).bind(actor.id).all<{ id: string; publicGames: number; showReferee?: number; showCourse?: number }>();
    const on = new Map<string, { publicGames: boolean; showReferee?: boolean; showCourse?: boolean }>();
    for (const flag of flags.results ?? []) {
        const item: { publicGames: boolean; showReferee?: boolean; showCourse?: boolean } = { publicGames: Number(flag.publicGames) === 1 };
        if (cards) item.showReferee = Number(flag.showReferee) === 1;
        if (course) item.showCourse = Number(flag.showCourse) !== 0;
        on.set(String(flag.id), item);
    }
    const absent = {
        publicGames: false,
        ...(cards ? { showReferee: false } : {}),
        ...(course ? { showCourse: true } : {}),
    };
    const listed = rows.map((row) => present(row, on.get(row.id) ?? absent));
    const summaries = await readSummaries(c.env.DB, rows.map((row) => row.id));
    if (!summaries) return ok(c, listed);
    return ok(c, listed.map((item) => ({ ...item, summary: summaries.get(item.id) ?? null })));
});

universesRoute.post('/', async (c) => {
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const parsed = UniverseCreate.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'That request could not be read. Try again.', parsed.error.flatten());
    const input = parsed.data;
    if (input.id) {
        const existing = await database(c).select().from(universes).where(eq(universes.id, input.id)).get();
        if (existing) {
            if (existing.ownerId !== actor.id) return fail(c, 404, 'not_found', 'No such universe.');
            return ok(c, await presentOwned(c, existing), 200);
        }
    }
    if (input.truthVersion !== null) {
        const released = await c.env.DB.prepare(
            `SELECT version FROM truth_versions WHERE version = ? AND state = 'released'`,
        ).bind(input.truthVersion).first<{ version: string }>();
        if (!released) return fail(c, 400, 'validation', 'That version is not released.');
    }
    const live = await database(c).select({ id: universes.id }).from(universes).where(and(
        eq(universes.ownerId, actor.id),
        isNull(universes.deletedAt),
    ));
    if (live.length >= LIVE_LIMIT) return fail(c, 400, 'too_large', 'An account holds at most ten campaigns.');
    const id = input.id ?? ulid();
    const now = new Date().toISOString();
    const row: UniverseRow = {
        id,
        ownerId: actor.id,
        name: input.name,
        slug: slugFor(input.name, id),
        truthVersion: input.truthVersion,
        engineVersion: enginesPackage.version,
        editionDefault: input.editionDefault,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        purgeAfter: null,
        hexOverrideCount: 0,
        objectBytes: 0,
        lastSnapshotAt: null,
    };
    try {
        await database(c).insert(universes).values(row).run();
    } catch (err) {
        if (input.id) {
            const winner = await database(c).select().from(universes).where(eq(universes.id, id)).get();
            if (winner && winner.ownerId === actor.id) return ok(c, await presentOwned(c, winner), 200);
        }
        throw err;
    }
    try {
        const stub = c.env.UNIVERSE.get(c.env.UNIVERSE.idFromName(id));
        await stub.fetch(new Request('https://universe.internal/', {
            headers: {
                'x-voyage-user-id': actor.id,
                'x-voyage-universe-id': id,
            },
        }));
    } catch (err) {
        await database(c).delete(universes).where(and(
            eq(universes.id, id),
            eq(universes.ownerId, actor.id),
        )).run();
        throw err;
    }
    return ok(c, await presentOwned(c, row), 201);
});

universesRoute.get('/:id', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    return ok(c, await presentOwned(c, owned.row));
});

universesRoute.patch('/:id', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const parsed = UniverseUpdate.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'That request could not be read. Try again.', parsed.error.flatten());
    const input = parsed.data;
    const now = new Date().toISOString();
    await database(c).update(universes).set({
        name: input.name,
        updatedAt: now,
    }).where(eq(universes.id, owned.row.id)).run();
    const row = await database(c).select().from(universes).where(eq(universes.id, owned.row.id)).get();
    return ok(c, await presentOwned(c, row!));
});

universesRoute.delete('/:id', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    const now = new Date();
    const deletedAt = now.toISOString();
    const purgeAfter = new Date(now.getTime() + PURGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await database(c).update(universes).set({
        deletedAt,
        purgeAfter,
        updatedAt: deletedAt,
    }).where(eq(universes.id, owned.row.id)).run();
    if (await detectPublicGames(c.env.DB)) await deletePublicMark(c.env, owned.row.id);
    const row = await database(c).select().from(universes).where(eq(universes.id, owned.row.id)).get();
    return ok(c, await presentOwned(c, row!));
});

function checkedPage(url: URL): { after: number; limit: number } | null {
    const afterRaw = url.searchParams.get('after');
    const limitRaw = url.searchParams.get('limit');
    const after = afterRaw == null ? 0 : Number(afterRaw);
    const limit = limitRaw == null ? 1000 : Number(limitRaw);
    if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1) return null;
    return { after, limit: Math.min(1000, limit) };
}

universesRoute.get('/:id/campaign', async (c) => {
    if (/^Bearer\s+\S/i.test(c.req.header('authorization') ?? '')) {
        const actor = await requireAgent(c, 'campaign:read');
        if (actor instanceof Response) return privateNoStore(actor);
        if (actor.via === 'token' && actor.tokenId && tokenReadLimited(actor.tokenId)) return privateNoStore(rateLimited(c));
        const owned = await ownedUniverse(c, actor);
        if (owned instanceof Response) return privateNoStore(owned);
        const url = new URL(c.req.url);
        url.pathname = '/campaign';
        const response = await owned.forward(new Request(url, c.req.raw), { 'x-voyage-authors': '1' });
        return privateNoStore(response);
    }
    const access = await memberUniverse(c);
    if (access instanceof Response) return privateNoStore(access);
    if (access.role === 'archived') return privateNoStore(fail(c, 403, 'not_a_member', 'You are not in this campaign.'));
    if (access.role === 'none') return privateNoStore(fail(c, 404, 'not_found', 'No such universe.'));
    const handles = await loadHandles(c.env.DB, access.row.id, access.row.ownerId);
    if (access.role === 'member') {
        if (memberReadLimited(access.row.id, access.actor.id)) {
            return privateNoStore(fail(c, 429, 'rate_limited', 'Too many requests.'));
        }
        const page = checkedPage(new URL(c.req.url));
        if (!page) return privateNoStore(fail(c, 400, 'validation', 'That request could not be read. Try again.'));
        const door = new URL('https://universe.local/campaign/players');
        door.searchParams.set('after', String(page.after));
        door.searchParams.set('limit', String(page.limit));
        return privateNoStore(await access.forward(new Request(door), {
            'x-voyage-member': access.actor.id,
            'x-voyage-handles': JSON.stringify(handles),
        }));
    }
    const url = new URL(c.req.url);
    url.pathname = '/campaign';
    const response = await access.forward(new Request(url, c.req.raw), {
        'x-voyage-authors': '1',
        'x-voyage-handles': JSON.stringify(handles),
    });
    return privateNoStore(await maskOwnerJournal(c.req.raw, await withAuthorNames(response, handles)));
});

universesRoute.patch('/:id/campaign/changes', async (c) => {
    const access = await memberUniverse(c);
    if (access instanceof Response) return privateNoStore(access);
    if (access.role === 'archived') return privateNoStore(fail(c, 403, 'not_a_member', 'You are not in this campaign.'));
    if (access.role === 'none') return privateNoStore(fail(c, 404, 'not_found', 'No such universe.'));
    const blocked = originBlocked(c);
    if (blocked) return privateNoStore(blocked);
    const url = new URL(c.req.url);
    url.pathname = '/campaign/changes';
    if (access.role === 'member') {
        if (memberWriteBlocked(access.row.id, access.actor.id)) {
            return privateNoStore(fail(c, 429, 'rate_limited', 'Too many requests.'));
        }
        const handles = await loadHandles(c.env.DB, access.row.id, access.row.ownerId);
        const forwarded = await access.forward(new Request(url, c.req.raw), {
            'x-voyage-member': access.actor.id,
            'x-voyage-handles': JSON.stringify(handles),
        });
        const taken = await splitSummary(forwarded);
        if (taken.response.ok) {
            memberWriteCommit(access.row.id, access.actor.id);
            await rememberCampaignSummary(c.env.DB, access.row.id, taken.summary);
        }
        return privateNoStore(taken.response);
    }
    let choice: Record<string, string> | null = null;
    try {
        choice = tableChoiceOf(await c.req.raw.clone().json());
    } catch {
        choice = null;
    }
    if (choice) {
        const stored = await storedTableChoice(c.env, access.row.id);
        const refusal = await tableChoiceRefusal(c.env.DB, access.row.ownerId, choice, stored);
        if (refusal) return privateNoStore(fail(c, refusal.status, refusal.code, refusal.message));
    }
    const forwarded = await access.forward(new Request(url, c.req.raw));
    const taken = await splitSummary(forwarded);
    if (taken.response.ok) await rememberCampaignSummary(c.env.DB, access.row.id, taken.summary);
    await refreshAfterCampaign(c.env, { row: access.row, actor: access.actor, forward: access.forward }, taken.response);
    return privateNoStore(await maskOwnerJournal(c.req.raw, taken.response));
});

universesRoute.patch('/:id/public-games', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    return setPublicGames(c, owned);
});
