/**
 * Import a package into a campaign, in place or at a placement, and remove an import
 * (contracts/b_marketplace.md F3, F4, F12, F13, F14). One import per package per
 * campaign. Mounted under /api/universes.
 */
import { Hono } from 'hono';
import {
    InstallList,
    InstallPreview,
    InstallRequest,
    InstallRemoved,
    InstallResult,
    PackageManifest,
    PlaceError,
    Placement,
    placeCells,
    placeKeys,
    placeRecord,
    placeSummary,
    placeTree,
    sha256Hex,
    stable,
    type PackageManifest as Manifest,
    type Placement as PlacementShape,
} from '@voyage/shared';
import { ulid } from '../auth/session';
import type { AppEnv, Env } from '../env';
import { fail, ok } from '../http';
import { chargeObjectBytes } from '../jobs/object_charge';
import { chartHex } from '../jobs/publish_queue';
import { defaultPin } from '../universe/defaults';
import { ownSectorKey, type Pin } from '../universe/hexes';
import { ownedUniverse, type OwnedUniverse } from '../universe/forward';
import type { InstallHexInput, InstallRecordInput, PreviewHex, PreviewRecords } from '../universe/install';

/** The same number as `OBJECT_QUOTA_BYTES` in jobs/generate_queue.ts. */
const QUOTA_BYTES = 250 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;

type Ctx = Parameters<typeof fail>[0];

type SectorPlan = { id: string; slot: { x: number; y: number }; name: string };

type Loaded = {
    /** The package_installs row an update or a placed re-import writes, or null for a new row. */
    rowId: string | null;
    prevVersion: number | null;
    placement: PlacementShape | null;
    sectors: SectorPlan[];
    /** Placed trees: new hash to its text, written to private storage on install. */
    placedTrees: Map<string, string>;
    packageId: string;
    version: number;
    title: string;
    sourceUniverseId: string;
    manifest: Manifest;
    hexes: InstallHexInput[];
    records: InstallRecordInput[];
    /** F16. The manifest's links, empty for an older manifest. */
    links: Record<string, unknown>[];
};

type Previewed = Loaded & { hexes: InstallHexInput[]; preview: { hexes: PreviewHex[]; records: PreviewRecords }; missing: string[]; placedMissing: string[]; bytes: number };

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

type Slot = { x: number; y: number };

