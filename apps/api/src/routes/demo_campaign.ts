import type { AppContext } from '../auth/session';
import { fail } from '../http';

export const DEMO_UNAVAILABLE = 'The example campaign is not available yet.';
export const DEMO_UNPUBLISHED = 'No example campaign is published.';

const WINDOW_MS = 60 * 1000;
const LIMIT = 60;
const hits = new Map<string, number[]>();
let demoColumn: boolean | null = null;

function demoLimited(c: AppContext): boolean {
    const now = Date.now();
    const ip = c.req.header('cf-connecting-ip') || 'local';
    const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= LIMIT) {
        hits.set(ip, recent);
        return true;
    }
    recent.push(now);
    hits.set(ip, recent);
    return false;
}

/** A yes stays for the isolate. A no is asked again, so the column can arrive while the Worker is up. */
export async function detectDemoColumn(db: D1Database): Promise<boolean> {
    if (demoColumn === true) return true;
    const row = await db.prepare(
        `SELECT name FROM pragma_table_info('universes') WHERE name = 'demo'`,
    ).first<{ name: string }>();
    demoColumn = row?.name === 'demo';
    return demoColumn === true;
}

/**
 * The signed-out example. The Durable Object projects the players read, so referee rows
 * never leave it. This route does not attach an account, a sheet, an invite, or a token.
 */
export async function getDemoCampaign(c: AppContext): Promise<Response> {
    if (demoLimited(c)) {
        c.header('cache-control', 'private, no-store');
        return fail(c, 429, 'rate_limited', 'Too many requests.');
    }
    if (!await detectDemoColumn(c.env.DB)) {
        c.header('cache-control', 'private, no-store');
        return fail(c, 503, 'demo_unavailable', DEMO_UNAVAILABLE);
    }
    const row = await c.env.DB.prepare(
        `SELECT id FROM universes WHERE demo = 1 AND deleted_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 1`,
    ).first<{ id: string }>();
    if (!row) {
        c.header('cache-control', 'private, no-store');
        return fail(c, 404, 'not_found', DEMO_UNPUBLISHED);
    }
    const stub = c.env.UNIVERSE.get(c.env.UNIVERSE.idFromName(row.id));
    const response = await stub.fetch(new Request('https://universe.internal/campaign/demo', {
        method: 'GET',
        headers: { 'x-voyage-universe-id': row.id },
    }));
    const headers = new Headers();
    headers.set('content-type', 'application/json');
    headers.set('cache-control', response.ok ? 'public, max-age=60' : 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
}
