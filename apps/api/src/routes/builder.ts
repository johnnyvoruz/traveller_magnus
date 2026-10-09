import { applyForm, blankEnvelope, chartEntry, FormRefusal, formOf, generateHex } from '@voyage/generation';
import {
    builderPairReady,
    BuilderGenerate,
    FormAnswer,
    FormBlank,
    FormDraft,
    FormKeep,
    FormRead,
    HexRemove,
    HexRestore,
    HexRevert,
    SectorHex,
    sha256Hex,
    stable,
    TreeEnvelope,
} from '@voyage/shared';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Hono } from 'hono';
import enginesPackage from '../../../../packages/engines/package.json' with { type: 'json' };
import { ulid } from '../auth/session';
import { universes } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { defaultPin } from '../universe/defaults';
import { ownedUniverse, type OwnedUniverse } from '../universe/forward';
import { chartHoldsSystem, chartTree, generationSeed, hexDoorPath, sectorOf, type ChartHex, type Pin } from '../universe/hexes';

const OBJECT_QUOTA_BYTES = 250 * 1024 * 1024;

function database(env: AppEnv['Bindings']) {
    return drizzle(env.DB, { schema: { universes } });
}

async function door(owned: OwnedUniverse, path: string, method: string, body?: unknown): Promise<Response> {
    return owned.forward(new Request(`https://universe.internal${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}

async function pinFor(env: AppEnv['Bindings'], truthVersion: string | null): Promise<Pin> {
    if (!truthVersion) return defaultPin(null);
    const row = await env.DB.prepare(
        `SELECT seed, settings FROM truth_versions WHERE version = ?`,
    ).bind(truthVersion).first<{ seed: string; settings: string }>();
    if (!row) return defaultPin(truthVersion);
    return { seed: row.seed, settings: JSON.parse(row.settings) as Record<string, unknown>, truthVersion };
}

export function mountBuilderRoutes(route: Hono<AppEnv>): void {
    route.get('/:id/hexes', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const sector = c.req.query('sector') ?? '';
        const cursor = c.req.query('cursor');
        const limit = c.req.query('limit') ?? '100';
        const query = new URLSearchParams({ sector, limit });
        if (cursor) query.set('cursor', cursor);
        return door(owned, `/hexes?${query}`, 'GET');
    });

    route.get('/:id/hexes/:sector/:local', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return door(owned, hexDoorPath(keyOf(c)), 'GET');
    });

    route.post('/:id/hexes/:sector/:local/remove', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return mutate(c, owned, 'remove', keyOf(c));
    });

    route.post('/:id/hexes/:sector/:local/restore', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return mutate(c, owned, 'restore', keyOf(c));
    });

    route.post('/:id/hexes/:sector/:local/revert', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        let body: unknown;
        try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
        const parsed = HexRevert.safeParse(body);
        if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        const response = await door(owned, '/hexes/revert', 'POST', {
            hexKey: keyOf(c),
            ...parsed.data,
        });
        if (response.ok) await recount(c.env, owned.row.id, owned);
        return response;
    });

    route.get('/:id/jobs/:jobId', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return door(owned, `/jobs/${encodeURIComponent(c.req.param('jobId'))}`, 'GET');
    });

    route.post('/:id/jobs/:jobId/stop', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return door(owned, `/jobs/${encodeURIComponent(c.req.param('jobId'))}/stop`, 'POST');
    });

    route.post('/:id/jobs/:jobId/undo', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        const response = await door(owned, `/jobs/${encodeURIComponent(c.req.param('jobId'))}/undo`, 'POST');
        if (response.ok) await recount(c.env, owned.row.id, owned);
        return response;
    });

    route.get('/:id/hexes/:sector/:local/form', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const hash = currentTree(row, await chartOf(c.env, pin, hexKey));
        if (!hash) return fail(c, 404, 'not_found', 'No stored tree.');
        const loaded = await loadEnvelope(c, owned, hexKey, hash, row, pin);
        if (loaded instanceof Response) return loaded;
        try {
            return ok(c, FormRead.parse({ hash, form: formOf(loaded as Parameters<typeof formOf>[0]) }));
        } catch (err) {
            return refusedForm(c, err);
        }
    });

    route.post('/:id/hexes/:sector/:local/draft', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, FormDraft);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const loaded = await loadEnvelope(c, owned, hexKey, input.hash, row, pin);
        if (loaded instanceof Response) return loaded;
        try {
            const applied = applyForm(loaded as Parameters<typeof applyForm>[0], input.changes, input.roll ?? []);
            return ok(c, FormAnswer.parse(applied.answer));
        } catch (err) {
            return refusedForm(c, err);
        }
    });

    route.post('/:id/hexes/:sector/:local/keep', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, FormKeep);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const loaded = await loadEnvelope(c, owned, hexKey, input.hash, row, pin);
        if (loaded instanceof Response) return loaded;
        let applied: ReturnType<typeof applyForm>;
        try {
            applied = applyForm(loaded as Parameters<typeof applyForm>[0], input.changes, input.roll ?? []);
        } catch (err) {
            return refusedForm(c, err);
        }
        if (applied.answer.messages.some((item) => item.holds)) {
            return fail(c, 400, 'validation', 'The engine could not build this system.', { messages: applied.answer.messages });
        }
        const chart = await chartOf(c.env, pin, hexKey);
        return storeTree(c, owned, {
            hexKey,
            envelope: applied.envelope,
            baseRev: input.baseRev,
            roll: row ? row.roll : 0,
            baseHash: row ? row.baseHash : chartTree(chart),
        });
    });

    route.post('/:id/hexes/:sector/:local/blank', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, FormBlank);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const chart = await chartOf(c.env, pin, hexKey);
        if (currentTree(row, chart)) return fail(c, 400, 'validation', 'This hex already has a system.');
        let envelope: ReturnType<typeof blankEnvelope>;
        try {
            envelope = blankEnvelope(hexKey, input.edition, {
                seed: pin.seed,
                settings: pin.settings,
                engineVersion: enginesPackage.version,
            }, {
                sType: input.starType,
                subType: input.starSubtype,
                sClass: input.starClass,
            });
        } catch (err) {
            if (err instanceof FormRefusal) return fail(c, 400, 'validation', err.message);
            return fail(c, 400, 'validation', 'The generator refused this hex.', { reason: String(err).slice(0, 200) });
        }
        return storeTree(c, owned, {
            hexKey,
            envelope,
            baseRev: input.baseRev,
            roll: 0,
            baseHash: row ? row.baseHash : chartTree(chart),
        });
    });

    route.post('/:id/generate', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        let body: unknown;
        try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
        const parsed = BuilderGenerate.safeParse(body);
        if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
        const input = parsed.data;
        if (!builderPairReady(input.edition, input.generator)) {
            return fail(c, 400, 'validation', 'That engine and generator are not available yet.', { reason: 'generator_unavailable' });
        }
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        if (input.hexKeys.length > 1) {
            const id = ulid();
            const created = await door(owned, '/jobs', 'POST', {
                id,
                spec: {
                    hexKeys: input.hexKeys,
                    edition: input.edition,
                    generator: input.generator,
                    roll: input.roll,
                    filledToo: input.filledToo,
                    seed: pin.seed,
                    settings: pin.settings,
                    engineVersion: enginesPackage.version,
                    captured: {},
                },
            });
            if (!created.ok) return created;
            await c.env.GENERATE_QUEUE.send({ kind: 'generate', universeId: owned.row.id, jobId: id, offset: 0 });
            return ok(c, { jobId: id }, 202);
        }
        const hexKey = input.hexKeys[0];
        const existing = await door(owned, hexDoorPath(hexKey), 'GET');
        const row = existing.status === 404 ? null : await existing.json() as { data?: { state?: string; treeHash?: string | null; baseHash?: string | null } };
        if (existing.status !== 404 && !existing.ok) return existing;
        const held = existing.status === 404 ? null : row?.data ?? null;
        const { sector, local } = sectorOf(hexKey);
        const entry = await publishedHex(c.env, pin.truthVersion, sector, local);
        const holds = (held && held.state !== 'removed' && held.treeHash) || (!held && chartHoldsSystem(entry));
        if (holds && !input.filledToo) return ok(c, { rows: [], skipped: [hexKey] });
        let envelope: ReturnType<typeof generateHex>;
        try {
            envelope = generateHex({
                hexKey,
                edition: input.edition,
                mode: input.generator,
                summary: { type: 'SYSTEM_PRESENT' },
                pinned: {
                    seed: generationSeed(pin.seed, input.roll),
                    settings: pin.settings,
                    engineVersion: enginesPackage.version,
                },
            });
        } catch (err) {
            return fail(c, 400, 'validation', 'The generator refused this hex.', { reason: String(err).slice(0, 200) });
        }
        const bytes = stable(envelope);
        const size = new TextEncoder().encode(bytes).byteLength;
        const hash = await sha256Hex(bytes);
        const key = `u/${owned.row.id}/objects/${hash}`;
        const prior = await c.env.PRIVATE_BUCKET.head(key);
        let added = 0;
        if (!prior) {
            if (owned.row.objectBytes + size > OBJECT_QUOTA_BYTES) return fail(c, 400, 'too_large', '250 MB of objects per universe.');
            await c.env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
            added = size;
        }
        const applied = await door(owned, '/hexes/apply', 'POST', {
            hexKey,
            treeHash: hash,
            baseHash: held?.baseHash ?? chartTree(entry),
            roll: input.roll,
            baseRev: input.baseRev,
            engineVersion: enginesPackage.version,
            entry: indexed(envelope.body, hash),
        });
        if (!applied.ok) {
            if (added) await c.env.PRIVATE_BUCKET.delete(key);
            return applied;
        }
        if (added) {
            await database(c.env).update(universes).set({
                objectBytes: sql`${universes.objectBytes} + ${added}`,
            }).where(eq(universes.id, owned.row.id)).run();
        }
        await recount(c.env, owned.row.id, owned);
        const stored = await applied.json() as { data: unknown };
        return ok(c, { rows: [stored.data], skipped: [] });
    });
}

function keyOf(c: Parameters<typeof fail>[0]): string {
    return `${c.req.param('sector')}/${c.req.param('local')}`;
}

function indexed(body: unknown, hash: string) {
    const row = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    return SectorHex.parse(chartEntry(row, hash));
}

async function removalChart(env: AppEnv['Bindings'], pin: Pin, hexKey: string): Promise<ChartHex | null> {
    if (!pin.truthVersion) return null;
    const { sector, local } = sectorOf(hexKey);
    const published = await publishedHex(env, pin.truthVersion, sector, local);
    if (!chartHoldsSystem(published)) return null;
    const entry = SectorHex.safeParse(published);
    if (!entry.success) return null;
    return { baseHash: chartTree(published), entry: entry.data };
}

async function mutate(c: Parameters<typeof fail>[0], owned: OwnedUniverse, action: 'remove' | 'restore', hexKey: string): Promise<Response> {
    let body: unknown;
    try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
    const parsed = (action === 'remove' ? HexRemove : HexRestore).safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const pin = await pinFor(c.env, owned.row.truthVersion);
    await door(owned, '/pin', 'POST', pin);
    const response = await door(owned, `/hexes/${action}`, 'POST', {
        hexKey,
        baseRev: parsed.data.baseRev,
        chart: action === 'remove' ? await removalChart(c.env, pin, hexKey) : undefined,
    });
    if (response.ok) await recount(c.env, owned.row.id, owned);
    return response;
}

async function recount(env: AppEnv['Bindings'], universeId: string, owned: OwnedUniverse): Promise<void> {
    const response = await door(owned, '/hexes/count', 'GET');
    if (!response.ok) return;
    const body = await response.json() as { data?: { count?: number } };
    const count = body.data?.count;
    if (typeof count !== 'number') return;
    await database(env).update(universes).set({ hexOverrideCount: count }).where(eq(universes.id, universeId)).run();
}

async function publishedHex(env: AppEnv['Bindings'], version: string | null, sector: string, local: string): Promise<unknown> {
    if (!version) return undefined;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${sector}/index.json`);
    if (!object) return undefined;
    const parsed = JSON.parse(await object.text()) as { hexes?: Record<string, unknown> };
    return parsed.hexes?.[local];
}

type Ctx = Parameters<typeof fail>[0];

type StoredHex = {
    state: string;
    treeHash: string | null;
    baseHash: string | null;
    roll: number;
};

/** The tree a draft may name. A removed row hides the chart. */
function currentTree(row: StoredHex | null, chart: unknown): string | null {
    if (row) return row.state === 'removed' ? null : row.treeHash;
    return chartTree(chart);
}

async function chartOf(env: AppEnv['Bindings'], pin: Pin, hexKey: string): Promise<unknown> {
    const { sector, local } = sectorOf(hexKey);
    return publishedHex(env, pin.truthVersion, sector, local);
}

async function storedHex(owned: OwnedUniverse, hexKey: string): Promise<StoredHex | null | Response> {
    const existing = await door(owned, hexDoorPath(hexKey), 'GET');
    if (existing.status === 404) return null;
    if (!existing.ok) return existing;
    const body = await existing.json() as { data?: StoredHex };
    return body.data ?? null;
}

async function readJson<T>(c: Ctx, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } }): Promise<T | Response> {
    let body: unknown;
    try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    return parsed.data;
}

