/**
 * Package covers (contracts/b_marketplace.md F17). The order is the publisher's upload, then
 * record art (the first image of the first record that has one, in the latest done version),
 * then nothing; the browser shows the default for the kind. The server never names a default.
 * Until 0019 is applied every cover is null and an upload is refused.
 */
import type { Hono } from 'hono';
import { PackageCover } from '@voyage/shared';
import { originAllowed, requireUser } from '../auth/session';
import type { AppEnv, Env } from '../env';
import { fail, ok } from '../http';
import { coversReady, fillArt } from '../jobs/publish_queue';

export { coversReady, fillArt, recordArt, storeArt } from '../jobs/publish_queue';

type Ctx = Parameters<typeof fail>[0];

const HASH = /^[0-9a-f]{64}$/;
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_MAX_SIDE = 1600;
export const THUMB_MAX_BYTES = 200 * 1024;
export const THUMB_MAX_SIDE = 640;
/** Room for the form's own framing on top of the two images. */
const FORM_SLACK = 64 * 1024;

export const COVER_REFUSALS = {
    unavailable: 'Covers are not available yet.',
    hidden: 'A hidden package cannot change its cover.',
    form: 'The cover could not be read. Choose the image again.',
    hash: 'That image could not be checked. Choose the file again.',
    imageBytes: 'A cover is at most 2 MB.',
    thumbBytes: 'A cover thumbnail is at most 200 KB.',
    imageType: 'A cover is a WebP image.',
    thumbType: 'A cover thumbnail is a WebP image.',
    imageSide: 'A cover is at most 1600 px on its long side.',
    thumbSide: 'A cover thumbnail is at most 640 px on its long side.',
    imageHash: 'The hash does not match the cover.',
    thumbHash: 'The thumbnail does not match. Choose the image again.',
} as const;

async function fillUnfilled(env: Env): Promise<void> {
    const rows = await env.DB.prepare(`SELECT package_id AS packageId, version FROM package_versions WHERE state = 'done' AND art_filled = 0`)
        .all<{ packageId: string; version: number }>();
    for (const row of rows.results ?? []) await fillArt(env, row.packageId, Number(row.version));
}

/**
 * Whether anything but `packageId`'s own upload still names the public object: another
 * package's upload, or an image of any record in any done version (this package's too).
 * Read from D1: `packages.cover_*` and `package_versions.image_hashes`, filled first where missing.
 */
export async function objectNamed(env: Env, hash: string, packageId: string): Promise<boolean> {
    const cover = await env.DB.prepare(`SELECT 1 AS n FROM packages WHERE id != ? AND (cover_hash = ? OR cover_thumb_hash = ?) LIMIT 1`)
        .bind(packageId, hash, hash).first();
    if (cover) return true;
    await fillUnfilled(env);
    const record = await env.DB.prepare(
        `SELECT 1 AS n FROM package_versions WHERE state = 'done' AND image_hashes IS NOT NULL
           AND EXISTS (SELECT 1 FROM json_each(package_versions.image_hashes) WHERE json_each.value = ?) LIMIT 1`,
    ).bind(hash).first();
    return !!record;
}

/** The cover to show. Hidden packages show none to anyone but an admin. */
export async function coverOf(env: Env, packageId: string, latestVersion: number, hidden: boolean, admin: boolean): Promise<PackageCover | null> {
    if (!(await coversReady(env))) return null;
    if (hidden && !admin) return null;
    const pkg = await env.DB.prepare(`SELECT cover_hash AS hash, cover_thumb_hash AS thumbHash FROM packages WHERE id = ?`)
        .bind(packageId).first<{ hash: string | null; thumbHash: string | null }>();
    if (pkg?.hash && pkg.thumbHash) return PackageCover.parse({ hash: pkg.hash, thumbHash: pkg.thumbHash, source: 'upload' });
    if (latestVersion < 1) return null;
    const read = () => env.DB.prepare(
        `SELECT art_hash AS hash, art_thumb_hash AS thumbHash, art_filled AS filled FROM package_versions WHERE package_id = ? AND version = ? AND state = 'done'`,
    ).bind(packageId, latestVersion).first<{ hash: string | null; thumbHash: string | null; filled: number }>();
    let row = await read();
    if (!row) return null;
    if (Number(row.filled) !== 1) {
        await fillArt(env, packageId, latestVersion);
        row = await read();
        if (!row) return null;
    }
    return row.hash && row.thumbHash ? PackageCover.parse({ hash: row.hash, thumbHash: row.thumbHash, source: 'record' }) : null;
}

