import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { sha256Hex, stable, TruthBuild } from '@voyage/shared';
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
    const catalogue = await c.env.PRIVATE_BUCKET.get(`inputs/${input.version}/sectors.json`);
    if (!catalogue) return fail(c, 404, 'not_found', 'Sector catalogue is missing.');
    let slugs: string[];
    if (input.sectors === 'all') {
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
        const tsv = await c.env.PRIVATE_BUCKET.get(`inputs/${input.version}/${slug}.tsv`);
        const xml = await c.env.PRIVATE_BUCKET.get(`inputs/${input.version}/${slug}.xml`);
        if (!tsv || !xml) return fail(c, 404, 'not_found', 'Sector inputs are missing.', { slug });
        await tsv.text();
        await xml.text();
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
    for (const slug of slugs) {
        await c.env.TRUTH_QUEUE.send({
            version: input.version,
            slug,
            pinned: { seed: input.seed, settings: input.settings, engineVersion: input.engineVersion },
        });
    }
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
    const failed = new Set(parseStringArray(row.sectorsFailed));
    const sectors = [];
    for (const slug of slugs) {
        const failedSector = failed.has(slug);
        let built: number | null = null;
        let partial: number | null = null;
        if (!failedSector) {
            const object = await c.env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${slug}/index.json`);
            if (object) {
                const index = JSON.parse(await object.text()) as { built?: unknown; partial?: unknown };
                built = typeof index.built === 'number' ? index.built : null;
                partial = typeof index.partial === 'number' ? index.partial : null;
            }
        }
        sectors.push({
            slug,
            state: failedSector ? 'failed' : row.sectorsDone === row.sectorsTotal ? 'done' : 'queued',
            built,
            partial,
        });
    }
    return ok(c, {
        version: row.version,
        state: row.state,
        engineVersion: row.engineVersion,
        milieu: row.milieu,
        seed: row.seed,
        sectorsTotal: row.sectorsTotal,
        sectorsDone: row.sectorsDone,
        sectors,
    });
});

admin.post('/truth/release/:version', async (c) => {
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const actor = await requireRole(c, 'admin');
    if (actor instanceof Response) return actor;
    const version = c.req.param('version');
    const row = await db(c).select().from(truthVersions).where(eq(truthVersions.version, version)).get();
    if (!row) return fail(c, 404, 'not_found', 'No such truth build.');
    if (row.state === 'released') return fail(c, 409, 'conflict', 'That truth version is already released.');
    if (row.sectorsDone !== row.sectorsTotal) return fail(c, 409, 'conflict', 'Build is not finished.');
    const sectorSlugs = parseStringArray(row.sectors);
    const sectors = [];
    for (const slug of sectorSlugs) {
        const object = await c.env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${slug}/index.json`);
        if (!object) return fail(c, 409, 'conflict', 'Sector index is missing.', { slug });
        const text = await object.text();
        const index = JSON.parse(text) as {
            slug?: string; name?: string; x?: number; y?: number;
            tags?: unknown; canonical?: unknown; systems?: unknown; built?: unknown; partial?: unknown;
            hexes?: Record<string, unknown>;
        };
        const systems = typeof index.systems === 'number'
            ? index.systems
            : index.hexes ? Object.keys(index.hexes).length : 0;
        sectors.push({
            slug: index.slug ?? slug,
            name: index.name ?? slug,
            x: index.x ?? null,
            y: index.y ?? null,
            tags: Array.isArray(index.tags) ? index.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            canonical: index.canonical === true,
            systems,
            built: typeof index.built === 'number' ? index.built : systems,
            partial: typeof index.partial === 'number' ? index.partial : 0,
            indexHash: await sha256Hex(text),
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
