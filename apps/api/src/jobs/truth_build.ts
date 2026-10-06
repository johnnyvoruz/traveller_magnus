import { assembleSectorIndex, buildSectorSlice, type CatalogueEntry } from '@voyage/generation';
import { SectorIndex, sha256Hex, stable } from '@voyage/shared';
import type { Env } from '../env';
import { resolveCatalogue } from './inputs.ts';
import {
    DEPENDENCY_REBUILDS,
    RECONCILE_SLICE,
    RECONCILE_TRANSFORM,
    SCHEMA_VERSION,
    assertChartPreserved,
    assertCountsMatchSource,
    emptyReport,
    hexCounts,
    mergeReports,
    reconcileCachePrefix,
    reconcileStoredObject,
    reconciliationDigests,
    sliceKeys,
    type ReconcileReport,
} from './reconcile_transform.ts';

type Pinned = { seed: string; settings: Record<string, unknown>; engineVersion: string };
type TruthMessage = {
    version: string;
    slug: string;
    offset?: number;
    from?: string;
    pinned: Pinned;
    transform?: string;
    policyDigest?: string;
};
type ReconcileCarry = { name: string; policyDigest: string };
type SliceRow = { hex: string; indexEntry: Record<string, unknown> };

const MAX_DELIVERIES = 4;
const SLICE = 25;
const PARAM_LIMIT = 100;
const SYSTEM_COLUMNS = 9;

export async function truthBuildConsumer(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
        try {
            const body = message.body as TruthMessage;
            if (body?.from) await deriveSector(env, body);
            else await buildSlice(env, body);
            message.ack();
        } catch (err) {
            if (message.attempts >= MAX_DELIVERIES) await markFailed(env, message.body as TruthMessage | undefined, err);
            throw err;
        }
    }
}

async function buildSlice(env: Env, body: TruthMessage): Promise<void> {
    const { version, slug, pinned } = body;
    const offset = body.offset ?? 0;
    const tsvObject = await env.PRIVATE_BUCKET.get(`inputs/${version}/${slug}.tsv`);
    if (!tsvObject) throw new Error(`Sector inputs are missing for ${version}/${slug}.`);
    const started = Date.now();
    const slice = await buildSectorSlice({
        slug,
        tsv: await tsvObject.text(),
        pinned,
        offset,
        limit: SLICE,
    });
    const trees = [...slice.objects];
    for (let i = 0; i < trees.length; i += 5) {
        const group = trees.slice(i, i + 5);
        await Promise.all(group.map(([hash, json]) => env.PUBLIC_BUCKET.put(`objects/${hash}`, json, {
            httpMetadata: {
                contentType: 'application/json',
                cacheControl: 'public, max-age=31536000, immutable',
            },
        })));
    }
    await env.PRIVATE_BUCKET.put(
        `inputs/${version}/_parts/${slug}/${offset}.json`,
        stable({ offset, total: slice.total, rows: slice.rows }),
        { httpMetadata: { contentType: 'application/json' } },
    );
    await env.DB.prepare(
        `UPDATE truth_build_sectors SET updated_at = ? WHERE version = ? AND sector_slug = ? AND state != 'done'`,
    ).bind(new Date().toISOString(), version, slug).run();
    if (slice.nextOffset != null) {
        await env.TRUTH_QUEUE.send({ version, slug, offset: slice.nextOffset, pinned });
    } else {
        await finalize(env, version, slug);
        await claimNext(env, version, pinned);
    }
    console.log(JSON.stringify({
        job: 'truth-build',
        version,
        slug,
        offset,
        rows: slice.rows.length,
        objects: slice.objects.size,
        ms: Date.now() - started,
    }));
}