/** Chart sector slots of a truth version, by slug. */
async function chartSlots(env: Env, version: string | null): Promise<Map<string, Slot>> {
    const out = new Map<string, Slot>();
    if (!version) return out;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/manifest.json`);
    if (!object) return out;
    const parsed = JSON.parse(await object.text()) as { sectors?: { slug?: unknown; x?: unknown; y?: unknown }[] };
    for (const sector of parsed.sectors ?? []) {
        if (typeof sector.slug === 'string' && typeof sector.x === 'number' && typeof sector.y === 'number') out.set(sector.slug, { x: sector.x, y: sector.y });
    }
    return out;
}

/** Own sector slots of a universe, by id, read from its Durable Object. */
async function ownSlots(env: Env, universeId: string): Promise<Map<string, Slot>> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const response = await stub.fetch(new Request('https://universe.internal/sectors', { headers: { 'x-voyage-universe-id': universeId } }));
    const out = new Map<string, Slot>();
    if (!response.ok) return out;
    const parsed = await response.json() as { data?: { items?: unknown }; items?: unknown };
    const items = (parsed.data?.items ?? parsed.items ?? []) as { id?: unknown; slot?: { x?: unknown; y?: unknown } }[];
    for (const item of Array.isArray(items) ? items : []) {
        if (typeof item.id === 'string' && typeof item.slot?.x === 'number' && typeof item.slot?.y === 'number') out.set(item.id, { x: item.slot.x, y: item.slot.y });
    }
    return out;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A new own sector id that the preview and the install agree on. */
async function plannedSectorId(seed: string): Promise<string> {
    const hex = await sha256Hex(seed);
    let bits = '';
    for (const ch of hex) bits += parseInt(ch, 16).toString(2).padStart(4, '0');
    let id = '~';
    for (let i = 0; i < 26; i += 1) id += CROCKFORD[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]!;
    return id;
}

const PLACE_MESSAGES: Record<string, string> = {
    key: 'That hex address is not valid.',
    anchor: 'The anchor is not in the package.',
    'unknown sector': 'A sector of the piece is not on the map.',
    outside: 'The piece does not fit on the map.',
};

type Target = { rowId: string | null; prevVersion: number | null; placement: PlacementShape | null };

const ALREADY = 'This campaign already has this package. Remove it first, or take its update.';

/**
 * Which package_installs row this import writes, and where it goes. One import per
 * package per campaign (F14): an update names its row, or, in place, finds it; any
 * other import of a package the campaign holds is 409.
 */
async function targetOf(c: Ctx, owned: OwnedUniverse, packageId: string, placement: PlacementShape | null, installId: string | null): Promise<Target> {
    if (installId) {
        const row = await c.env.DB.prepare(`SELECT id, version, placement FROM package_installs WHERE id = ? AND universe_id = ? AND package_id = ?`)
            .bind(installId, owned.row.id, packageId).first<{ id: string; version: number; placement: string | null }>();
        if (!row) throw new Stop(fail(c, 404, 'not_found', 'No such import.'));
        const stored = row.placement ? Placement.safeParse(JSON.parse(row.placement)) : null;
        return { rowId: row.id, prevVersion: row.version, placement: stored?.success ? stored.data : null };
    }
    const rows = await c.env.DB.prepare(`SELECT id, version, placement FROM package_installs WHERE universe_id = ? AND package_id = ?`)
        .bind(owned.row.id, packageId).all<{ id: string; version: number; placement: string | null }>();
    const held = rows.results ?? [];
    if (!held.length) return { rowId: null, prevVersion: null, placement };
    const inPlace = held.length === 1 && held[0]!.placement === null ? held[0]! : null;
    if (placement || !inPlace) throw new Stop(fail(c, 409, 'conflict', ALREADY));
    return { rowId: inPlace.id, prevVersion: inPlace.version, placement: null };
}

async function load(c: Ctx, owned: OwnedUniverse, packageId: string, version: number, target: Target = { rowId: null, prevVersion: null, placement: null }): Promise<Loaded> {
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
    const links: Record<string, unknown>[] = [];
    if (manifest.records.links && manifest.records.links.count > 0) {
        const stored = await c.env.PUBLIC_BUCKET.get(`objects/${manifest.records.links.contentHash}`);
        if (!stored) throw new Error('Missing object.');
        const list = JSON.parse(await stored.text()) as unknown;
        for (const item of Array.isArray(list) ? list : []) {
            if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') links.push(item as Record<string, unknown>);
        }
    }
    const loaded: Loaded = {
        ...target, sectors: [], placedTrees: new Map(),
        packageId: pkg.id, version, title: pkg.title, sourceUniverseId: pkg.universeId, manifest, hexes, records, links,
    };
    if (target.placement) await place(c, owned, loaded, target.placement, pkg.title);
    return loaded;
}

/** Move every key of the piece to the placement (F5) and rewrite trees, summaries and records. */
async function place(c: Ctx, owned: OwnedUniverse, loaded: Loaded, placement: PlacementShape, title: string): Promise<void> {
    const sourceChart = await chartSlots(c.env, loaded.manifest.truthVersion ?? null);
    // F15: the manifest's own-sector slots first; the source universe's object only for an older manifest.
    const sourceOwn = loaded.manifest.ownSectors
        ? new Map(Object.entries(loaded.manifest.ownSectors))
        : await ownSlots(c.env, loaded.sourceUniverseId);
    const targetChart = await chartSlots(c.env, owned.row.truthVersion);
    const targetOwn = await ownSlots(c.env, owned.row.id);
    const at = (chart: Map<string, Slot>, own: Map<string, Slot>) => (slug: string) => chart.get(slug) ?? own.get(slug) ?? null;
    const keys = loaded.hexes.map((hex) => hex.hexKey);
    let cells;
    try {
        cells = placeCells(keys, placement, at(sourceChart, sourceOwn), at(targetChart, targetOwn));
    } catch (err) {
        if (err instanceof PlaceError) throw new Stop(fail(c, 400, 'validation', PLACE_MESSAGES[err.reason] ?? 'Invalid request.', { reason: err.reason, hexKey: err.hexKey }));
        throw err;
    }
    const bySlot = new Map<string, string>();
    for (const [slug, slot] of [...targetOwn, ...targetChart]) bySlot.set(`${slot.x},${slot.y}`, slug);
    const planned = new Map<string, SectorPlan>();
    const seed = loaded.rowId ?? `${loaded.packageId}|${placement.anchor}|${placement.to}`;
    for (const cell of cells) {
        const slotKey = `${cell.sx},${cell.sy}`;
        if (bySlot.has(slotKey)) continue;
        const id = await plannedSectorId(`${owned.row.id}|${seed}|${slotKey}`);
        bySlot.set(slotKey, id);
        planned.set(slotKey, { id, slot: { x: cell.sx, y: cell.sy }, name: title.slice(0, 80) || 'Imported sector' });
    }
    loaded.sectors = [...planned.values()];
    const newSectors = new Set(loaded.sectors.map((plan) => plan.id));
    const map = placeKeys(cells, (sx, sy) => bySlot.get(`${sx},${sy}`)!);
    const truth = owned.row.truthVersion;
    const cache = new Map<string, Record<string, unknown> | null>();
    for (const hex of loaded.hexes) {
        const to = map.get(hex.hexKey)!;
        let treeHash = hex.treeHash;
        if (!hex.deleted && treeHash && HASH.test(treeHash)) {
            const object = await c.env.PUBLIC_BUCKET.get(`objects/${treeHash}`);
            if (!object) throw new Error('Missing object.');
            const text = stable(placeTree(JSON.parse(await object.text()) as unknown, map));
            treeHash = await sha256Hex(text);
            loaded.placedTrees.set(treeHash, text);
        }
        const summary = hex.summary ? placeSummary(hex.summary, map) : null;
        const entry = summary && (summary.entry && typeof summary.entry === 'object' ? summary.entry : summary) as Record<string, unknown> | null;
        if (entry && 'tree' in entry) entry.tree = hex.deleted ? null : treeHash;
        const sector = to.slice(0, to.indexOf('/'));
        const chart = truth && !ownSectorKey(to) && !newSectors.has(sector) ? await chartHex(c.env, truth, to, cache) : null;
        Object.assign(hex, { from: hex.hexKey, hexKey: to, placed: true, treeHash, summary, chart });
    }
    loaded.records = loaded.records.map((item) => ({ id: item.id, record: placeRecord(item.record, map) }));
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
async function missingObjects(env: Env, universeId: string, loaded: Loaded): Promise<{ missing: string[]; placed: string[]; bytes: number }> {
    const wanted = new Set<string>();
    for (const hex of loaded.hexes) if (!hex.deleted && hex.treeHash && HASH.test(hex.treeHash)) wanted.add(hex.treeHash);
    for (const hash of loaded.manifest.records.imageHashes) if (HASH.test(hash)) wanted.add(hash);
    const missing: string[] = [];
    const placed: string[] = [];
    let bytes = 0;
    for (const hash of wanted) {
        if (await env.PRIVATE_BUCKET.head(`u/${universeId}/objects/${hash}`)) continue;
        const text = loaded.placedTrees.get(hash);
        if (text !== undefined) {
            placed.push(hash);
            bytes += new TextEncoder().encode(text).byteLength;
            continue;
        }
        const pub = await env.PUBLIC_BUCKET.head(`objects/${hash}`);
        if (!pub) throw new Error('Missing object.');
        missing.push(hash);
        bytes += pub.size;
    }
    return { missing, placed, bytes };
}

/** The generation pin the Builder sets (routes/builder.ts pinFor); the same rule, kept here. */
async function pinFor(env: Env, truthVersion: string | null): Promise<Pin> {
    if (!truthVersion) return defaultPin(null);
    const row = await env.DB.prepare(`SELECT seed, settings FROM truth_versions WHERE version = ?`)
        .bind(truthVersion).first<{ seed: string; settings: string }>();
    if (!row) return defaultPin(truthVersion);
    return { seed: row.seed, settings: JSON.parse(row.settings) as Record<string, unknown>, truthVersion };
}

/** A map never opened has no pin; importing into it pins it first, as opening it would. */
async function ensurePinned(c: Ctx, owned: OwnedUniverse): Promise<void> {
    const response = await owned.forward(new Request('https://universe.internal/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(await pinFor(c.env, owned.row.truthVersion)),
    }));
    if (!response.ok) throw new Error('Pin failed.');
}

async function previewOf(c: Ctx, owned: OwnedUniverse, packageId: string, version: number, target?: Target): Promise<Previewed> {
    await ensurePinned(c, owned);
    const loaded = await load(c, owned, packageId, version, target);
    const called = await doCall<{ hexes: PreviewHex[]; records: PreviewRecords }>(owned, c, '/install/preview', {
        packageId: loaded.packageId,
        sourceUniverseId: loaded.sourceUniverseId,
        hexes: loaded.hexes,
        recordIds: loaded.records.map((item) => item.id),
    });
    if (!called.parsed.ok || !called.parsed.data) throw new Error(called.parsed.error?.message || 'Install preview failed.');
    const objects = await missingObjects(c.env, owned.row.id, loaded);
    return { ...loaded, preview: called.parsed.data, missing: objects.missing, placedMissing: objects.placed, bytes: objects.bytes };
}

function answerOf(p: Previewed): InstallPreview {
    const conflicts = p.preview.hexes.filter((hex) => hex.outcome === 'conflict').length + p.preview.records.conflicts.length;
    return InstallPreview.parse({
        packageId: p.packageId,
        version: p.version,
        placement: p.placement,
        sectorsCreated: p.sectors,
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
    const anchor = url.searchParams.get('anchor');
    const to = url.searchParams.get('to');
    const installId = url.searchParams.get('installId');
    let placement: PlacementShape | null = null;
    if (anchor !== null || to !== null) {
        const parsedPlacement = Placement.safeParse({ anchor, to });
        if (!parsedPlacement.success) return fail(c, 400, 'validation', 'Invalid request.');
        if (installId) return fail(c, 400, 'validation', 'An update keeps its placement. Leave the anchor out.');
        placement = parsedPlacement.data;
    }
    try {
        const target = await targetOf(c, owned, packageId, placement, installId);
        const previewed = await previewOf(c, owned, packageId, version, target);
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
        const target = await targetOf(c, owned, input.packageId, input.placement ?? null, input.installId ?? null);
        previewed = await previewOf(c, owned, input.packageId, input.version, target);
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
    for (const hash of previewed.placedMissing) {
        const text = previewed.placedTrees.get(hash)!;
        await c.env.PRIVATE_BUCKET.put(`u/${owned.row.id}/objects/${hash}`, text, { httpMetadata: { contentType: 'application/json' } });
        copied += new TextEncoder().encode(text).byteLength;
    }
    // One charge per call; the row id stays the same across updates.
    const chargeId = `in_${ulid()}`;
    const rowId = previewed.rowId ?? `in_${ulid()}`;
    const called = await doCall<{ written: number; skipped: number; records: number; links: number }>(owned, c, '/install', {
        installId: rowId,
        packageId: previewed.packageId,
        version: previewed.version,
        title: previewed.title,
        sourceUniverseId: previewed.sourceUniverseId,
        publishedAt: previewed.manifest.publishedAt,
        hexes: previewed.hexes,
        records: previewed.records,
        links: previewed.links,
        resolutions: input.resolutions,
        recordResolutions: input.recordResolutions,
        sectors: previewed.sectors,
    });
    if (!called.parsed.ok || !called.parsed.data) {
        const error = called.parsed.error;
        if (called.status === 409 && error) return fail(c, 409, 'conflict', error.message, error.details);
        if (called.status === 429) return fail(c, 429, 'rate_limited', 'Too many requests.');
        throw new Error(error?.message || 'Install failed.');
    }
    await chargeObjectBytes(c.env.DB, owned.row.id, chargeId, copied);
    const now = new Date().toISOString();
    const hexCount = previewed.hexes.length;
    if (previewed.rowId) {
        await c.env.DB.prepare(
            `UPDATE package_installs SET version = ?, hex_count = ?, record_count = ?, updated_at = ? WHERE id = ?`,
        ).bind(previewed.version, hexCount, previewed.records.length, now, previewed.rowId).run();
    } else {
        await c.env.DB.batch([
            c.env.DB.prepare(
                `INSERT INTO package_installs (id, universe_id, package_id, version, placement, hex_count, record_count, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(rowId, owned.row.id, previewed.packageId, previewed.version, previewed.placement ? JSON.stringify(previewed.placement) : null, hexCount, previewed.records.length, now, now),
            c.env.DB.prepare(`UPDATE packages SET installs = installs + 1 WHERE id = ?`).bind(previewed.packageId),
        ]);
    }
    return ok(c, InstallResult.parse({ installId: rowId, ...called.parsed.data }));
});

