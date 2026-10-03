import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { sha256Hex, stable, TruthBuild, TruthRetry } from '@voyage/shared';
import { originAllowed, requireRole, ulid, type AppContext } from '../auth/session';
import { auditLog, truthVersions } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';

const ATTRIBUTION = 'Sector data from the Traveller Map (travellermap.com), used under Far Future Enterprises\' Fair Use Policy. Traveller is a registered trademark of Far Future Enterprises.';

export const admin = new Hono<AppEnv>();

function db(c: AppContext) {
    return drizzle(c.env.DB, { schema: { truthVersions, auditLog } });
}

admin.post('/truth/build', async (c) => {
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const actor = await requireRole(c, 'admin');
    if (actor instanceof Response) return actor;
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'Invalid JSON.');
    }
    const parsed = TruthBuild.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const input = parsed.data;
    const existing = await db(c).select().from(truthVersions).where(eq(truthVersions.version, input.version)).get();
    if (existing) return fail(c, 409, 'conflict', 'That truth version already exists.');
    const keys = await inputKeys(c.env.PRIVATE_BUCKET, input.version);
    const catalogueKey = `inputs/${input.version}/sectors.json`;
    if (!keys.has(catalogueKey)) return fail(c, 404, 'not_found', 'Sector catalogue is missing.');
    let slugs: string[];
    if (input.sectors === 'all') {
        const catalogue = await c.env.PRIVATE_BUCKET.get(catalogueKey);
        if (!catalogue) return fail(c, 404, 'not_found', 'Sector catalogue is missing.');
        try {
            slugs = slugsFromCatalogue(await catalogue.text());
        } catch (err) {
            return fail(c, 400, 'validation', err instanceof Error ? err.message : 'Invalid sector catalogue.');
        }
        if (!slugs.length) return fail(c, 400, 'validation', 'Sector catalogue has no sectors.');
    } else {
        slugs = input.sectors;
    }
    for (const slug of slugs) {
        const tsv = `inputs/${input.version}/${slug}.tsv`;
        const xml = `inputs/${input.version}/${slug}.xml`;
        if (!keys.has(tsv) || !keys.has(xml)) return fail(c, 404, 'not_found', 'Sector inputs are missing.', { slug });
    }
    await db(c).insert(truthVersions).values({
        version: input.version,
        engineVersion: input.engineVersion,
        milieu: input.milieu,
        seed: input.seed,
        settings: JSON.stringify(input.settings),
        sectors: JSON.stringify(slugs),
        state: 'building',
        startedAt: new Date().toISOString(),
        releasedAt: null,
        notes: null,
        manifestHash: null,
        sectorsTotal: slugs.length,
        sectorsDone: 0,
        sectorsFailed: '[]',
    }).run();
    const now = new Date().toISOString();
    const sectorRows = slugs.map((slug) => c.env.DB.prepare(
        `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
         VALUES (?, ?, 'building', 0, 0, 0, NULL, NULL, ?)`,
    ).bind(input.version, slug, now));
    for (let i = 0; i < sectorRows.length; i += 50) await c.env.DB.batch(sectorRows.slice(i, i + 50));
    const pinned = { seed: input.seed, settings: input.settings, engineVersion: input.engineVersion };
    const messages = slugs.map((slug) => ({ body: { version: input.version, slug, offset: 0, pinned } }));
    for (let i = 0; i < messages.length; i += 100) await c.env.TRUTH_QUEUE.sendBatch(messages.slice(i, i + 100));
    if (input.sectors === 'all') return ok(c, { version: input.version, enqueued: slugs.length }, 202);
    return ok(c, { version: input.version, sectors: slugs }, 202);
});

admin.get('/truth/builds/:version', async (c) => {
    const actor = await requireRole(c, 'admin');
    if (actor instanceof Response) return actor;
    const version = c.req.param('version');
    const row = await db(c).select().from(truthVersions).where(eq(truthVersions.version, version)).get();
    if (!row) return fail(c, 404, 'not_found', 'No such truth build.');
    const slugs = parseStringArray(row.sectors);
    const progress = await progressBySlug(c.env.DB, version);
    const sectors = slugs.map((slug) => {
        const item = progress.get(slug);
        return {
            slug,
            state: item?.state ?? 'building',
            systems: item?.systems ?? null,
            built: item?.built ?? null,
            partial: item?.partial ?? null,
            error: item?.error ?? null,
        };
    });
    const counts = countStates(progress);
    return ok(c, {
        version: row.version,
        state: row.state,
        engineVersion: row.engineVersion,
        milieu: row.milieu,
        seed: row.seed,
        sectorsTotal: row.sectorsTotal,
        sectorsDone: counts.done,
        sectorsFailed: counts.failed,
        sectors,
    });
});