async function finalize(env: Env, version: string, slug: string): Promise<void> {
    const hexes: Record<string, Record<string, unknown>> = {};
    let cursor: string | undefined;
    const partKeys: string[] = [];
    do {
        const page = await env.PRIVATE_BUCKET.list({
            prefix: `inputs/${version}/_parts/${slug}/`,
            cursor,
            limit: 1000,
        });
        for (const object of page.objects) partKeys.push(object.key);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    partKeys.sort();
    let total: number | null = null;
    const seen = new Set<string>();
    for (const key of partKeys) {
        const object = await env.PRIVATE_BUCKET.get(key);
        if (!object) throw new Error(`Sector part is missing: ${key}`);
        const part = JSON.parse(await object.text()) as { total?: unknown; rows?: SliceRow[] };
        if (typeof part.total !== 'number') throw new Error(`Sector part has no total: ${key}`);
        if (total == null) total = part.total;
        else if (part.total !== total) throw new Error(`Sector part totals disagree for ${slug}.`);
        for (const row of part.rows ?? []) {
            seen.add(row.hex);
            hexes[row.hex] = row.indexEntry;
        }
    }
    if (total == null || seen.size !== total) {
        throw new Error(`Sector parts for ${slug} cover ${seen.size} hexes, not ${total}.`);
    }
    await publishSector(env, version, slug, hexes);
}

/** Index write and search rows shared by a full build and a derived build. */
async function publishSector(env: Env, version: string, slug: string, hexes: Record<string, Record<string, unknown>>, from?: string): Promise<{ indexHash: string; systems: number; built: number; partial: number }> {
    const resolved = await resolveCatalogue(env.DB, env.PRIVATE_BUCKET, version, from);
    const xmlObject = await env.PRIVATE_BUCKET.get(`inputs/${resolved.version}/${slug}.xml`);
    if (!xmlObject) throw new Error(`Sector metadata is missing for ${version}/${slug}.`);
    const catalogue = catalogueEntry(resolved.text, slug);
    const index = SectorIndex.parse(assembleSectorIndex({
        slug,
        version,
        metadataXml: await xmlObject.text(),
        catalogue,
        hexes,
    }));
    const body = stable(index);
    const indexHash = await sha256Hex(body);
    await env.PUBLIC_BUCKET.put(`truth/${version}/sectors/${slug}/index.json`, body, {
        httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
    });
    const now = new Date().toISOString();
    const canonical = catalogue?.canonical === true ? 1 : 0;
    const statements: D1PreparedStatement[] = [
        env.DB.prepare('DELETE FROM truth_systems WHERE version = ? AND sector_slug = ?').bind(version, slug),
    ];
    const entries = Object.entries(index.hexes);
    const per = Math.floor(PARAM_LIMIT / SYSTEM_COLUMNS);
    for (let i = 0; i < entries.length; i += per) {
        const chunk = entries.slice(i, i + per);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const binds: (string | null)[] = [];
        for (const [hex, row] of chunk) {
            binds.push(
                version, slug, hex,
                textOrNull(row.name), textOrNull(row.uwp), textOrNull(row.allegiance), textOrNull(row.zone),
                textOrNull(row.tree), textOrNull(row.partial),
            );
        }
        statements.push(env.DB.prepare(
            `INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, allegiance, zone, tree_hash, partial)
             VALUES ${placeholders}`,
        ).bind(...binds));
    }
    statements.push(env.DB.prepare(
        `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at, canonical)
         VALUES (?, ?, 'done', ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(version, sector_slug) DO UPDATE SET
            state = 'done', systems = excluded.systems, built = excluded.built, partial = excluded.partial,
            index_hash = excluded.index_hash, error = NULL, updated_at = excluded.updated_at,
            canonical = excluded.canonical`,
    ).bind(version, slug, index.systems, index.built, index.partial, indexHash, now, canonical));
    await env.DB.batch(statements);
    return { indexHash, systems: index.systems, built: index.built, partial: index.partial };
}

async function deriveSector(env: Env, body: TruthMessage): Promise<void> {
    if (body.transform) {
        await deriveReconcile(env, body);
        return;
    }
    const { version, slug, pinned, from } = body;
    if (!from) throw new Error('Derived build is missing a source version.');
    const started = Date.now();
    const indexObject = await env.PUBLIC_BUCKET.get(`truth/${from}/sectors/${slug}/index.json`);
    if (!indexObject) throw new Error(`Sector index is missing for ${from}/${slug}.`);
    const source = JSON.parse(await indexObject.text()) as { hexes?: unknown };
    if (!source.hexes || typeof source.hexes !== 'object' || Array.isArray(source.hexes)) {
        throw new Error(`Sector index for ${from}/${slug} has no hexes.`);
    }
    await publishSector(env, version, slug, source.hexes as Record<string, Record<string, unknown>>, from);
    await claimNext(env, version, pinned, from);
    console.log(JSON.stringify({
        job: 'truth-derive',
        version,
        slug,
        from,
        ms: Date.now() - started,
    }));
}

export async function claimNext(env: Env, version: string, pinned: Pinned, from?: string, reconcile?: ReconcileCarry): Promise<void> {
    const claimed = await env.DB.prepare(
        `UPDATE truth_build_sectors
         SET state = 'building', updated_at = ?
         WHERE version = ? AND sector_slug = (
             SELECT sector_slug FROM truth_build_sectors
             WHERE version = ? AND state = 'queued'
             ORDER BY sector_slug
             LIMIT 1
         )
         RETURNING sector_slug`,
    ).bind(new Date().toISOString(), version, version).run<{ sector_slug: string }>();
    const slug = claimed?.results?.[0]?.sector_slug;
    if (!slug) return;
    const carry = reconcile ? { transform: reconcile.name, policyDigest: reconcile.policyDigest } : {};
    if (from) await env.TRUTH_QUEUE.send({ version, slug, offset: 0, from, pinned, ...carry });
    else await env.TRUTH_QUEUE.send({ version, slug, offset: 0, pinned, ...carry });
}

async function markFailed(env: Env, body: TruthMessage | undefined, err: unknown): Promise<void> {
    if (!body?.version || !body.slug) return;
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    await env.DB.prepare(
        `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
         VALUES (?, ?, 'failed', 0, 0, 0, NULL, ?, ?)
         ON CONFLICT(version, sector_slug) DO UPDATE SET
            state = 'failed', error = excluded.error, updated_at = excluded.updated_at`,
    ).bind(body.version, body.slug, message, now).run();
    if (body.pinned) await claimNext(env, body.version, body.pinned, body.from, reconcileCarry(body));
}

function reconcileCarry(body: TruthMessage): ReconcileCarry | undefined {
    if (body.transform !== RECONCILE_TRANSFORM || typeof body.policyDigest !== 'string' || body.policyDigest.length === 0) return undefined;
    return { name: body.transform, policyDigest: body.policyDigest };
}

type SourceIndex = {
    systems?: unknown;
    built?: unknown;
    partial?: unknown;
    hexes: Record<string, Record<string, unknown>>;
};

type SlicePart = {
    offset: number;
    nextOffset: number | null;
    sourceHash: string;
    policyDigest: string;
    from: string;
    hexes: Record<string, Record<string, unknown>>;
    report: ReconcileReport;
};

const JSON_META = { httpMetadata: { contentType: 'application/json' } };
const PUBLIC_META = {
    httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000, immutable',
    },
};

