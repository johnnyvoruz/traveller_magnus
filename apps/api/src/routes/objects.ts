import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Hono } from 'hono';
import { universes } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { ownedUniverse } from '../universe/forward';

const HASH = /^[0-9a-f]{64}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OBJECT_QUOTA_BYTES = 250 * 1024 * 1024;

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
        if (!HASH.test(hash)) return fail(c, 400, 'validation', 'Hash must be 64 lowercase hex characters.');
        const claimed = Number(c.req.header('content-length'));
        if (Number.isFinite(claimed) && claimed > MAX_IMAGE_BYTES) {
            return fail(c, 400, 'validation', 'Image is larger than 8 MB.');
        }
        const body = await c.req.arrayBuffer();
        if (body.byteLength > MAX_IMAGE_BYTES) return fail(c, 400, 'validation', 'Image is larger than 8 MB.');
        const bytes = new Uint8Array(body);
        if (!isWebp(bytes)) return fail(c, 400, 'validation', 'Image is not WebP.');
        if (await sha256Hex(body) !== hash) return fail(c, 400, 'validation', 'Hash does not match the body.');
        const key = `u/${owned.row.id}/objects/${hash}`;
        const existing = await c.env.PRIVATE_BUCKET.head(key);
        if (existing) return ok(c, { hash, bytes: existing.size }, 200);
        if (owned.row.objectBytes + body.byteLength > OBJECT_QUOTA_BYTES) {
            return fail(c, 400, 'too_large', '250 MB of objects per universe.');
        }
        await c.env.PRIVATE_BUCKET.put(key, body, { httpMetadata: { contentType: 'image/webp' } });
        try {
            await database(c.env).update(universes).set({
                objectBytes: sql`${universes.objectBytes} + ${body.byteLength}`,
            }).where(eq(universes.id, owned.row.id)).run();
        } catch (err) {
            await c.env.PRIVATE_BUCKET.delete(key);
            throw err;
        }
        return ok(c, { hash, bytes: body.byteLength }, 201);
    });

    route.get('/:id/objects/:hash', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const hash = c.req.param('hash') ?? '';
        if (!HASH.test(hash)) return fail(c, 404, 'not_found', 'No such object.');
        const object = await c.env.PRIVATE_BUCKET.get(`u/${owned.row.id}/objects/${hash}`);
        if (!object) return fail(c, 404, 'not_found', 'No such object.');
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        if (!headers.get('content-type')) headers.set('content-type', 'image/webp');
        headers.set('cache-control', 'private, immutable');
        return new Response(object.body, { status: 200, headers });
    });
}