admin.post('/truth/builds/:version/retry', async (c) => {
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const actor = await requireRole(c, 'admin');
    if (actor instanceof Response) return actor;
    const version = c.req.param('version');
    let raw: unknown = {};
    const text = await c.req.text();
    if (text) {
        try {
            raw = JSON.parse(text);
        } catch {
            return fail(c, 400, 'validation', 'Invalid JSON.');
        }
    }
    const parsed = TruthRetry.safeParse(raw);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const row = await db(c).select().from(truthVersions).where(eq(truthVersions.version, version)).get();
    if (!row) return fail(c, 404, 'not_found', 'No such truth build.');
    if (row.state === 'released') return fail(c, 409, 'conflict', 'That truth version is already released.');
    const recorded = await c.env.DB.prepare(
        `SELECT sector_slug, state, updated_at FROM truth_build_sectors WHERE version = ?`,
    ).bind(version).all<{ sector_slug: string; state: string; updated_at: string }>();
    const bySlug = new Map(recorded.results.map((item) => [item.sector_slug, item]));
    let targets: string[];
    if (parsed.data.sectors) {
        for (const slug of parsed.data.sectors) {
            if (!bySlug.has(slug)) return fail(c, 404, 'not_found', `No sector build for ${slug}.`, { slug });
        }
        targets = parsed.data.sectors;
    } else {
        const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        targets = recorded.results.filter((item) => {
            if (item.state === 'failed') return true;
            return item.state === 'building' && item.updated_at < staleBefore;
        }).map((item) => item.sector_slug);
    }
    const now = new Date().toISOString();
    const updates = targets.map((slug) => c.env.DB.prepare(
        `UPDATE truth_build_sectors SET state = 'building', error = NULL, updated_at = ? WHERE version = ? AND sector_slug = ?`,
    ).bind(now, version, slug));
    for (let i = 0; i < updates.length; i += 50) await c.env.DB.batch(updates.slice(i, i + 50));
    const pinned = {
        seed: row.seed,
        settings: JSON.parse(row.settings) as Record<string, unknown>,
        engineVersion: row.engineVersion,
    };
    const messages = targets.map((slug) => ({ body: { version, slug, offset: 0, pinned } }));
    for (let i = 0; i < messages.length; i += 100) await c.env.TRUTH_QUEUE.sendBatch(messages.slice(i, i + 100));
    await db(c).insert(auditLog).values({
        id: ulid(),
        at: now,
        actorId: actor.id,
        action: 'truth.retry',
        targetKind: 'truth_version',
        targetId: version,
        details: JSON.stringify(targets),
    }).run();
    return ok(c, { version, enqueued: targets.length }, 202);
});