async function deriveReconcile(env: Env, body: TruthMessage): Promise<void> {
    const started = Date.now();
    const { version, slug, pinned, from } = body;
    if (!from) throw new Error('Derived build is missing a source version.');
    if (body.transform !== RECONCILE_TRANSFORM) throw new Error(`Unknown derived transform: ${body.transform}`);
    const carry = reconcileCarry(body);
    if (!carry) throw new Error('Reconcile transform is missing its policy digest.');
    const live = await reconciliationDigests();
    if (carry.policyDigest !== live.policyDigest) {
        throw new Error('policy digest does not match the bundled policy');
    }
    const recorded = await readProvenance(env, version);
    if (recorded.transform !== RECONCILE_TRANSFORM || recorded.from !== from) {
        throw new Error('Reconciliation provenance does not match this derived build.');
    }
    if (recorded.policyDigest !== carry.policyDigest || recorded.rulesDigest !== live.rulesDigest) {
        throw new Error('policy digest does not match the recorded provenance');
    }
    if (recorded.engineVersion !== pinned.engineVersion) {
        throw new Error('Reconcile provenance engine version does not match the carried engine version.');
    }
    const source = await readSourceIndex(env, from, slug);
    const sourceText = source.text;
    const sourceHash = await sha256Hex(sourceText);
    const offset = body.offset ?? 0;
    if (offset === 0 && await reusePublished(env, body, sourceHash, carry)) {
        console.log(JSON.stringify({
            job: 'truth-derive', version, slug, from, transform: RECONCILE_TRANSFORM, offset, reuse: true, ms: Date.now() - started,
        }));
        return;
    }
    const prefix = reconcileCachePrefix(from, sourceHash, carry.policyDigest, slug);
    const partKey = `${prefix}/parts/${String(offset).padStart(6, '0')}.json`;
    const existing = await env.PRIVATE_BUCKET.get(partKey);
    if (existing) {
        const part = JSON.parse(await existing.text()) as SlicePart;
        assertPart(part, sourceHash, carry.policyDigest, from);
        if (part.nextOffset != null) {
            await env.TRUTH_QUEUE.send({ version, slug, offset: part.nextOffset, from, pinned, transform: carry.name, policyDigest: carry.policyDigest });
        } else {
            await finishReconcile(env, body, source.parsed, sourceHash, carry, prefix);
        }
        return;
    }
    const chosen = sliceKeys(Object.keys(source.parsed.hexes), offset, RECONCILE_SLICE);
    const hexes: Record<string, Record<string, unknown>> = {};
    const report = emptyReport();
    for (const hex of chosen.keys) {
        const row = source.parsed.hexes[hex];
        if (!row || typeof row !== 'object') throw new Error(`Hex ${hex} is missing its chart row.`);
        hexes[hex] = await reconcileHex(env, from, slug, hex, row, live.policy, report);
    }
    const part: SlicePart = {
        offset,
        nextOffset: chosen.nextOffset,
        sourceHash,
        policyDigest: carry.policyDigest,
        from,
        hexes,
        report,
    };
    await env.PRIVATE_BUCKET.put(partKey, stable(part), JSON_META);
    if (chosen.nextOffset != null) {
        await env.TRUTH_QUEUE.send({ version, slug, offset: chosen.nextOffset, from, pinned, transform: carry.name, policyDigest: carry.policyDigest });
        console.log(JSON.stringify({
            job: 'truth-derive', version, slug, from, transform: RECONCILE_TRANSFORM, offset, rows: chosen.keys.length, ms: Date.now() - started,
        }));
        return;
    }
    await finishReconcile(env, body, source.parsed, sourceHash, carry, prefix);
    console.log(JSON.stringify({
        job: 'truth-derive', version, slug, from, transform: RECONCILE_TRANSFORM, offset, rows: chosen.keys.length, ms: Date.now() - started,
    }));
}