installsRoute.delete('/:id/installs/:installId', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    if (!(await installsReady(c.env))) return unavailable(c);
    const row = await c.env.DB.prepare(`SELECT id, package_id AS packageId FROM package_installs WHERE id = ? AND universe_id = ?`)
        .bind(c.req.param('installId'), owned.row.id).first<{ id: string; packageId: string }>();
    if (!row) return fail(c, 404, 'not_found', 'No such import.');
    const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM package_installs WHERE universe_id = ? AND package_id = ?`)
        .bind(owned.row.id, row.packageId).first<{ n: number }>();
    const called = await doCall<{ hexes: number; records: number; sectors: number }>(owned, c, '/install/remove', {
        installId: row.id,
        packageId: row.packageId,
        sole: Number(count?.n ?? 0) <= 1,
    });
    if (!called.parsed.ok || !called.parsed.data) {
        if (called.status === 429) return fail(c, 429, 'rate_limited', 'Too many requests.');
        throw new Error(called.parsed.error?.message || 'Remove failed.');
    }
    await c.env.DB.prepare(`DELETE FROM package_installs WHERE id = ? AND universe_id = ?`).bind(row.id, owned.row.id).run();
    return ok(c, InstallRemoved.parse(called.parsed.data));
});

installsRoute.get('/:id/installs', async (c) => {
    const owned = await ownedUniverse(c);
    if (owned instanceof Response) return owned;
    if (!(await installsReady(c.env))) return unavailable(c);
    const listed = await c.env.DB.prepare(
        `SELECT i.id AS installId, i.package_id AS packageId, p.title AS title, i.version AS version,
                p.latest_version AS latestVersion, p.hidden AS hidden, i.hex_count AS hexCount, i.record_count AS recordCount,
                i.placement AS placement,
                i.created_at AS installedAt, i.updated_at AS updatedAt
         FROM package_installs i JOIN packages p ON p.id = i.package_id
         WHERE i.universe_id = ? ORDER BY i.updated_at DESC, i.id DESC`,
    ).bind(owned.row.id).all<{
        installId: string; packageId: string; title: string; version: number; latestVersion: number;
        hidden: number; hexCount: number; recordCount: number; placement: string | null; installedAt: string; updatedAt: string;
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
            placement: row.placement ? JSON.parse(row.placement) as unknown : null,
            hexCount: row.hexCount,
            recordCount: row.recordCount,
            installedAt: row.installedAt,
            updatedAt: row.updatedAt,
        };
    });
    return ok(c, InstallList.parse({ items }));
});