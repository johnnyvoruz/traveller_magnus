import { generateHex } from '@voyage/generation';
import { GeneratePreview, sha256Hex, stable } from '@voyage/shared';
import { Hono } from 'hono';
import enginesPackage from '../../../../packages/engines/package.json' with { type: 'json' };
import { originAllowed, requireUser } from '../auth/session';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';

const WINDOW_MS = 60 * 1000;
const LIMIT = 60;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= LIMIT) {
        hits.set(userId, recent);
        return true;
    }
    recent.push(now);
    hits.set(userId, recent);
    return false;
}

function summaryOf(inputs: unknown): Record<string, any> {
    if (inputs && typeof inputs === 'object' && !Array.isArray(inputs)) return inputs as Record<string, any>;
    return {};
}

export const generate = new Hono<AppEnv>();

generate.post('/generate/preview', async (c) => {
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    if (rateLimited(actor.id)) return fail(c, 429, 'rate_limited', 'Too many requests.');
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'Invalid JSON.');
    }
    const parsed = GeneratePreview.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const input = parsed.data;
    const envelope = generateHex({
        hexKey: input.hexKey,
        edition: input.edition,
        mode: input.mode,
        summary: summaryOf(input.inputs),
        pinned: {
            seed: input.seed,
            settings: input.settings,
            engineVersion: enginesPackage.version,
        },
    });
    const hash = await sha256Hex(stable(envelope));
    return ok(c, { envelope, hash });
});