async function reconcileHex(
    env: Env,
    from: string,
    slug: string,
    hex: string,
    row: Record<string, unknown>,
    policy: { version: string; surfaceBands: unknown; orbitBands: unknown; liquid: unknown; liquids: unknown },
    report: ReconcileReport,
): Promise<Record<string, unknown>> {
    if (row.tree == null) return { ...row, tree: null };
    if (typeof row.tree !== 'string' || row.tree.length === 0) throw new Error(`Hex ${hex} has no object hash.`);
    const object = await env.PUBLIC_BUCKET.get(`objects/${row.tree}`);
    if (!object) throw new Error(`Source object is missing for ${from}/${slug}/${hex}.`);
    const canonical = await object.text();
    const stored = await reconcileStoredObject(row.tree, canonical, hex, policy);
    if (stored.changed) await putObjectIfAbsent(env, stored.hash, stored.canonical);
    mergeReports(report, stored.report);
    return { ...row, tree: stored.hash };
}

async function putObjectIfAbsent(env: Env, hash: string, canonical: string): Promise<void> {
    const key = `objects/${hash}`;
    const existing = await env.PUBLIC_BUCKET.get(key);
    if (existing) return;
    await env.PUBLIC_BUCKET.put(key, canonical, PUBLIC_META);
}

