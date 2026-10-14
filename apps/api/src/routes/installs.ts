/**
 * Import a package into a campaign in place (contracts/b_marketplace.md F3, F4).
 * Mounted under /api/universes. Placement is phase 3: a body or query that names one is refused.
 */
import { Hono } from 'hono';
import { InstallList, InstallPreview, InstallRequest, InstallResult, PackageManifest, type PackageManifest as Manifest } from '@voyage/shared';
import { ulid } from '../auth/session';
import type { AppEnv, Env } from '../env';
import { fail, ok } from '../http';
import { chargeObjectBytes } from '../jobs/object_charge';
import { chartHex } from '../jobs/publish_queue';
import { ownSectorKey } from '../universe/hexes';
import { ownedUniverse, type OwnedUniverse } from '../universe/forward';
import type { InstallHexInput, InstallRecordInput, PreviewHex, PreviewRecords } from '../universe/install';

/** The same number as `OBJECT_QUOTA_BYTES` in jobs/generate_queue.ts. */
const QUOTA_BYTES = 250 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;

type Ctx = Parameters<typeof fail>[0];

type Loaded = {
    packageId: string;
    version: number;
    title: string;
    sourceUniverseId: string;
    manifest: Manifest;
    hexes: InstallHexInput[];
    records: InstallRecordInput[];
};

type Previewed = Loaded & { hexes: InstallHexInput[]; preview: { hexes: PreviewHex[]; records: PreviewRecords }; missing: string[]; bytes: number };

class Stop {
    constructor(readonly response: Response) {}
}

export const installsRoute = new Hono<AppEnv>();

