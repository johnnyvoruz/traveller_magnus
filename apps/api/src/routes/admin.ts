import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { polityOutlines, sectorOverview } from '@voyage/generation';
import polityColourFile from '../../../../universe/polity_colours.json' with { type: 'json' };
import { SectorIndex, sha256Hex, stable, TruthBuild, TruthManifest, TruthOverview, TruthPolities, TruthRetry } from '@voyage/shared';
import { originAllowed, requireRole, ulid, type AppContext } from '../auth/session';
import { auditLog, truthVersions } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { InputChainError, resolveCatalogue } from '../jobs/inputs';
import { provenanceDocument } from '../jobs/reconcile_transform';

const ATTRIBUTION = 'Sector data from the Traveller Map (travellermap.com), used under Far Future Enterprises\' Fair Use Policy. Traveller is a registered trademark of Far Future Enterprises.';
const FEED = 12;

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
    let sourceSectors: string[] | null = null;
    if (input.from) {
        const source = await db(c).select().from(truthVersions).where(eq(truthVersions.version, input.from)).get();
        if (!source) return fail(c, 404, 'not_found', 'No such source truth version.');
        if (source.state !== 'released') return fail(c, 409, 'conflict', 'The source truth version is not released.');
        const mismatch = sourceMismatch(input, source);
        if (mismatch) return fail(c, 409, 'conflict', `${mismatch} differs from the source version.`);
        if (input.sectors !== 'all') return fail(c, 400, 'validation', "sectors must be 'all'.");
        sourceSectors = parseStringArray(source.sectors);
        if (!sourceSectors.length) return fail(c, 400, 'validation', 'Source truth version has no sectors.');
    }
    let resolved: { version: string; text: string };
    try {
        resolved = await resolveCatalogue(c.env.DB, c.env.PRIVATE_BUCKET, input.version, input.from);
    } catch (err) {
        if (err instanceof InputChainError) {
            if (err.limited || input.from) return fail(c, 409, 'conflict', err.message);
            return fail(c, 404, 'not_found', 'Sector catalogue is missing.');
        }
        throw err;
    }
    const keys = await inputKeys(c.env.PRIVATE_BUCKET, resolved.version);
    let slugs: string[];
    if (sourceSectors) {
        slugs = sourceSectors;
    } else if (input.sectors === 'all') {
        try {
            slugs = slugsFromCatalogue(resolved.text);
        } catch (err) {
            return fail(c, 400, 'validation', err instanceof Error ? err.message : 'Invalid sector catalogue.');
        }
        if (!slugs.length) return fail(c, 400, 'validation', 'Sector catalogue has no sectors.');
    } else {
        slugs = input.sectors;
    }
    for (const slug of slugs) {
        const xml = `inputs/${resolved.version}/${slug}.xml`;
        if (input.from) {
            if (!keys.has(xml)) return fail(c, 404, 'not_found', 'Sector inputs are missing.', { slug });
        } else {
            const tsv = `inputs/${resolved.version}/${slug}.tsv`;
            if (!keys.has(tsv) || !keys.has(xml)) return fail(c, 404, 'not_found', 'Sector inputs are missing.', { slug });
        }
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
        ...(input.from ? { derivedFrom: input.from } : {}),
    }).run();
    const now = new Date().toISOString();
    const sectorRows = slugs.map((slug) => c.env.DB.prepare(
        `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
         VALUES (?, ?, 'queued', 0, 0, 0, NULL, NULL, ?)`,
    ).bind(input.version, slug, now));
    for (let i = 0; i < sectorRows.length; i += 50) await c.env.DB.batch(sectorRows.slice(i, i + 50));
    const started = await c.env.DB.prepare(
        `UPDATE truth_build_sectors
         SET state = 'building', updated_at = ?
         WHERE version = ? AND sector_slug IN (
             SELECT sector_slug FROM truth_build_sectors
             WHERE version = ? AND state = 'queued'
             ORDER BY sector_slug
             LIMIT ?
         )
         RETURNING sector_slug`,
    ).bind(now, input.version, input.version, FEED).all<{ sector_slug: string }>();
    const pinned = { seed: input.seed, settings: input.settings, engineVersion: input.engineVersion };
    let policyDigest: string | undefined;
    if (input.transform) {
        if (!input.from) throw new Error('transform requires from.');
        const provenance = await provenanceDocument(input.from, input.engineVersion);
        policyDigest = String(provenance.policyDigest);
        await c.env.PUBLIC_BUCKET.put(`truth/${input.version}/reconciliation.json`, stable(provenance), {
            httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
        });
    }
    const messages = started.results.map((row) => ({
        body: input.from
            ? {
                version: input.version,
                slug: row.sector_slug,
                from: input.from,
                pinned,
                ...(input.transform && policyDigest ? { transform: input.transform, policyDigest } : {}),
            }
            : { version: input.version, slug: row.sector_slug, offset: 0, pinned },
    }));
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
        sectorsQueued: counts.queued,
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
    const from = row.derivedFrom || undefined;
    let reconcileFields: { transform: string; policyDigest: string } | undefined;
    if (from) {
        const side = await c.env.PUBLIC_BUCKET.get(`truth/${version}/reconciliation.json`);
        if (side) {
            const recorded = JSON.parse(await side.text()) as { transform?: unknown; policyDigest?: unknown };
            if (recorded.transform === 'reconcile-environment' && typeof recorded.policyDigest === 'string') {
                reconcileFields = { transform: recorded.transform, policyDigest: recorded.policyDigest };
            }
        }
    }
    const messages = targets.map((slug) => ({
        body: from
            ? { version, slug, offset: 0, from, pinned, ...(reconcileFields ?? {}) }
            : { version, slug, offset: 0, pinned },
    }));
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
    let catalogueText: string;
    try {
        catalogueText = (await resolveCatalogue(c.env.DB, c.env.PRIVATE_BUCKET, version, null)).text;
    } catch (err) {
        if (err instanceof InputChainError) return fail(c, 409, 'conflict', err.message);
        throw err;
    }
    const catalogueBySlug = new Map<string, { name: string; x: number; y: number; tags: string[]; canonical: boolean }>();
    const parsed = JSON.parse(catalogueText) as { sectors?: Record<string, unknown>[] };
    for (const item of parsed.sectors ?? []) {
        if (typeof item.slug !== 'string' || typeof item.name !== 'string' || typeof item.x !== 'number' || typeof item.y !== 'number') continue;
        catalogueBySlug.set(item.slug, {
            name: item.name,
            x: item.x,
            y: item.y,
            tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            canonical: item.canonical === true,
        });
    }
    const sectorSlugs = parseStringArray(row.sectors);
    const sectors = [];
    for (const slug of sectorSlugs) {
        const item = bySlug.get(slug);
        if (!item || !item.index_hash) return fail(c, 409, 'conflict', 'Sector build record is missing.', { slug });
        const listed = catalogueBySlug.get(slug);
        if (!listed) return fail(c, 409, 'conflict', `No catalogue entry for ${slug}.`, { slug });
        sectors.push({
            slug,
            name: listed.name,
            x: listed.x,
            y: listed.y,
            tags: listed.tags,
            canonical: listed.canonical,
            systems: item.systems,
            built: item.built,
            partial: item.partial,
            indexHash: item.index_hash,
        });
    }
    const overviews = [];
    for (const sector of sectors) {
        const indexObject = await c.env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${sector.slug}/index.json`);
        if (!indexObject) return fail(c, 409, 'conflict', `No sector index for ${sector.slug}.`, { slug: sector.slug });
        const index = SectorIndex.parse(JSON.parse(await indexObject.text()));
        overviews.push(sectorOverview(index, polityColourFile.colours));
    }
    const overview = TruthOverview.parse({ truthVersion: version, sectors: overviews });
    const overviewBody = stable(overview);
    const overviewHash = await sha256Hex(overviewBody);
    await c.env.PUBLIC_BUCKET.put(`truth/${version}/overview.json`, overviewBody, {
        httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
    });
    const outlinesStarted = Date.now();
    const polities = polityOutlines(overviews, polityColourFile.colours);
    const politiesMs = Date.now() - outlinesStarted;
    const politiesDoc = TruthPolities.parse({ truthVersion: version, polities });
    console.log(JSON.stringify({ polities: politiesDoc.polities.length, ms: politiesMs }));
    const politiesBody = stable(politiesDoc);
    const politiesHash = await sha256Hex(politiesBody);
    await c.env.PUBLIC_BUCKET.put(`truth/${version}/polities.json`, politiesBody, {
        httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
    });
    const releasedAt = new Date().toISOString();
    const manifest = TruthManifest.parse({
        truthVersion: version,
        milieu: row.milieu,
        seed: row.seed,
        settings: JSON.parse(row.settings),
        engineVersion: row.engineVersion,
        overviewHash,
        politiesHash,
        attribution: ATTRIBUTION,
        releasedAt,
        sectors,
    });
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

function countStates(progress: Map<string, SectorProgress>): { done: number; failed: number; queued: number } {
    let done = 0;
    let failed = 0;
    let queued = 0;
    for (const item of progress.values()) {
        if (item.state === 'done') done += 1;
        else if (item.state === 'failed') failed += 1;
        else if (item.state === 'queued') queued += 1;
    }
    return { done, failed, queued };
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

function sourceMismatch(
    input: { milieu: string; seed: string; engineVersion: string; settings: unknown },
    source: { milieu: string; seed: string; engineVersion: string; settings: string },
): string | null {
    if (input.milieu !== source.milieu) return 'milieu';
    if (input.seed !== source.seed) return 'seed';
    if (input.engineVersion !== source.engineVersion) return 'engineVersion';
    if (stable(JSON.parse(source.settings)) !== stable(input.settings)) return 'settings';
    return null;
}

function parseStringArray(value: string | null): string[] {
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}