async function finishReconcile(
    env: Env,
    body: TruthMessage,
    source: SourceIndex,
    sourceHash: string,
    carry: ReconcileCarry,
    prefix: string,
): Promise<void> {
    const { version, slug, from } = body;
    if (!from) throw new Error('Derived build is missing a source version.');
    const reportKey = `truth/${version}/reconciliation/sectors/${slug}.json`;
    const indexKey = `truth/${version}/sectors/${slug}/index.json`;
    const existingReport = await env.PUBLIC_BUCKET.get(reportKey);
    const existingIndex = await env.PUBLIC_BUCKET.get(indexKey);
    if (existingReport && existingIndex) {
        const saved = JSON.parse(await existingReport.text()) as { sourceHash?: unknown; policyDigest?: unknown; from?: unknown; indexHash?: unknown };
        const indexHash = await sha256Hex(await existingIndex.text());
        if (saved.sourceHash === sourceHash && saved.policyDigest === carry.policyDigest && saved.from === from && saved.indexHash === indexHash) {
            await markSectorDone(env, version, slug, saved as { systems: number; built: number; partial: number; indexHash: string });
            await claimNext(env, version, body.pinned, from, carry);
            return;
        }
    }
    const merged = await loadParts(env, prefix, sourceHash, carry.policyDigest, from);
    assertChartPreserved(source.hexes, merged.hexes);
    const counts = hexCounts(merged.hexes);
    assertCountsMatchSource(source, counts);
    const expected = hexCounts(source.hexes);
    if (expected.systems !== counts.systems || expected.built !== counts.built || expected.partial !== counts.partial) {
        throw new Error('Reconciled counts do not match the source hexes.');
    }
    for (const [hex, row] of Object.entries(merged.hexes)) {
        if (row.tree == null) continue;
        if (typeof row.tree !== 'string') throw new Error(`Hex ${hex} has no object hash.`);
        const object = await env.PUBLIC_BUCKET.get(`objects/${row.tree}`);
        if (!object) throw new Error(`Reconciled object is missing for ${slug}/${hex}.`);
    }
    const published = await publishSector(env, version, slug, merged.hexes, from);
    if (published.systems !== counts.systems || published.built !== counts.built || published.partial !== counts.partial) {
        throw new Error('Published sector counts do not match the source.');
    }
    const live = await reconciliationDigests();
    const sectorReport = {
        schemaVersion: SCHEMA_VERSION,
        transform: RECONCILE_TRANSFORM,
        from,
        sourceHash,
        policyDigest: carry.policyDigest,
        rulesDigest: live.rulesDigest,
        engineVersion: body.pinned.engineVersion,
        generationProvenance: 'carried',
        sector: slug,
        indexHash: published.indexHash,
        counts,
        dependencyRebuilds: [...DEPENDENCY_REBUILDS],
        ...merged.report,
    };
    const sectorBody = stable(sectorReport);
    await env.PUBLIC_BUCKET.put(reportKey, sectorBody, PUBLIC_META);
    await writeTotalReport(env, version, from, carry.policyDigest, live.rulesDigest, body.pinned.engineVersion);
    console.log(JSON.stringify({
        job: 'truth-derive', version, slug, from, transform: RECONCILE_TRANSFORM, reportBytes: sectorBody.length,
    }));
    await claimNext(env, version, body.pinned, from, carry);
}

async function reusePublished(env: Env, body: TruthMessage, sourceHash: string, carry: ReconcileCarry): Promise<boolean> {
    const { version, slug, from } = body;
    if (!from) return false;
    const reportKey = `truth/${version}/reconciliation/sectors/${slug}.json`;
    const indexKey = `truth/${version}/sectors/${slug}/index.json`;
    const reportObject = await env.PUBLIC_BUCKET.get(reportKey);
    if (!reportObject) return false;
    const saved = JSON.parse(await reportObject.text()) as {
        sourceHash?: unknown; policyDigest?: unknown; from?: unknown; indexHash?: unknown;
        counts?: { systems?: unknown; built?: unknown; partial?: unknown };
    };
    if (saved.sourceHash !== sourceHash || saved.policyDigest !== carry.policyDigest || saved.from !== from) return false;
    if (typeof saved.indexHash !== 'string') return false;
    const indexObject = await env.PUBLIC_BUCKET.get(indexKey);
    if (!indexObject) return false;
    const indexHash = await sha256Hex(await indexObject.text());
    if (indexHash !== saved.indexHash) return false;
    const counts = saved.counts;
    if (!counts || typeof counts.systems !== 'number' || typeof counts.built !== 'number' || typeof counts.partial !== 'number') return false;
    await markSectorDone(env, version, slug, { systems: counts.systems, built: counts.built, partial: counts.partial, indexHash });
    await claimNext(env, version, body.pinned, from, carry);
    return true;
}

async function loadParts(
    env: Env,
    prefix: string,
    sourceHash: string,
    policyDigest: string,
    from: string,
): Promise<{ hexes: Record<string, Record<string, unknown>>; report: ReconcileReport }> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
        const page = await env.PRIVATE_BUCKET.list({ prefix: `${prefix}/parts/`, cursor, limit: 1000 });
        for (const object of page.objects) keys.push(object.key);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    keys.sort();
    const hexes: Record<string, Record<string, unknown>> = {};
    const report = emptyReport();
    let expected = 0;
    for (const key of keys) {
        const object = await env.PRIVATE_BUCKET.get(key);
        if (!object) throw new Error(`Reconcile part is missing: ${key}`);
        const part = JSON.parse(await object.text()) as SlicePart;
        assertPart(part, sourceHash, policyDigest, from);
        if (part.offset !== expected) throw new Error('Reconcile parts are missing a slice.');
        Object.assign(hexes, part.hexes);
        mergeReports(report, part.report);
        expected = part.nextOffset ?? expected;
        if (part.nextOffset == null) expected = -1;
    }
    if (expected !== -1) throw new Error('Reconcile parts do not cover the sector.');
    return { hexes, report };
}

