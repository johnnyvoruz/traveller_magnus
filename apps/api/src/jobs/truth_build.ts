import { assembleSectorIndex, buildSectorSlice, type CatalogueEntry } from '@voyage/generation';
import { SectorIndex, sha256Hex, stable } from '@voyage/shared';
import type { Env } from '../env';

type Pinned = { seed: string; settings: Record<string, unknown>; engineVersion: string };
type TruthMessage = { version: string; slug: string; offset?: number; from?: string; pinned: Pinned };
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

/** The new version's copy wins. A derived build falls back to inputs/<from>/. */
async function privateInput(env: Env, version: string, from: string | undefined, name: string) {
    const own = await env.PRIVATE_BUCKET.get(`inputs/${version}/${name}`);
    if (own || !from) return own;
    return env.PRIVATE_BUCKET.get(`inputs/${from}/${name}`);
}

/** Index write and search rows shared by a full build and a derived build. */
async function publishSector(env: Env, version: string, slug: string, hexes: Record<string, Record<string, unknown>>, from?: string): Promise<void> {
    const xmlObject = await privateInput(env, version, from, `${slug}.xml`);
    if (!xmlObject) throw new Error(`Sector metadata is missing for ${version}/${slug}.`);
    const catalogueObject = await privateInput(env, version, from, 'sectors.json');
    const catalogue = catalogueObject ? catalogueEntry(await catalogueObject.text(), slug) : undefined;
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
}

async function deriveSector(env: Env, body: TruthMessage): Promise<void> {
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

export async function claimNext(env: Env, version: string, pinned: Pinned, from?: string): Promise<void> {
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
    if (from) await env.TRUTH_QUEUE.send({ version, slug, offset: 0, from, pinned });
    else await env.TRUTH_QUEUE.send({ version, slug, offset: 0, pinned });
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
    if (body.pinned) await claimNext(env, body.version, body.pinned, body.from);
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
