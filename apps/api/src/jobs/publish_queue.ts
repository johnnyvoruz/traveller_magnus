import { PackageHex, PackageManifest, sha256Hex, stable, type PackageHex as HexRow } from '@voyage/shared';
import type { Env } from '../env';
import { chartTree, ownSectorKey, sectorOf } from '../universe/hexes.ts';
import type { PublishSources } from '../universe/publish_read.ts';

const HASH = /^[0-9a-f]{64}$/;

// F17. Cover art, kept here so the job and its node tests need no route module.
let ready = false;

/** 0019 probe. A yes is kept for the isolate; a no is asked again, so applying the migration needs no restart. */
export async function coversReady(env: Env): Promise<boolean> {
    if (ready) return true;
    try {
        const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('packages') WHERE name = 'cover_hash'`).first<{ n: number }>();
        ready = Number(row?.n ?? 0) > 0;
    } catch {
        // A database that cannot answer the probe has no covers.
        ready = false;
    }
    return ready;
}

export type ArtPair = { hash: string; thumbHash: string };

/** The first image of the first record that has one, in record order. */
export function recordArt(records: unknown[]): ArtPair | null {
    for (const record of records) {
        if (!record || typeof record !== 'object') continue;
        const images = (record as { images?: unknown }).images;
        if (!Array.isArray(images) || images.length === 0) continue;
        const first = images[0] as { hash?: unknown; thumbHash?: unknown } | null;
        if (first && typeof first.hash === 'string' && HASH.test(first.hash) && typeof first.thumbHash === 'string' && HASH.test(first.thumbHash)) {
            return { hash: first.hash, thumbHash: first.thumbHash };
        }
    }
    return null;
}

/** Written by the publish job, and by `fillArt` for a version published before 0019. */
export async function storeArt(env: Env, packageId: string, version: number, art: ArtPair | null, imageHashes: string[]): Promise<void> {
    if (!(await coversReady(env))) return;
    await env.DB.prepare(
        `UPDATE package_versions SET art_hash = ?, art_thumb_hash = ?, image_hashes = ?, art_filled = 1 WHERE package_id = ? AND version = ?`,
    ).bind(art?.hash ?? null, art?.thumbHash ?? null, JSON.stringify(imageHashes), packageId, version).run();
}

/**
 * The backfill: a done version published before 0019 gets its record art and image hashes
 * from its manifest once, on first read. A taken-down version is read from where takedown keeps it.
 */
export async function fillArt(env: Env, packageId: string, version: number): Promise<void> {
    const object = await env.PUBLIC_BUCKET.get(`packages/${packageId}/${version}/manifest.json`)
        ?? await env.PRIVATE_BUCKET.get(`takedown/packages/${packageId}/${version}/manifest.json`);
    if (!object) return;
    const parsed = PackageManifest.safeParse(JSON.parse(await object.text()));
    if (!parsed.success) return;
    const records = await env.PUBLIC_BUCKET.get(`objects/${parsed.data.records.contentHash}`);
    let list: unknown[] = [];
    if (records) {
        const value = JSON.parse(await records.text()) as unknown;
        if (Array.isArray(value)) list = value;
    }
    await storeArt(env, packageId, version, recordArt(list), parsed.data.records.imageHashes);
}

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

const EMPTY_SLOT = /^~slot_-?\d+_-?\d+$/;

/**
 * F15. The slot of every own sector the piece's hexes sit in, read from the source universe's
 * object at publish time. A sector it cannot find is left out; the install then refuses it.
 */
async function ownSectorSlots(env: Env, universeId: string, hexKeys: string[]): Promise<Record<string, { x: number; y: number }>> {
    const wanted = new Set(hexKeys.filter(ownSectorKey).map((key) => sectorOf(key).sector).filter((slug) => !EMPTY_SLOT.test(slug)));
    const out: Record<string, { x: number; y: number }> = {};
    if (!wanted.size) return out;
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const response = await stub.fetch(new Request('https://universe.internal/sectors', { headers: { 'x-voyage-universe-id': universeId } }));
    if (!response.ok) return out;
    const parsed = await response.json() as { data?: { items?: unknown }; items?: unknown };
    const items = (parsed.data?.items ?? parsed.items ?? []) as { id?: unknown; slot?: { x?: unknown; y?: unknown } }[];
    for (const item of Array.isArray(items) ? items : []) {
        if (typeof item.id !== 'string' || !wanted.has(item.id)) continue;
        if (typeof item.slot?.x === 'number' && typeof item.slot?.y === 'number') out[item.id] = { x: item.slot.x, y: item.slot.y };
    }
    return out;
}

/**
 * F16. The live links of the source campaign whose two ends are both published records,
 * read page by page from the universe's object, sorted by id.
 */
async function publishedLinks(env: Env, universeId: string, recordIds: string[]): Promise<Record<string, unknown>[]> {
    const ends = new Set(recordIds);
    if (ends.size < 2) return [];
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const out: Record<string, unknown>[] = [];
    let after = 0;
    for (let page = 0; page < 1000; page += 1) {
        const response = await stub.fetch(new Request(`https://universe.internal/campaign?after=${after}&limit=1000`, { headers: { 'x-voyage-universe-id': universeId } }));
        const parsed = await response.json() as { data?: { links?: Record<string, unknown>[]; seq?: number; done?: boolean } };
        if (!response.ok || !parsed.data) throw new Error('Publish read failed.');
        for (const link of parsed.data.links ?? []) {
            if (link.deleted === true || typeof link.from !== 'string' || typeof link.to !== 'string') continue;
            if (ends.has(link.from) && ends.has(link.to)) out.push(link);
        }
        if (parsed.data.done !== false || typeof parsed.data.seq !== 'number' || parsed.data.seq <= after) break;
        after = parsed.data.seq;
    }
    const byId = new Map(out.map((link) => [String(link.id), link]));
    return [...byId.keys()].sort().map((id) => byId.get(id)!);
}

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

