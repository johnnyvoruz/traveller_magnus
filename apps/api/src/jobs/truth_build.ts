import { buildSector } from '@voyage/generation';
import { stable } from '@voyage/shared';
import type { Env } from '../env';

type Pinned = { seed: string; settings: Record<string, unknown>; engineVersion: string };
type TruthMessage = { version: string; slug: string; pinned: Pinned };
type CatalogueSector = { slug: string; name: string; x: number; y: number; tags: string[]; canonical: boolean };

const MAX_ATTEMPTS = 3;

export async function truthBuildConsumer(batch: MessageBatch<TruthMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
        try {
            await buildOne(env, message.body);
            message.ack();
        } catch (err) {
            if (message.attempts >= MAX_ATTEMPTS) await markFailed(env, message.body);
            throw err;
        }
    }
}

async function buildOne(env: Env, body: TruthMessage): Promise<void> {
    const started = Date.now();
    const { version, slug, pinned } = body;
    const tsvObject = await env.PRIVATE_BUCKET.get(`inputs/${version}/${slug}.tsv`);
    const xmlObject = await env.PRIVATE_BUCKET.get(`inputs/${version}/${slug}.xml`);
    const catalogueObject = await env.PRIVATE_BUCKET.get(`inputs/${version}/sectors.json`);
    if (!tsvObject || !xmlObject) throw new Error(`Sector inputs are missing for ${version}/${slug}.`);
    if (!catalogueObject) throw new Error(`Sector catalogue is missing for ${version}.`);
    const catalogue = catalogueEntry(await catalogueObject.text(), slug);
    const built = await buildSector({
        slug,
        tsv: await tsvObject.text(),
        metadataXml: await xmlObject.text(),
        pinned,
    });
    const index = {
        ...built.index,
        ...(catalogue
            ? { name: catalogue.name, x: catalogue.x, y: catalogue.y, tags: catalogue.tags, canonical: catalogue.canonical }
            : {}),
        systems: built.counts.systems,
        built: built.counts.built,
        partial: built.counts.partial,
    };
    let newObjects = 0;
    for (const [hash, json] of built.objects) {
        const key = `objects/${hash}`;
        if (await env.PUBLIC_BUCKET.head(key)) continue;
        await env.PUBLIC_BUCKET.put(key, json, {
            httpMetadata: {
                contentType: 'application/json',
                cacheControl: 'public, max-age=31536000, immutable',
            },
        });
        newObjects += 1;
    }
    await env.PUBLIC_BUCKET.put(`truth/${version}/sectors/${slug}/index.json`, stable(index), {
        httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
    });
    const statements = Object.entries(index.hexes as Record<string, Record<string, unknown>>).map(([hex, row]) => {
        return env.DB.prepare(
            `INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, allegiance, zone, tree_hash, partial)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
            version,
            slug,
            hex,
            textOrNull(row.name),
            textOrNull(row.uwp),
            textOrNull(row.allegiance),
            textOrNull(row.zone),
            textOrNull(row.tree),
            textOrNull(row.partial),
        );
    });
    if (statements.length) await env.DB.batch(statements);
    await clearFailed(env, version, slug);
    await env.DB.prepare(
        'UPDATE truth_versions SET sectors_done = sectors_done + 1 WHERE version = ?',
    ).bind(version).run();
    env.METRICS.writeDataPoint({
        indexes: [version],
        blobs: ['truth-build', slug],
        doubles: [statements.length, newObjects, Date.now() - started],
    });
}

async function markFailed(env: Env, body: TruthMessage | undefined): Promise<void> {
    if (!body?.version || !body.slug) return;
    const row = await env.DB.prepare('SELECT sectors_failed FROM truth_versions WHERE version = ?')
        .bind(body.version).first<{ sectors_failed: string }>();
    if (!row) return;
    const failed = parseList(row.sectors_failed);
    if (!failed.includes(body.slug)) failed.push(body.slug);
    await env.DB.prepare('UPDATE truth_versions SET sectors_failed = ? WHERE version = ?')
        .bind(JSON.stringify(failed), body.version).run();
}

async function clearFailed(env: Env, version: string, slug: string): Promise<void> {
    const row = await env.DB.prepare('SELECT sectors_failed FROM truth_versions WHERE version = ?')
        .bind(version).first<{ sectors_failed: string }>();
    if (!row) return;
    const failed = parseList(row.sectors_failed).filter((item) => item !== slug);
    await env.DB.prepare('UPDATE truth_versions SET sectors_failed = ? WHERE version = ?')
        .bind(JSON.stringify(failed), version).run();
}

function parseList(value: string | null): string[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
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
