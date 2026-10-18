import { AccessTokenCreate } from '@voyage/shared';
import { Hono } from 'hono';
import { originAllowed, requireUser } from '../auth/session';
import {
    agentAccessOn,
    defaultExpiryDays,
    detectTokens,
    expiryIso,
    hashToken,
    liveTokenLimit,
    mintToken,
    scopesOf,
    TOKENS_UNAVAILABLE,
} from '../auth/tokens';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { privateNoStore } from '../universe/door_headers';

const DAY_MS = 24 * 60 * 60 * 1000;
const REVOKED_DAYS = 30;

export const tokensRoute = new Hono<AppEnv>();

function unavailable(c: Parameters<typeof fail>[0]): Response {
    return fail(c, 503, 'tokens_unavailable', TOKENS_UNAVAILABLE);
}

type TokenSql = {
    id: string;
    name: string;
    prefix: string;
    scopes: string;
    universe_id: string | null;
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
};

function rowOf(row: TokenSql) {
    return {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        scopes: scopesOf(row.scopes),
        universeId: row.universe_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
    };
}

tokensRoute.get('/', async (c) => {
    const actor = await requireUser(c);
    if (actor instanceof Response) return privateNoStore(actor);
    if (!await detectTokens(c.env.DB)) return privateNoStore(unavailable(c));
    if (!await agentAccessOn(c.env.DB)) return privateNoStore(fail(c, 503, 'agents_paused', 'Agent access is paused.'));
    const since = new Date(Date.now() - REVOKED_DAYS * DAY_MS).toISOString();
    const now = new Date().toISOString();
    const listed = await c.env.DB.prepare(
        `SELECT id, name, prefix, scopes, universe_id, created_at, expires_at, last_used_at, revoked_at
         FROM access_tokens
         WHERE user_id = ? AND (
            (revoked_at IS NULL AND expires_at > ?) OR (revoked_at IS NOT NULL AND revoked_at >= ?)
         )
         ORDER BY created_at DESC`,
    ).bind(actor.id, now, since).all<TokenSql>();
    const body = { items: (listed.results ?? []).map((row) => rowOf(row)) };
    return privateNoStore(ok(c, body));
});

tokensRoute.post('/', async (c) => {
    if (!originAllowed(c)) return privateNoStore(fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.'));
    const actor = await requireUser(c);
    if (actor instanceof Response) return privateNoStore(actor);
    if (!await detectTokens(c.env.DB)) return privateNoStore(unavailable(c));
    if (!await agentAccessOn(c.env.DB)) return privateNoStore(fail(c, 503, 'agents_paused', 'Agent access is paused.'));
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return privateNoStore(fail(c, 400, 'validation', 'Invalid request.'));
    }
    if (!body || typeof body !== 'object' || !('universeId' in body)) {
        return privateNoStore(fail(c, 400, 'validation', 'Invalid request.'));
    }
    const parsed = AccessTokenCreate.safeParse(body);
    if (!parsed.success) return privateNoStore(fail(c, 400, 'validation', 'Invalid request.'));
    const input = parsed.data;
    if (input.universeId) {
        const owned = await c.env.DB.prepare(
            `SELECT id FROM universes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
        ).bind(input.universeId, actor.id).first<{ id: string }>();
        if (!owned) return privateNoStore(fail(c, 404, 'not_found', 'No such universe.'));
    }
    const now = new Date();
    const live = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM access_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?`,
    ).bind(actor.id, now.toISOString()).first<{ n: number }>();
    if (Number(live?.n ?? 0) >= liveTokenLimit()) {
        return privateNoStore(fail(c, 400, 'too_large', 'An account holds at most ten tokens.'));
    }
    const minted = mintToken();
    const id = `at_${crypto.randomUUID()}`;
    const createdAt = now.toISOString();
    const expiresAt = expiryIso(input.expiresInDays ?? defaultExpiryDays(), now.getTime());
    await c.env.DB.prepare(
        `INSERT INTO access_tokens (
            id, user_id, name, prefix, token_hash, scopes, universe_id, created_at, expires_at, last_used_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).bind(
        id,
        actor.id,
        input.name,
        minted.prefix,
        await hashToken(minted.token),
        JSON.stringify(input.scopes),
        input.universeId,
        createdAt,
        expiresAt,
    ).run();
    return privateNoStore(ok(c, {
        token: minted.token,
        row: {
            id,
            name: input.name,
            prefix: minted.prefix,
            scopes: input.scopes,
            universeId: input.universeId,
            createdAt,
            expiresAt,
            lastUsedAt: null,
            revokedAt: null,
        },
    }, 201));
});

tokensRoute.delete('/:id', async (c) => {
    if (!originAllowed(c)) return privateNoStore(fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.'));
    const actor = await requireUser(c);
    if (actor instanceof Response) return privateNoStore(actor);
    if (!await detectTokens(c.env.DB)) return privateNoStore(unavailable(c));
    if (!await agentAccessOn(c.env.DB)) return privateNoStore(fail(c, 503, 'agents_paused', 'Agent access is paused.'));
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
        `SELECT id, user_id, revoked_at FROM access_tokens WHERE id = ?`,
    ).bind(id).first<{ id: string; user_id: string; revoked_at: string | null }>();
    if (!row || row.user_id !== actor.id) return privateNoStore(fail(c, 404, 'not_found', 'No such token.'));
    if (!row.revoked_at) {
        await c.env.DB.prepare(`UPDATE access_tokens SET revoked_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
    }
    return privateNoStore(ok(c, {}));
});
