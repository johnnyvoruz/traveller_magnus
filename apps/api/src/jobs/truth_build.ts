import { buildSectorSlice } from '@voyage/generation';
import { parseMetadataXml, sha256Hex, stable } from '@voyage/shared';
import type { Env } from '../env';

type Pinned = { seed: string; settings: Record<string, unknown>; engineVersion: string };
type TruthMessage = { version: string; slug: string; offset?: number; pinned: Pinned };
type CatalogueSector = { slug: string; name: string; x: number; y: number; tags: string[]; canonical: boolean };
type SliceRow = { hex: string; indexEntry: Record<string, unknown> };

const MAX_DELIVERIES = 4;
const SLICE = 25;
const PARAM_LIMIT = 100;
const SYSTEM_COLUMNS = 9;

export async function truthBuildConsumer(batch: MessageBatch<TruthMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
        try {
            await buildSlice(env, message.body);
            message.ack();
        } catch (err) {
            if (message.attempts >= MAX_DELIVERIES) await markFailed(env, message.body, err);
            throw err;
        }
    }
}

async function buildSlice(env: Env, body: TruthMessage): Promise<void> {
    const { version, slug, pinned } = body;
    const offset = body.offset ?? 0;
    const tsvObject = await env.PRIVATE_BUCKET.get(`inputs/${version}/${slug}.tsv`);
    if (!tsvObject) throw new Error(`Sector inputs are missing for ${version}/${slug}.`);
    const slice = await buildSectorSlice({
        slug,
        tsv: await tsvObject.text(),
        pinned,
        offset,
        limit: SLICE,
    });
    for (const [hash, json] of slice.objects) {
        await env.PUBLIC_BUCKET.put(`objects/${hash}`, json, {
            httpMetadata: {
                contentType: 'application/json',
                cacheControl: 'public, max-age=31536000, immutable',
            },
        });
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
        return;
    }
    await finalize(env, version, slug);
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
    const xmlObject = await env.PRIVATE_BUCKET.get(`inputs/${version}/${slug}.xml`);
    if (!xmlObject) throw new Error(`Sector metadata is missing for ${version}/${slug}.`);
    const meta = parseMetadataXml(await xmlObject.text());
    if (meta.x === null || meta.y === null || Number.isNaN(meta.x) || Number.isNaN(meta.y)) {
        throw new Error(`Sector metadata has no coordinates for ${slug}.`);
    }
    const catalogueObject = await env.PRIVATE_BUCKET.get(`inputs/${version}/sectors.json`);
    const catalogue = catalogueObject ? catalogueEntry(await catalogueObject.text(), slug) : null;
    let built = 0;
    let partial = 0;
    for (const row of Object.values(hexes)) {
        if (row.partial == null) built += 1;
        else partial += 1;
    }
    const index = {
        slug,
        name: catalogue?.name ?? meta.name,
        x: catalogue?.x ?? meta.x,
        y: catalogue?.y ?? meta.y,
        ...(catalogue ? { tags: catalogue.tags, canonical: catalogue.canonical } : {}),
        truthVersion: version,
        systems: Object.keys(hexes).length,
        built,
        partial,
        hexes,
        metadata: { routes: meta.routes, borders: meta.borders, names: meta.names },
    };
    const body = stable(index);
    const indexHash = await sha256Hex(body);
    await env.PUBLIC_BUCKET.put(`truth/${version}/sectors/${slug}/index.json`, body, {
        httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
    });
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
        env.DB.prepare('DELETE FROM truth_systems WHERE version = ? AND sector_slug = ?').bind(version, slug),
    ];
    const entries = Object.entries(hexes);
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
        `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
         VALUES (?, ?, 'done', ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(version, sector_slug) DO UPDATE SET
            state = 'done', systems = excluded.systems, built = excluded.built, partial = excluded.partial,
            index_hash = excluded.index_hash, error = NULL, updated_at = excluded.updated_at`,
    ).bind(version, slug, Object.keys(hexes).length, built, partial, indexHash, now));
    await env.DB.batch(statements);
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
}

function catalogueEntry(raw: string, slug: string): CatalogueSector | null {
    const parsed = JSON.parse(raw) as { sectors?: unknown };
    if (!Array.isArray(parsed.sectors)) throw new Error('Sector catalogue has no sectors array.');
    const found = parsed.sectors.find((item) => {
        return !!item && typeof item === 'object' && (item as { slug?: unknown }).slug === slug;
    }) as Record<string, unknown> | undefined;
    if (!found) return null;
    if (typeof found.name !== 'string' || typeof found.x !== 'number' || typeof found.y !== 'number') {
        throw new Error(`Sector catalogue entry ${slug} is missing name or coordinates.`);
    }
    const tags = Array.isArray(found.tags) ? found.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    return { slug, name: found.name, x: found.x, y: found.y, tags, canonical: found.canonical === true };
}

function textOrNull(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}
