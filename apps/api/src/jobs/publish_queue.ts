import { PackageHex, PackageManifest, sha256Hex, stable, type PackageHex as HexRow } from '@voyage/shared';
import type { Env } from '../env';
import { chartTree, ownSectorKey, sectorOf } from '../universe/hexes.ts';
import type { PublishSources } from '../universe/publish_read.ts';

const HASH = /^[0-9a-f]{64}$/;

export class PublishRefusal extends Error {
    readonly details: unknown;

    constructor(message: string, details?: unknown) {
        super(message);
        this.details = details;
    }
}

type PublishMessage = { kind?: unknown; packageId?: unknown; version?: unknown; universeId?: unknown };

type VersionRow = { state: string; hexKeys: string; recordIds: string };
type PackageRow = { kind: string; title: string; edition: string; authorId: string; universeId: string };
type UniverseRow = { engineVersion: string; truthVersion: string | null; deletedAt: string | null };

export type ResolvedPublish = {
    hexes: Record<string, HexRow>;
    records: unknown[];
    treeHashes: string[];
    imageHashes: string[];
};

function unique(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        if (seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

function messageOf(err: unknown): string {
    const text = err instanceof Error ? err.message : String(err);
    return text.slice(0, 200);
}

async function universeCall(env: Env, universeId: string, hexKeys: string[], recordIds: string[]): Promise<PublishSources> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const response = await stub.fetch(new Request('https://universe.internal/publish-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hexKeys, recordIds }),
    }));
    const parsed = await response.json() as { data?: PublishSources; error?: { message?: string } };
    if (!response.ok || !parsed.data) throw new Error(parsed.error?.message || 'Publish read failed.');
    return parsed.data;
}

