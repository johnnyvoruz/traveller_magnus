import { chartEntry, generateHex } from '@voyage/generation';
import { GeneratePreview, SectorHex, sha256Hex, stable } from '@voyage/shared';
import { Hono } from 'hono';
import enginesPackage from '../../../../packages/engines/package.json' with { type: 'json' };
import { isAllowanceRefusal, releaseAllowance, takeAllowance } from '../auth/allowance';
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
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    if (rateLimited(actor.id)) return fail(c, 429, 'rate_limited', 'Too many requests.');
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'That request could not be read. Try again.');
    }
    const parsed = GeneratePreview.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'That request could not be read. Try again.', parsed.error.flatten());
    const input = parsed.data;
    const taken = await takeAllowance(c.env, actor.id, actor.role, 1);
    if (isAllowanceRefusal(taken)) return fail(c, 429, taken.details.code, taken.message, taken.details);
    let envelope: ReturnType<typeof generateHex>;
    try {
        envelope = generateHex({
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
    } catch (err) {
        await releaseAllowance(c.env, actor.id, actor.role, 1);
        return fail(c, 400, 'validation', 'This hex could not be generated.', { reason: String(err).slice(0, 200) });
    }
    const hash = await sha256Hex(stable(envelope));
    const row = envelope.body && typeof envelope.body === 'object' ? envelope.body as Record<string, unknown> : {};
    const entry = SectorHex.parse(chartEntry(row, hash));
    return ok(c, { envelope, hash, entry, allowance: taken });
});
