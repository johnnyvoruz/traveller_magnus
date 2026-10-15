import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import enginesPackage from '../../../../packages/engines/package.json' with { type: 'json' };
import { originAllowed, requireUser, ulid } from '../auth/session';
import { universes } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { CAMPAIGN_LIMITS, UniverseCreate, UniverseUpdate } from '@voyage/shared';
import { ownedUniverse, type UniverseRow } from '../universe/forward';
import { mountBuilderRoutes } from './builder';
import { mountCampaignExport } from './campaign_export';
import { mountObjectRoutes } from './objects';
import { detectPublicCards, detectPublicGames, publicCardsReady, publicGamesReady, readPublicGames } from '../auth/public_schema';
import { deletePublicMark } from '../universe/public_mark';
import { refreshAfterCampaign, setPublicGames } from './public_games';

const LIVE_LIMIT = CAMPAIGN_LIMITS.universes;
const PURGE_DAYS = 30;

export const universesRoute = new Hono<AppEnv>();
mountObjectRoutes(universesRoute);
mountCampaignExport(universesRoute);
mountBuilderRoutes(universesRoute);

function database(c: { env: AppEnv['Bindings'] }) {
    return drizzle(c.env.DB, { schema: { universes } });
}

function present(row: UniverseRow, flags?: { publicGames?: boolean; showReferee?: boolean }) {
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

/** Attach `publicGames` only when migration 0013 is present, and `showReferee` only when 0018 is. */
async function presentOwned(c: { env: AppEnv['Bindings'] }, row: UniverseRow) {
    await detectPublicGames(c.env.DB);
    await detectPublicCards(c.env.DB);
    if (!publicGamesReady()) return present(row);
    const flag = await readPublicGames(c.env.DB, row.id);
    if (flag === null) return present(row);
    const flags: { publicGames: boolean; showReferee?: boolean } = { publicGames: flag === 1 };
    if (publicCardsReady()) {
        const extra = await c.env.DB.prepare(
            `SELECT show_referee AS showReferee FROM universes WHERE id = ?`,
        ).bind(row.id).first<{ showReferee: number }>();
        flags.showReferee = Number(extra?.showReferee) === 1;
    }
    return present(row, flags);
}

/** The current bundle sends this. A cached tab does not, and still needs the rewrite. */
function asksForPublicJournal(request: Request): boolean {
    return request.headers.get('x-voyage-journal') === 'public';
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
        return fail(c, 400, 'validation', 'Invalid JSON.');
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
    if (!publicGamesReady()) return ok(c, rows.map((row) => present(row)));
    const cards = publicCardsReady();
    const flags = await c.env.DB.prepare(
        cards
            ? `SELECT id, public_games AS publicGames, show_referee AS showReferee FROM universes WHERE owner_id = ? AND deleted_at IS NULL`
            : `SELECT id, public_games AS publicGames FROM universes WHERE owner_id = ? AND deleted_at IS NULL`,
    ).bind(actor.id).all<{ id: string; publicGames: number; showReferee?: number }>();
    const on = new Map<string, { publicGames: boolean; showReferee?: boolean }>();
    for (const flag of flags.results ?? []) {
        const item: { publicGames: boolean; showReferee?: boolean } = { publicGames: Number(flag.publicGames) === 1 };
        if (cards) item.showReferee = Number(flag.showReferee) === 1;
        on.set(String(flag.id), item);
    }
    return ok(c, rows.map((row) => present(row, on.get(row.id) ?? { publicGames: false, ...(cards ? { showReferee: false } : {}) })));
});

universesRoute.post('/', async (c) => {
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const parsed = UniverseCreate.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
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
        if (!released) return fail(c, 400, 'validation', 'truthVersion is not a released version.');
    }
    const live = await database(c).select({ id: universes.id }).from(universes).where(and(
        eq(universes.ownerId, actor.id),
        isNull(universes.deletedAt),
    ));
    if (live.length >= LIVE_LIMIT) return fail(c, 400, 'too_large', 'Ten universes per account.');
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
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
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

universesRoute.get('/:id/campaign', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    const url = new URL(c.req.url);
    url.pathname = '/campaign';
    return maskOwnerJournal(c.req.raw, await owned.forward(new Request(url, c.req.raw)));
});

universesRoute.patch('/:id/campaign/changes', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    const url = new URL(c.req.url);
    url.pathname = '/campaign/changes';
    const response = await owned.forward(new Request(url, c.req.raw));
    await refreshAfterCampaign(c.env, owned, response);
    return maskOwnerJournal(c.req.raw, response);
});

universesRoute.patch('/:id/public-games', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    return setPublicGames(c, owned);
});
