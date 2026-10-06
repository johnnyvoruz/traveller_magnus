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
import { mountCampaignExport } from './campaign_export';
import { mountObjectRoutes } from './objects';

const LIVE_LIMIT = CAMPAIGN_LIMITS.universes;
const PURGE_DAYS = 30;

export const universesRoute = new Hono<AppEnv>();
mountObjectRoutes(universesRoute);
mountCampaignExport(universesRoute);

function database(c: { env: AppEnv['Bindings'] }) {
    return drizzle(c.env.DB, { schema: { universes } });
}

function present(row: UniverseRow) {
    return {
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
    return ok(c, rows.map(present));
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
            return ok(c, present(existing), 200);
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
            if (winner && winner.ownerId === actor.id) return ok(c, present(winner), 200);
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
    return ok(c, present(row), 201);
});

universesRoute.get('/:id', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    return ok(c, present(owned.row));
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
    return ok(c, present(row!));
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
    const row = await database(c).select().from(universes).where(eq(universes.id, owned.row.id)).get();
    return ok(c, present(row!));
});

universesRoute.get('/:id/campaign', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    const url = new URL(c.req.url);
    url.pathname = '/campaign';
    return owned.forward(new Request(url, c.req.raw));
});

universesRoute.patch('/:id/campaign/changes', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    const url = new URL(c.req.url);
    url.pathname = '/campaign/changes';
    return owned.forward(new Request(url, c.req.raw));
});