function refusedForm(c: Ctx, err: unknown): Response {
    if (err instanceof FormRefusal) return fail(c, 400, 'validation', err.message);
    throw err;
}

async function loadEnvelope(c: Ctx, owned: OwnedUniverse, hexKey: string, hash: string, row: StoredHex | null, pin: Pin): Promise<TreeEnvelope | Response> {
    if (row?.state === 'removed') return fail(c, 404, 'not_found', 'No stored tree.');
    let text: string | null = null;
    if (row && row.treeHash === hash) {
        const object = await c.env.PRIVATE_BUCKET.get(`u/${owned.row.id}/objects/${hash}`);
        text = object ? await object.text() : null;
    } else if (!row && chartTree(await chartOf(c.env, pin, hexKey)) === hash) {
        const object = await c.env.PUBLIC_BUCKET.get(`objects/${hash}`);
        text = object ? await object.text() : null;
    }
    if (text == null) return fail(c, 404, 'not_found', 'No stored tree.');
    let value: unknown;
    try { value = JSON.parse(text); } catch { return fail(c, 404, 'not_found', 'No stored tree.'); }
    const parsed = TreeEnvelope.safeParse(value);
    if (!parsed.success || parsed.data.hexKey !== hexKey) return fail(c, 404, 'not_found', 'No stored tree.');
    return parsed.data;
}