/** Width and height from a WebP header (VP8, VP8L, or VP8X), or null when it cannot be read. */
export function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
    if (bytes.byteLength < 30) return null;
    const text = new TextDecoder();
    if (text.decode(bytes.subarray(0, 4)) !== 'RIFF' || text.decode(bytes.subarray(8, 12)) !== 'WEBP') return null;
    const chunk = text.decode(bytes.subarray(12, 16));
    const u16 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8);
    const u24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
    if (chunk === 'VP8X') return { width: u24(24) + 1, height: u24(27) + 1 };
    if (chunk === 'VP8L') {
        if (bytes[20] !== 0x2f) return null;
        const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') {
        if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
        return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
    }
    return null;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    let hex = '';
    for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
    return hex;
}

type Part = { bytes: ArrayBuffer; hash: string };

async function checkPart(part: Part, maxBytes: number, maxSide: number, refuse: { bytes: string; type: string; side: string; hash: string }): Promise<string | null> {
    if (!HASH.test(part.hash)) return COVER_REFUSALS.hash;
    if (part.bytes.byteLength > maxBytes) return refuse.bytes;
    const size = webpSize(new Uint8Array(part.bytes));
    if (!size) return refuse.type;
    if (Math.max(size.width, size.height) > maxSide) return refuse.side;
    if (await sha256Hex(part.bytes) !== part.hash) return refuse.hash;
    return null;
}

async function authorPackage(c: Ctx): Promise<Response | { id: string; hidden: boolean; latestVersion: number; hash: string | null; thumbHash: string | null }> {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
    if (!(await coversReady(c.env))) return fail(c, 503, 'unavailable', COVER_REFUSALS.unavailable);
    const row = await c.env.DB.prepare(
        `SELECT id, hidden, latest_version AS latestVersion, cover_hash AS hash, cover_thumb_hash AS thumbHash FROM packages WHERE id = ? AND author_id = ?`,
    ).bind(c.req.param('packageId') ?? '', actor.id).first<{ id: string; hidden: number; latestVersion: number; hash: string | null; thumbHash: string | null }>();
    if (!row) return fail(c, 404, 'not_found', 'No such package.');
    if (Number(row.hidden) === 1) return fail(c, 403, 'forbidden', COVER_REFUSALS.hidden);
    return { ...row, hidden: false, latestVersion: Number(row.latestVersion) };
}

/** Deletes each old public object nothing else names. */
async function dropOld(env: Env, packageId: string, old: (string | null)[], keep: string[]): Promise<void> {
    for (const hash of new Set(old)) {
        if (!hash || keep.includes(hash)) continue;
        if (await objectNamed(env, hash, packageId)) continue;
        await env.PUBLIC_BUCKET.delete(`objects/${hash}`);
    }
}

async function fileOf(form: FormData, name: string): Promise<ArrayBuffer | null> {
    const value = form.get(name) as unknown;
    if (!value || typeof value === 'string' || typeof (value as Blob).arrayBuffer !== 'function') return null;
    return (value as Blob).arrayBuffer();
}

