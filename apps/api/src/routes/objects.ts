import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Hono } from 'hono';
import { universes } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { memberUniverse, ownedUniverse, type MemberUniverse } from '../universe/forward';
import { cachedHashes, memberReadLimited, storeHashes } from '../universe/player_rate';
import { isQuotaFull, QUOTA_SENTENCE, releaseObjectBytes, reserveObjectBytes } from '../universe/quota';

const HASH = /^[0-9a-f]{64}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function database(env: AppEnv['Bindings']) {
    return drizzle(env.DB, { schema: { universes } });
}

function isWebp(bytes: Uint8Array): boolean {
    if (bytes.byteLength < 12) return false;
    const text = new TextDecoder();
    return text.decode(bytes.subarray(0, 4)) === 'RIFF' && text.decode(bytes.subarray(8, 12)) === 'WEBP';
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    let hex = '';
    for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
    return hex;
}

export function mountObjectRoutes(route: Hono<AppEnv>): void {
    route.put('/:id/objects/:hash', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const hash = c.req.param('hash') ?? '';
        if (!HASH.test(hash)) return fail(c, 400, 'validation', 'That image could not be checked. Choose the file again.');
        const claimed = Number(c.req.header('content-length'));
        if (Number.isFinite(claimed) && claimed > MAX_IMAGE_BYTES) {
            return fail(c, 400, 'validation', 'This image is larger than 8 MB.');
        }
        const body = await c.req.arrayBuffer();
        if (body.byteLength > MAX_IMAGE_BYTES) return fail(c, 400, 'validation', 'This image is larger than 8 MB.');
        const bytes = new Uint8Array(body);
        if (!isWebp(bytes)) return fail(c, 400, 'validation', 'Use a WebP image.');
        if (await sha256Hex(body) !== hash) return fail(c, 400, 'validation', 'That image could not be checked. Choose the file again.');
        const key = `u/${owned.row.id}/objects/${hash}`;
        const existing = await c.env.PRIVATE_BUCKET.head(key);
        if (existing) return ok(c, { hash, bytes: existing.size }, 200);
        const reservationId = `img:${hash}:${crypto.randomUUID()}`;
        try {
            await reserveObjectBytes(c.env, owned.row.id, reservationId, body.byteLength);
        } catch (err) {
            if (isQuotaFull(err)) return fail(c, 400, 'too_large', QUOTA_SENTENCE);
            throw err;
        }
        try {
            await c.env.PRIVATE_BUCKET.put(key, body, { httpMetadata: { contentType: 'image/webp' } });
            try {
                await database(c.env).update(universes).set({
                    objectBytes: sql`${universes.objectBytes} + ${body.byteLength}`,
                }).where(eq(universes.id, owned.row.id)).run();
            } catch (err) {
                await c.env.PRIVATE_BUCKET.delete(key);
                throw err;
            }
        } catch (err) {
            await releaseObjectBytes(c.env, owned.row.id, reservationId, body.byteLength);
            throw err;
        }
        await releaseObjectBytes(c.env, owned.row.id, reservationId, body.byteLength);
        return ok(c, { hash, bytes: body.byteLength }, 201);
    });

    route.get('/:id/objects/:hash', async (c) => {
        const access = await memberUniverse(c);
        if (access instanceof Response) return access;
        const hash = c.req.param('hash') ?? '';
        if (access.role === 'owner') {
            if (!HASH.test(hash)) return fail(c, 404, 'not_found', 'No such object.');
            const object = await c.env.PRIVATE_BUCKET.get(`u/${access.row.id}/objects/${hash}`);
            if (!object) return fail(c, 404, 'not_found', 'No such object.');
            return objectResponse(object);
        }
        if (access.role !== 'member') return fail(c, 404, 'not_found', 'No such universe.');
        if (memberReadLimited(access.row.id, access.actor.id)) return fail(c, 429, 'rate_limited', 'Too many requests.');
        if (!HASH.test(hash)) return fail(c, 404, 'not_found', 'No such universe.');
        const allowed = await memberHashes(access);
        if (!allowed.has(hash)) return fail(c, 404, 'not_found', 'No such universe.');
        const object = await c.env.PRIVATE_BUCKET.get(`u/${access.row.id}/objects/${hash}`);
        if (!object) return fail(c, 404, 'not_found', 'No such universe.');
        return objectResponse(object);
    });
}

function objectResponse(object: R2ObjectBody): Response {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (!headers.get('content-type')) headers.set('content-type', 'image/webp');
    headers.set('cache-control', 'private, immutable');
    return new Response(object.body, { status: 200, headers });
}

async function memberHashes(access: MemberUniverse): Promise<ReadonlySet<string>> {
    const seqResponse = await access.forward(new Request('https://universe.local/campaign/seq'));
    const seqBody = await seqResponse.json() as { data?: { seq?: number } };
    const seq = Number(seqBody.data?.seq ?? 0);
    const cached = cachedHashes(access.row.id, seq);
    if (cached) return cached;
    const hashResponse = await access.forward(new Request('https://universe.local/campaign/object-hashes'));
    const hashBody = await hashResponse.json() as { data?: { hashes?: unknown } };
    const hashes = Array.isArray(hashBody.data?.hashes)
        ? hashBody.data.hashes.filter((item): item is string => typeof item === 'string')
        : [];
    return storeHashes(access.row.id, seq, hashes);
}