async function chartHex(env: Env, version: string, hexKey: string, cache: Map<string, Record<string, unknown> | null>): Promise<unknown> {
    const { sector, local } = sectorOf(hexKey);
    let index = cache.get(sector);
    if (index === undefined) {
        const object = await env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${sector}/index.json`);
        if (!object) {
            index = null;
        } else {
            const parsed = JSON.parse(await object.text()) as { hexes?: Record<string, unknown> };
            index = parsed.hexes ?? {};
        }
        cache.set(sector, index);
    }
    if (!index) return null;
    return index[local] ?? null;
}

function asSummary(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function oneHex(source: PublishSources['hexes'][number], chart: unknown): { hex: HexRow; tree: string | null } {
    if (source.found && source.deleted) {
        return {
            hex: PackageHex.parse({
                baseHash: ownSectorKey(source.hexKey) ? null : source.baseHash,
                deleted: true,
            }),
            tree: null,
        };
    }
    if (source.found) {
        const summary = asSummary(source.summary);
        const hex: HexRow = { baseHash: ownSectorKey(source.hexKey) ? null : source.baseHash };
        if (source.treeHash) hex.treeHash = source.treeHash;
        if (summary) hex.summary = summary;
        return { hex: PackageHex.parse(hex), tree: source.treeHash };
    }
    if (chart && typeof chart === 'object') {
        const tree = chartTree(chart);
        const summary = asSummary(chart);
        const hex: HexRow = { baseHash: tree };
        if (tree) hex.treeHash = tree;
        if (summary) hex.summary = summary;
        return { hex: PackageHex.parse(hex), tree };
    }
    throw new PublishRefusal('A hex is not in this universe.', { hexKey: source.hexKey });
}

function imageHashesOf(record: unknown): string[] {
    if (!record || typeof record !== 'object') return [];
    const images = (record as { images?: unknown }).images;
    if (!Array.isArray(images)) return [];
    const hashes: string[] = [];
    for (const image of images) {
        if (!image || typeof image !== 'object') continue;
        const row = image as { hash?: unknown; thumbHash?: unknown };
        if (typeof row.hash === 'string') hashes.push(row.hash);
        if (typeof row.thumbHash === 'string') hashes.push(row.thumbHash);
    }
    return hashes;
}

/** Reads the named hexes and records. Throws `PublishRefusal` when one is not in the universe. */
export async function resolvePublish(env: Env, universeId: string, truthVersion: string, hexKeys: string[], recordIds: string[]): Promise<ResolvedPublish> {
    const sources = await universeCall(env, universeId, hexKeys, recordIds);
    if (sources.hexes.length !== hexKeys.length || sources.records.length !== recordIds.length) {
        throw new Error('Publish read failed.');
    }
    const cache = new Map<string, Record<string, unknown> | null>();
    const hexes: Record<string, HexRow> = {};
    const treeHashes: string[] = [];
    for (let i = 0; i < hexKeys.length; i += 1) {
        const source = sources.hexes[i];
        if (!source || source.hexKey !== hexKeys[i]) throw new Error('Publish read failed.');
        const chart = source.found ? null : await chartHex(env, truthVersion, source.hexKey, cache);
        const built = oneHex(source, chart);
        hexes[source.hexKey] = built.hex;
        if (built.tree) treeHashes.push(built.tree);
    }
    const records: unknown[] = [];
    const imageHashes: string[] = [];
    for (let i = 0; i < recordIds.length; i += 1) {
        const source = sources.records[i];
        if (!source || source.id !== recordIds[i]) throw new Error('Publish read failed.');
        if (!source.found || source.deleted || source.record == null) {
            throw new PublishRefusal('No such record.', { recordId: source.id });
        }
        records.push(source.record);
        imageHashes.push(...imageHashesOf(source.record));
    }
    return { hexes, records, treeHashes, imageHashes };
}

async function copyObject(env: Env, universeId: string, hash: string): Promise<{ bytes: number; wrote: boolean }> {
    if (!HASH.test(hash)) throw new Error('Missing object.');
    const key = `objects/${hash}`;
    const present = await env.PUBLIC_BUCKET.head(key);
    if (present) return { bytes: present.size, wrote: false };
    const source = await env.PRIVATE_BUCKET.get(`u/${universeId}/objects/${hash}`);
    if (!source) throw new Error('Missing object.');
    const body = await source.arrayBuffer();
    await env.PUBLIC_BUCKET.put(key, body, {
        httpMetadata: { contentType: source.httpMetadata?.contentType || 'application/json' },
    });
    return { bytes: body.byteLength, wrote: true };
}

async function putAddressed(bucket: R2Bucket, hash: string, text: string): Promise<void> {
    const key = `objects/${hash}`;
    if (await bucket.head(key)) return;
    await bucket.put(key, text, { httpMetadata: { contentType: 'application/json' } });
}

async function finishStored(env: Env, packageId: string, version: number, text: string): Promise<void> {
    const parsed = PackageManifest.parse(JSON.parse(text));
    const manifestHash = await sha256Hex(text);
    const contentHash = parsed.records.contentHash;
    const recordsObject = await env.PUBLIC_BUCKET.head(`objects/${contentHash}`);
    const bytes = new TextEncoder().encode(text).byteLength + (recordsObject?.size ?? 0);
    await markDone(env, packageId, version, manifestHash, contentHash, bytes);
}

async function markDone(env: Env, packageId: string, version: number, manifestHash: string, contentHash: string, bytes: number): Promise<void> {
    const written = await env.DB.prepare(
        `UPDATE package_versions
         SET state = 'done', error = NULL, manifest_hash = ?, content_hash = ?, bytes = ?
         WHERE package_id = ? AND version = ? AND state != 'done'`,
    ).bind(manifestHash, contentHash, bytes, packageId, version).run();
    if ((written.meta?.changes ?? 0) < 1) return;
    await env.DB.prepare(
        `UPDATE packages SET latest_version = ?, updated_at = ? WHERE id = ? AND latest_version < ?`,
    ).bind(version, new Date().toISOString(), packageId, version).run();
}

export async function markPublishFailed(env: Env, packageId: string, version: number, err: unknown): Promise<void> {
    await env.DB.prepare(
        `UPDATE package_versions SET state = 'failed', error = ? WHERE package_id = ? AND version = ? AND state != 'done'`,
    ).bind(messageOf(err), packageId, version).run();
}

export async function runPublish(env: Env, message: { packageId: string; version: number; universeId: string }): Promise<void> {
    const versionRow = await env.DB.prepare(
        `SELECT state, hex_keys AS hexKeys, record_ids AS recordIds
         FROM package_versions WHERE package_id = ? AND version = ?`,
    ).bind(message.packageId, message.version).first<VersionRow>();
    if (!versionRow) throw new Error('No such version.');
    if (versionRow.state === 'done') return;
    await env.DB.prepare(
        `UPDATE package_versions SET state = 'running', error = NULL WHERE package_id = ? AND version = ? AND state != 'done'`,
    ).bind(message.packageId, message.version).run();

    const manifestKey = `packages/${message.packageId}/${message.version}/manifest.json`;
    const storedManifest = await env.PUBLIC_BUCKET.get(manifestKey);
    if (storedManifest) {
        await finishStored(env, message.packageId, message.version, await storedManifest.text());
        return;
    }

    const pkg = await env.DB.prepare(
        `SELECT kind, title, edition, author_id AS authorId, universe_id AS universeId FROM packages WHERE id = ?`,
    ).bind(message.packageId).first<PackageRow>();
    if (!pkg) throw new Error('No such package.');
    const universe = await env.DB.prepare(
        `SELECT engine_version AS engineVersion, truth_version AS truthVersion, deleted_at AS deletedAt
         FROM universes WHERE id = ?`,
    ).bind(pkg.universeId).first<UniverseRow>();
    if (!universe || universe.deletedAt) throw new Error('No such universe.');
    if (!universe.truthVersion) throw new Error('This universe is not on a published chart.');

    const profile = await env.DB.prepare(
        `SELECT handle FROM profile WHERE user_id = ?`,
    ).bind(pkg.authorId).first<{ handle: string }>();
    if (!profile?.handle) throw new Error('No author handle.');
    const author = { handle: profile.handle };
    const hexKeys = JSON.parse(versionRow.hexKeys) as string[];
    const recordIds = JSON.parse(versionRow.recordIds) as string[];
    const resolved = await resolvePublish(env, pkg.universeId, universe.truthVersion, hexKeys, recordIds);

    for (const hash of unique(resolved.treeHashes)) await copyObject(env, pkg.universeId, hash);
    let imageBytes = 0;
    const imageHashes = unique(resolved.imageHashes);
    for (const hash of imageHashes) {
        const copied = await copyObject(env, pkg.universeId, hash);
        if (copied.wrote) imageBytes += copied.bytes;
    }

    const recordsText = stable(resolved.records);
    const contentHash = await sha256Hex(recordsText);
    await putAddressed(env.PUBLIC_BUCKET, contentHash, recordsText);
    const emptyList = await sha256Hex(stable([]));
    const manifest = PackageManifest.parse({
        format: 'voyage-package',
        schemaVersion: 1,
        packageId: message.packageId,
        version: message.version,
        kind: pkg.kind,
        title: pkg.title,
        author: { id: pkg.authorId, handle: author.handle },
        edition: pkg.edition,
        engineVersion: universe.engineVersion,
        truthVersion: universe.truthVersion,
        hexes: resolved.hexes,
        lists: { routes: emptyList, borderPaths: emptyList },
        records: { contentHash, count: resolved.records.length, imageHashes },
        publishedAt: new Date().toISOString(),
    });
    const manifestText = stable(manifest);
    await env.PUBLIC_BUCKET.put(manifestKey, manifestText, { httpMetadata: { contentType: 'application/json' } });
    const bytes = new TextEncoder().encode(manifestText).byteLength + new TextEncoder().encode(recordsText).byteLength + imageBytes;
    await markDone(env, message.packageId, message.version, await sha256Hex(manifestText), contentHash, bytes);
}

export async function publishConsumer(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
        const body = message.body as PublishMessage;
        if (!body || body.kind !== 'publish' || typeof body.packageId !== 'string' || typeof body.version !== 'number' || typeof body.universeId !== 'string') {
            message.ack();
            continue;
        }
        try {
            await runPublish(env, { packageId: body.packageId, version: body.version, universeId: body.universeId });
            message.ack();
        } catch (err) {
            console.log(JSON.stringify({ job: 'publish', packageId: body.packageId, version: body.version, error: String(err) }));
            await markPublishFailed(env, body.packageId, body.version, err);
            message.retry();
        }
    }
}