async function storeTree(c: Ctx, owned: OwnedUniverse, write: {
    hexKey: string;
    envelope: { body: unknown };
    baseRev: number;
    roll: number;
    baseHash: string | null;
}): Promise<Response> {
    const bytes = stable(write.envelope);
    const size = new TextEncoder().encode(bytes).byteLength;
    const hash = await sha256Hex(bytes);
    const key = `u/${owned.row.id}/objects/${hash}`;
    const prior = await c.env.PRIVATE_BUCKET.head(key);
    let added = 0;
    if (!prior) {
        if (owned.row.objectBytes + size > OBJECT_QUOTA_BYTES) return fail(c, 400, 'too_large', '250 MB of objects per universe.');
        await c.env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
        added = size;
    }
    const applied = await door(owned, '/hexes/apply', 'POST', {
        hexKey: write.hexKey,
        treeHash: hash,
        baseHash: write.baseHash,
        roll: write.roll,
        baseRev: write.baseRev,
        engineVersion: enginesPackage.version,
        entry: indexed(write.envelope.body, hash),
        action: 'keep',
    });
    if (!applied.ok) {
        if (added) await c.env.PRIVATE_BUCKET.delete(key);
        return applied;
    }
    if (added) {
        await database(c.env).update(universes).set({
            objectBytes: sql`${universes.objectBytes} + ${added}`,
        }).where(eq(universes.id, owned.row.id)).run();
    }
    await recount(c.env, owned.row.id, owned);
    return applied;
}