async function installsReady(env: Env): Promise<boolean> {
    const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'package_installs'`).first<{ name: string }>();
    return row?.name === 'package_installs';
}

function unavailable(c: Ctx): Response {
    return fail(c, 503, 'unavailable', 'The marketplace is being updated. Try again soon.');
}

async function load(c: Ctx, owned: OwnedUniverse, packageId: string, version: number): Promise<Loaded> {
    const pkg = await c.env.DB.prepare(
        `SELECT id, author_id AS authorId, universe_id AS universeId, title, edition, hidden, latest_version AS latestVersion
         FROM packages WHERE id = ?`,
    ).bind(packageId).first<{ id: string; authorId: string; universeId: string; title: string; edition: string; hidden: number; latestVersion: number }>();
    const author = !!pkg && pkg.authorId === owned.actor.id;
    if (!pkg || (!author && (Number(pkg.hidden) === 1 || pkg.latestVersion < 1))) {
        throw new Stop(fail(c, 404, 'not_found', 'No such package.'));
    }
    const row = await c.env.DB.prepare(`SELECT state FROM package_versions WHERE package_id = ? AND version = ?`)
        .bind(pkg.id, version).first<{ state: string }>();
    if (!row || row.state !== 'done') throw new Stop(fail(c, 404, 'not_found', 'No such version.'));
    if (pkg.edition !== owned.row.editionDefault) {
        throw new Stop(fail(c, 400, 'validation', 'This package is for a different edition.'));
    }
    const object = await c.env.PUBLIC_BUCKET.get(`packages/${pkg.id}/${version}/manifest.json`);
    if (!object) throw new Stop(fail(c, 404, 'not_found', 'No such version.'));
    const manifest = PackageManifest.parse(JSON.parse(await object.text()));
    const truth = owned.row.truthVersion;
    const cache = new Map<string, Record<string, unknown> | null>();
    const hexes: InstallHexInput[] = [];
    for (const [hexKey, hex] of Object.entries(manifest.hexes)) {
        const chart = truth && !ownSectorKey(hexKey) ? await chartHex(c.env, truth, hexKey, cache) : null;
        hexes.push({
            hexKey,
            baseHash: hex.baseHash ?? null,
            treeHash: hex.treeHash ?? null,
            summary: hex.summary ?? null,
            deleted: hex.deleted === true,
            chart,
        });
    }
    const records: InstallRecordInput[] = [];
    if (manifest.records.count > 0) {
        const stored = await c.env.PUBLIC_BUCKET.get(`objects/${manifest.records.contentHash}`);
        if (!stored) throw new Error('Missing object.');
        const list = JSON.parse(await stored.text()) as unknown;
        for (const item of Array.isArray(list) ? list : []) {
            if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
                records.push({ id: (item as { id: string }).id, record: item as Record<string, unknown> });
            }
        }
    }
    return { packageId: pkg.id, version, title: pkg.title, sourceUniverseId: pkg.universeId, manifest, hexes, records };
}

async function doCall<T>(owned: OwnedUniverse, c: Ctx, pathname: string, body: unknown): Promise<{ status: number; parsed: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } }> {
    const url = new URL(c.req.url);
    url.pathname = pathname;
    url.search = '';
    const response = await owned.forward(new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    }));
    return { status: response.status, parsed: await response.json() };
}

/** Object hashes this universe does not hold yet, and their bytes. */
async function missingObjects(env: Env, universeId: string, loaded: Loaded): Promise<{ missing: string[]; bytes: number }> {
    const wanted = new Set<string>();
    for (const hex of loaded.hexes) if (!hex.deleted && hex.treeHash && HASH.test(hex.treeHash)) wanted.add(hex.treeHash);
    for (const hash of loaded.manifest.records.imageHashes) if (HASH.test(hash)) wanted.add(hash);
    const missing: string[] = [];
    let bytes = 0;
    for (const hash of wanted) {
        if (await env.PRIVATE_BUCKET.head(`u/${universeId}/objects/${hash}`)) continue;
        const pub = await env.PUBLIC_BUCKET.head(`objects/${hash}`);
        if (!pub) throw new Error('Missing object.');
        missing.push(hash);
        bytes += pub.size;
    }
    return { missing, bytes };
}

async function previewOf(c: Ctx, owned: OwnedUniverse, packageId: string, version: number): Promise<Previewed> {
    const loaded = await load(c, owned, packageId, version);
    const called = await doCall<{ hexes: PreviewHex[]; records: PreviewRecords }>(owned, c, '/install/preview', {
        packageId: loaded.packageId,
        sourceUniverseId: loaded.sourceUniverseId,
        hexes: loaded.hexes,
        recordIds: loaded.records.map((item) => item.id),
    });
    if (!called.parsed.ok || !called.parsed.data) throw new Error(called.parsed.error?.message || 'Install preview failed.');
    const objects = await missingObjects(c.env, owned.row.id, loaded);
    return { ...loaded, preview: called.parsed.data, missing: objects.missing, bytes: objects.bytes };
}

function answerOf(p: Previewed): InstallPreview {
    const conflicts = p.preview.hexes.filter((hex) => hex.outcome === 'conflict').length + p.preview.records.conflicts.length;
    return InstallPreview.parse({
        packageId: p.packageId,
        version: p.version,
        placement: null,
        hexes: p.preview.hexes,
        records: { add: p.preview.records.add.length, replace: p.preview.records.replace.length, conflicts: p.preview.records.conflicts },
        bytes: p.bytes,
        conflicts,
    });
}

function versionOf(value: string | undefined): number | null {
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
}

async function overQuota(env: Env, universeId: string, bytes: number): Promise<boolean> {
    if (bytes <= 0) return false;
    const row = await env.DB.prepare(`SELECT object_bytes AS objectBytes FROM universes WHERE id = ?`).bind(universeId).first<{ objectBytes: number }>();
    return (row?.objectBytes ?? 0) + bytes > QUOTA_BYTES;
}

installsRoute.get('/:id/install/preview', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    if (!(await installsReady(c.env))) return unavailable(c);
    const url = new URL(c.req.url);
    if (url.searchParams.has('placement')) return fail(c, 400, 'validation', 'Invalid request.');
    const packageId = url.searchParams.get('packageId') ?? '';
    const version = versionOf(url.searchParams.get('version') ?? undefined);
    if (!packageId || version == null) return fail(c, 400, 'validation', 'Invalid request.');
    try {
        const previewed = await previewOf(c, owned, packageId, version);
        if (await overQuota(c.env, owned.row.id, previewed.bytes)) return fail(c, 400, 'too_large', 'This universe is out of space.');
        return ok(c, answerOf(previewed));
    } catch (err) {
        if (err instanceof Stop) return err.response;
        throw err;
    }
});

installsRoute.post('/:id/install', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    if (!(await installsReady(c.env))) return unavailable(c);
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'Invalid JSON.');
    }
    const parsed = InstallRequest.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const input = parsed.data;
    let previewed: Previewed;
    try {
        previewed = await previewOf(c, owned, input.packageId, input.version);
    } catch (err) {
        if (err instanceof Stop) return err.response;
        throw err;
    }
    const answer = answerOf(previewed);
    if (answer.conflicts !== input.expect.conflicts) return fail(c, 409, 'conflict', 'The map changed. Preview again.');
    const missingHexes = answer.hexes.filter((hex) => hex.outcome === 'conflict' && !input.resolutions[hex.to]).map((hex) => hex.to);
    const missingRecords = answer.records.conflicts.filter((id) => !input.recordResolutions[id]);
    if (missingHexes.length || missingRecords.length) {
        return fail(c, 409, 'conflict', 'Choose theirs or mine for every conflict.', { hexKeys: missingHexes, recordIds: missingRecords });
    }
    if (await overQuota(c.env, owned.row.id, previewed.bytes)) return fail(c, 400, 'too_large', 'This universe is out of space.');
    let copied = 0;
    for (const hash of previewed.missing) {
        const source = await c.env.PUBLIC_BUCKET.get(`objects/${hash}`);
        if (!source) throw new Error('Missing object.');
        const bytes = await source.arrayBuffer();
        await c.env.PRIVATE_BUCKET.put(`u/${owned.row.id}/objects/${hash}`, bytes, {
            httpMetadata: { contentType: source.httpMetadata?.contentType || 'application/json' },
        });
        copied += bytes.byteLength;
    }
    const installId = `in_${ulid()}`;
    const called = await doCall<{ written: number; skipped: number; records: number; snapshotId: string }>(owned, c, '/install', {
        installId,
        packageId: previewed.packageId,
        version: previewed.version,
        title: previewed.title,
        sourceUniverseId: previewed.sourceUniverseId,
        publishedAt: previewed.manifest.publishedAt,
        hexes: previewed.hexes,
        records: previewed.records,
        resolutions: input.resolutions,
        recordResolutions: input.recordResolutions,
    });
    if (!called.parsed.ok || !called.parsed.data) {
        const error = called.parsed.error;
        if (called.status === 409 && error) return fail(c, 409, 'conflict', error.message, error.details);
        if (called.status === 429) return fail(c, 429, 'rate_limited', 'Too many requests.');
        throw new Error(error?.message || 'Install failed.');
    }
    await chargeObjectBytes(c.env.DB, owned.row.id, installId, copied);
    const now = new Date().toISOString();
    const existing = await c.env.DB.prepare(
        `SELECT id FROM package_installs WHERE universe_id = ? AND package_id = ? AND placement IS NULL`,
    ).bind(owned.row.id, previewed.packageId).first<{ id: string }>();
    const hexCount = previewed.hexes.length;
    if (existing) {
        await c.env.DB.prepare(
            `UPDATE package_installs SET version = ?, hex_count = ?, record_count = ?, updated_at = ? WHERE id = ?`,
        ).bind(previewed.version, hexCount, previewed.records.length, now, existing.id).run();
    } else {
        await c.env.DB.batch([
            c.env.DB.prepare(
                `INSERT INTO package_installs (id, universe_id, package_id, version, placement, hex_count, record_count, created_at, updated_at)
                 VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
            ).bind(installId, owned.row.id, previewed.packageId, previewed.version, hexCount, previewed.records.length, now, now),
            c.env.DB.prepare(`UPDATE packages SET installs = installs + 1 WHERE id = ?`).bind(previewed.packageId),
        ]);
    }
    return ok(c, InstallResult.parse({ installId: existing?.id ?? installId, ...called.parsed.data }));
});