function assertPart(part: SlicePart, sourceHash: string, policyDigest: string, from: string): void {
    if (part.sourceHash !== sourceHash || part.policyDigest !== policyDigest || part.from !== from) {
        throw new Error('Cached reconciliation does not match this source and policy.');
    }
}

async function writeTotalReport(
    env: Env,
    version: string,
    from: string,
    policyDigest: string,
    rulesDigest: string,
    engineVersion: string,
): Promise<void> {
    const keys: string[] = [];
    let cursor: string | undefined;
    const prefix = `truth/${version}/reconciliation/sectors/`;
    do {
        const page = await env.PUBLIC_BUCKET.list({ prefix, cursor, limit: 1000 });
        for (const object of page.objects) keys.push(object.key);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    keys.sort();
    const report = emptyReport();
    const sectors: string[] = [];
    for (const key of keys) {
        const object = await env.PUBLIC_BUCKET.get(key);
        if (!object) throw new Error(`Sector reconciliation report is missing: ${key}`);
        const saved = JSON.parse(await object.text()) as ReconcileReport & { sector?: unknown };
        if (typeof saved.sector === 'string') sectors.push(saved.sector);
        mergeReports(report, saved);
    }
    const total = {
        schemaVersion: SCHEMA_VERSION,
        transform: RECONCILE_TRANSFORM,
        from,
        policyDigest,
        rulesDigest,
        engineVersion,
        generationProvenance: 'carried',
        dependencyRebuilds: [...DEPENDENCY_REBUILDS],
        sectors,
        ...report,
    };
    await env.PUBLIC_BUCKET.put(`truth/${version}/reconciliation/report.json`, stable(total), PUBLIC_META);
}

async function markSectorDone(
    env: Env,
    version: string,
    slug: string,
    saved: { systems: number; built: number; partial: number; indexHash: string },
): Promise<void> {
    await env.DB.prepare(
        `UPDATE truth_build_sectors
         SET state = 'done', systems = ?, built = ?, partial = ?, index_hash = ?, error = NULL, updated_at = ?
         WHERE version = ? AND sector_slug = ?`,
    ).bind(saved.systems, saved.built, saved.partial, saved.indexHash, new Date().toISOString(), version, slug).run();
}

async function readProvenance(env: Env, version: string): Promise<{
    transform?: unknown; from?: unknown; policyDigest?: unknown; rulesDigest?: unknown; engineVersion?: unknown;
}> {
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/reconciliation.json`);
    if (!object) throw new Error('Reconciliation provenance is missing.');
    const parsed = JSON.parse(await object.text()) as {
        transform?: unknown; from?: unknown; policyDigest?: unknown; rulesDigest?: unknown; engineVersion?: unknown;
    };
    if (parsed.transform !== RECONCILE_TRANSFORM) throw new Error('Reconciliation provenance names another transform.');
    return parsed;
}

async function readSourceIndex(env: Env, from: string, slug: string): Promise<{ text: string; parsed: SourceIndex }> {
    const indexObject = await env.PUBLIC_BUCKET.get(`truth/${from}/sectors/${slug}/index.json`);
    if (!indexObject) throw new Error(`Sector index is missing for ${from}/${slug}.`);
    const text = await indexObject.text();
    const source = JSON.parse(text) as { hexes?: unknown; systems?: unknown; built?: unknown; partial?: unknown };
    if (!source.hexes || typeof source.hexes !== 'object' || Array.isArray(source.hexes)) {
        throw new Error(`Sector index for ${from}/${slug} has no hexes.`);
    }
    return {
        text,
        parsed: {
            systems: source.systems,
            built: source.built,
            partial: source.partial,
            hexes: source.hexes as Record<string, Record<string, unknown>>,
        },
    };
}

function catalogueEntry(raw: string, slug: string): CatalogueEntry | undefined {
    const parsed = JSON.parse(raw) as { sectors?: unknown };
    if (!Array.isArray(parsed.sectors)) throw new Error('Sector catalogue has no sectors array.');
    const found = parsed.sectors.find((item) => {
        return !!item && typeof item === 'object' && (item as { slug?: unknown }).slug === slug;
    }) as Record<string, unknown> | undefined;
    if (!found) return undefined;
    if (typeof found.name !== 'string' || typeof found.x !== 'number' || typeof found.y !== 'number') {
        throw new Error(`Sector catalogue entry ${slug} is missing name or coordinates.`);
    }
    const tags = Array.isArray(found.tags) ? found.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    return { name: found.name, x: found.x, y: found.y, tags, canonical: found.canonical === true };
}

function textOrNull(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}