export function mountCoverRoutes(route: Hono<AppEnv>): void {
    route.put('/:packageId/cover', async (c) => {
        const pkg = await authorPackage(c);
        if (pkg instanceof Response) return pkg;
        const claimed = Number(c.req.header('content-length'));
        if (Number.isFinite(claimed) && claimed > COVER_MAX_BYTES + THUMB_MAX_BYTES + FORM_SLACK) {
            return fail(c, 400, 'too_large', COVER_REFUSALS.imageBytes);
        }
        let form: FormData;
        try {
            form = await c.req.formData();
        } catch {
            return fail(c, 400, 'validation', COVER_REFUSALS.form);
        }
        const image = await fileOf(form, 'image');
        const thumb = await fileOf(form, 'thumb');
        const hash = form.get('hash');
        const thumbHash = form.get('thumbHash');
        if (!image || !thumb || typeof hash !== 'string' || typeof thumbHash !== 'string') {
            return fail(c, 400, 'validation', COVER_REFUSALS.form);
        }
        const imageRefusal = await checkPart({ bytes: image, hash }, COVER_MAX_BYTES, COVER_MAX_SIDE, {
            bytes: COVER_REFUSALS.imageBytes, type: COVER_REFUSALS.imageType, side: COVER_REFUSALS.imageSide, hash: COVER_REFUSALS.imageHash,
        });
        if (imageRefusal) return fail(c, 400, imageRefusal === COVER_REFUSALS.imageBytes ? 'too_large' : 'validation', imageRefusal);
        const thumbRefusal = await checkPart({ bytes: thumb, hash: thumbHash }, THUMB_MAX_BYTES, THUMB_MAX_SIDE, {
            bytes: COVER_REFUSALS.thumbBytes, type: COVER_REFUSALS.thumbType, side: COVER_REFUSALS.thumbSide, hash: COVER_REFUSALS.thumbHash,
        });
        if (thumbRefusal) return fail(c, 400, thumbRefusal === COVER_REFUSALS.thumbBytes ? 'too_large' : 'validation', thumbRefusal);
        for (const [key, body] of [[hash, image], [thumbHash, thumb]] as const) {
            if (await c.env.PUBLIC_BUCKET.head(`objects/${key}`)) continue;
            await c.env.PUBLIC_BUCKET.put(`objects/${key}`, body, { httpMetadata: { contentType: 'image/webp' } });
        }
        await c.env.DB.prepare(`UPDATE packages SET cover_hash = ?, cover_thumb_hash = ? WHERE id = ?`).bind(hash, thumbHash, pkg.id).run();
        await dropOld(c.env, pkg.id, [pkg.hash, pkg.thumbHash], [hash, thumbHash]);
        return ok(c, { cover: PackageCover.parse({ hash, thumbHash, source: 'upload' }) });
    });

    route.delete('/:packageId/cover', async (c) => {
        const pkg = await authorPackage(c);
        if (pkg instanceof Response) return pkg;
        await c.env.DB.prepare(`UPDATE packages SET cover_hash = NULL, cover_thumb_hash = NULL WHERE id = ?`).bind(pkg.id).run();
        await dropOld(c.env, pkg.id, [pkg.hash, pkg.thumbHash], []);
        return ok(c, { cover: await coverOf(c.env, pkg.id, pkg.latestVersion, false, false) });
    });
}

function heldCover(packageId: string, hash: string): string {
    return `takedown/covers/${packageId}/${hash}`;
}

/**
 * Takedown: the uploaded pair is copied into the private bucket and taken off the public one,
 * unless another package's upload or a published record still names that object. Record art stays.
 */
export async function takeDownCover(env: Env, packageId: string): Promise<string[]> {
    if (!(await coversReady(env))) return [];
    const row = await env.DB.prepare(`SELECT cover_hash AS hash, cover_thumb_hash AS thumbHash FROM packages WHERE id = ?`)
        .bind(packageId).first<{ hash: string | null; thumbHash: string | null }>();
    const moved: string[] = [];
    for (const hash of new Set([row?.hash, row?.thumbHash])) {
        if (!hash) continue;
        const object = await env.PUBLIC_BUCKET.get(`objects/${hash}`);
        if (!object) continue;
        await env.PRIVATE_BUCKET.put(heldCover(packageId, hash), await object.arrayBuffer(), { httpMetadata: { contentType: 'image/webp' } });
        if (!(await objectNamed(env, hash, packageId))) await env.PUBLIC_BUCKET.delete(`objects/${hash}`);
        moved.push(hash);
    }
    return moved;
}

/** Restore puts each held cover object back on the public bucket. */
export async function restoreCover(env: Env, packageId: string): Promise<string[]> {
    if (!(await coversReady(env))) return [];
    const row = await env.DB.prepare(`SELECT cover_hash AS hash, cover_thumb_hash AS thumbHash FROM packages WHERE id = ?`)
        .bind(packageId).first<{ hash: string | null; thumbHash: string | null }>();
    const back: string[] = [];
    for (const hash of new Set([row?.hash, row?.thumbHash])) {
        if (!hash) continue;
        const held = await env.PRIVATE_BUCKET.get(heldCover(packageId, hash));
        if (!held) continue;
        if (!(await env.PUBLIC_BUCKET.head(`objects/${hash}`))) {
            await env.PUBLIC_BUCKET.put(`objects/${hash}`, await held.arrayBuffer(), { httpMetadata: { contentType: 'image/webp' } });
        }
        await env.PRIVATE_BUCKET.delete(heldCover(packageId, hash));
        back.push(hash);
    }
    return back;
}