installsRoute.get('/:id/installs', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    if (!(await installsReady(c.env))) return unavailable(c);
    const listed = await c.env.DB.prepare(
        `SELECT i.id AS installId, i.package_id AS packageId, p.title AS title, i.version AS version,
                p.latest_version AS latestVersion, p.hidden AS hidden, i.hex_count AS hexCount,
                i.created_at AS installedAt, i.updated_at AS updatedAt
         FROM package_installs i JOIN packages p ON p.id = i.package_id
         WHERE i.universe_id = ? ORDER BY i.updated_at DESC, i.id DESC`,
    ).bind(owned.row.id).all<{
        installId: string; packageId: string; title: string; version: number; latestVersion: number;
        hidden: number; hexCount: number; installedAt: string; updatedAt: string;
    }>();
    const items = (listed.results ?? []).map((row) => {
        const hidden = Number(row.hidden) === 1;
        const latest = hidden ? row.version : row.latestVersion;
        return {
            installId: row.installId,
            packageId: row.packageId,
            title: row.title,
            version: row.version,
            latestVersion: latest,
            updateAvailable: !hidden && latest > row.version,
            placement: null,
            hexCount: row.hexCount,
            installedAt: row.installedAt,
            updatedAt: row.updatedAt,
        };
    });
    return ok(c, InstallList.parse({ items }));
});