export async function chartHex(env: Env, version: string, hexKey: string, cache: Map<string, Record<string, unknown> | null>): Promise<unknown> {
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

function withSurfaces(hex: Record<string, unknown>, surfaces: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!surfaces || Object.keys(surfaces).length === 0) return hex;
    return { ...hex, surfaces };
}

function oneHex(source: PublishSources['hexes'][number], chart: unknown): { hex: HexRow; tree: string | null } {
    const surfaces = source.surfaces;
    if (source.found && source.deleted) {
        return {
            hex: PackageHex.parse(withSurfaces({
                baseHash: ownSectorKey(source.hexKey) ? null : source.baseHash,
                deleted: true,
            }, surfaces)),
            tree: null,
        };
    }
    if (source.found) {
        const summary = asSummary(source.summary);
        const hex: Record<string, unknown> = { baseHash: ownSectorKey(source.hexKey) ? null : source.baseHash };
        if (source.treeHash) hex.treeHash = source.treeHash;
        if (summary) hex.summary = summary;
        return { hex: PackageHex.parse(withSurfaces(hex, surfaces)), tree: source.treeHash };
    }
    if (chart && typeof chart === 'object') {
        const tree = chartTree(chart);
        const summary = asSummary(chart);
        const hex: Record<string, unknown> = { baseHash: tree };
        if (tree) hex.treeHash = tree;
        if (summary) hex.summary = summary;
        return { hex: PackageHex.parse(withSurfaces(hex, surfaces)), tree };
    }
    throw new PublishRefusal('A hex is not in this universe.', { hexKey: source.hexKey });
}

/** The hex object a package stores. Paint rides along. A hex with no row and no chart is still refused. */
export function publishedHex(source: PublishSources['hexes'][number], chart: unknown): HexRow {
    return oneHex(source, chart).hex;
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

/** Reads the named hexes and records. An own map (null truth) has no chart fallback. Throws `PublishRefusal` when one is not in the universe. */
export async function resolvePublish(env: Env, universeId: string, truthVersion: string | null, hexKeys: string[], recordIds: string[]): Promise<ResolvedPublish> {
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
        const chart = source.found || truthVersion == null ? null : await chartHex(env, truthVersion, source.hexKey, cache);
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
    await fillArt(env, packageId, version);
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

    const ownSectors = await ownSectorSlots(env, pkg.universeId, Object.keys(resolved.hexes));
    const recordsText = stable(resolved.records);
    const contentHash = await sha256Hex(recordsText);
    await putAddressed(env.PUBLIC_BUCKET, contentHash, recordsText);
    const links = await publishedLinks(env, pkg.universeId, recordIds);
    const linksText = links.length ? stable(links) : '';
    const linksHash = links.length ? await sha256Hex(linksText) : '';
    if (links.length) await putAddressed(env.PUBLIC_BUCKET, linksHash, linksText);
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
        ...(Object.keys(ownSectors).length ? { ownSectors } : {}),
        lists: { routes: emptyList, borderPaths: emptyList },
        records: {
            contentHash,
            count: resolved.records.length,
            imageHashes,
            ...(links.length ? { links: { contentHash: linksHash, count: links.length } } : {}),
        },
        publishedAt: new Date().toISOString(),
    });
    const manifestText = stable(manifest);
    await env.PUBLIC_BUCKET.put(manifestKey, manifestText, { httpMetadata: { contentType: 'application/json' } });
    // F17. The record-art pair is worked out here, so the catalogue never opens a manifest.
    await storeArt(env, message.packageId, message.version, recordArt(resolved.records), imageHashes);
    const bytes = new TextEncoder().encode(manifestText).byteLength + new TextEncoder().encode(recordsText).byteLength + new TextEncoder().encode(linksText).byteLength + imageBytes;
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