admin.post('/truth/release/:version', async (c) => {
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const actor = await requireRole(c, 'admin');
    if (actor instanceof Response) return actor;
    const version = c.req.param('version');
    const row = await db(c).select().from(truthVersions).where(eq(truthVersions.version, version)).get();
    if (!row) return fail(c, 404, 'not_found', 'No such truth build.');
    if (row.state === 'released') return fail(c, 409, 'conflict', 'That truth version is already released.');
    const done = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM truth_build_sectors WHERE version = ? AND state = 'done'`,
    ).bind(version).first<{ n: number }>();
    if (Number(done?.n ?? 0) !== row.sectorsTotal) return fail(c, 409, 'conflict', 'Build is not finished.');
    const recorded = await c.env.DB.prepare(
        `SELECT sector_slug, systems, built, partial, index_hash FROM truth_build_sectors WHERE version = ? AND state = 'done'`,
    ).bind(version).all<{ sector_slug: string; systems: number; built: number; partial: number; index_hash: string | null }>();
    const bySlug = new Map(recorded.results.map((item) => [item.sector_slug, item]));
    const catalogue = await c.env.PRIVATE_BUCKET.get(`inputs/${version}/sectors.json`);
    const catalogueBySlug = new Map<string, { name: string; x: number; y: number; tags: string[]; canonical: boolean }>();
    if (catalogue) {
        const parsed = JSON.parse(await catalogue.text()) as { sectors?: Record<string, unknown>[] };
        for (const item of parsed.sectors ?? []) {
            if (typeof item.slug !== 'string') continue;
            catalogueBySlug.set(item.slug, {
                name: typeof item.name === 'string' ? item.name : item.slug,
                x: typeof item.x === 'number' ? item.x : 0,
                y: typeof item.y === 'number' ? item.y : 0,
                tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
                canonical: item.canonical === true,
            });
        }
    }
    const sectorSlugs = parseStringArray(row.sectors);
    const sectors = [];
    for (const slug of sectorSlugs) {
        const item = bySlug.get(slug);
        if (!item || !item.index_hash) return fail(c, 409, 'conflict', 'Sector build record is missing.', { slug });
        const listed = catalogueBySlug.get(slug);
        sectors.push({
            slug,
            name: listed?.name ?? slug,
            x: listed?.x ?? null,
            y: listed?.y ?? null,
            tags: listed?.tags ?? [],
            canonical: listed?.canonical === true,
            systems: item.systems,
            built: item.built,
            partial: item.partial,
            indexHash: item.index_hash,
        });
    }
    const releasedAt = new Date().toISOString();
    const manifest = {
        truthVersion: version,
        milieu: row.milieu,
        seed: row.seed,
        settings: JSON.parse(row.settings) as Record<string, unknown>,
        engineVersion: row.engineVersion,
        attribution: ATTRIBUTION,
        releasedAt,
        sectors,
    };
    const body = stable(manifest);
    const manifestHash = await sha256Hex(body);
    await c.env.PUBLIC_BUCKET.put(`truth/${version}/manifest.json`, body, {
        httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
    });
    await db(c).update(truthVersions).set({ state: 'released', releasedAt, manifestHash }).where(eq(truthVersions.version, version)).run();
    await db(c).insert(auditLog).values({
        id: ulid(),
        at: releasedAt,
        actorId: actor.id,
        action: 'truth.release',
        targetKind: 'truth_version',
        targetId: version,
        details: JSON.stringify({ manifestHash }),
    }).run();
    return ok(c, { version, manifestHash });
});

async function inputKeys(bucket: R2Bucket, version: string): Promise<Set<string>> {
    const keys = new Set<string>();
    let cursor: string | undefined;
    do {
        const page = await bucket.list({ prefix: `inputs/${version}/`, cursor, limit: 1000 });
        for (const object of page.objects) keys.add(object.key);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return keys;
}

type SectorProgress = { state: string; systems: number; built: number; partial: number; error: string | null };

async function progressBySlug(db: D1Database, version: string): Promise<Map<string, SectorProgress>> {
    const rows = await db.prepare(
        `SELECT sector_slug, state, systems, built, partial, error FROM truth_build_sectors WHERE version = ?`,
    ).bind(version).all<{ sector_slug: string; state: string; systems: number; built: number; partial: number; error: string | null }>();
    return new Map(rows.results.map((row) => [row.sector_slug, {
        state: row.state,
        systems: row.systems,
        built: row.built,
        partial: row.partial,
        error: row.error,
    }]));
}

function countStates(progress: Map<string, SectorProgress>): { done: number; failed: number } {
    let done = 0;
    let failed = 0;
    for (const item of progress.values()) {
        if (item.state === 'done') done += 1;
        else if (item.state === 'failed') failed += 1;
    }
    return { done, failed };
}

function slugsFromCatalogue(raw: string): string[] {
    const parsed = JSON.parse(raw) as { sectors?: unknown };
    if (!Array.isArray(parsed.sectors)) throw new Error('Sector catalogue has no sectors array.');
    return parsed.sectors.map((item) => {
        if (!item || typeof item !== 'object' || typeof (item as { slug?: unknown }).slug !== 'string') {
            throw new Error('Sector catalogue entry is missing a slug.');
        }
        return (item as { slug: string }).slug;
    });
}

function parseStringArray(value: string | null): string[] {
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}
