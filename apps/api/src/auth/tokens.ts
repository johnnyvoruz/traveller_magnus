import { AccessScope, ACCESS_SCOPES, type AccessScope as AccessScopeName } from '@voyage/shared';
import type { AppContext, SessionUser } from './session';
import { originAllowed, requireUser } from './session';
import { fail } from '../http';
import {
    clearTokenHits,
    defaultExpiryDays,
    expiryIso,
    hashToken,
    liveTokenLimit,
    mintToken,
    scopesOf,
    tokenReadLimited,
    tokenSubmitLimited,
    tokenUsable,
} from './token_codec.ts';

export {
    defaultExpiryDays,
    expiryIso,
    hashToken,
    liveTokenLimit,
    mintToken,
    scopesOf,
    tokenReadLimited,
    tokenSubmitLimited,
    tokenUsable,
};

const FLAG_TTL_MS = 30 * 1000;

export const TOKENS_UNAVAILABLE = 'Agent access is not available yet.';
export const AGENTS_PAUSED = 'Agent access is paused.';
export const TOKEN_INVALID = 'That token is not valid.';
export const SCOPE_MISSING = 'That token cannot do that.';

export type AgentActor = SessionUser & {
    via: 'cookie' | 'token';
    tokenId: string | null;
    universeId: string | null;
    scopes: AccessScopeName[];
};

type TokenRow = {
    id: string;
    user_id: string;
    scopes: string;
    universe_id: string | null;
    expires_at: string;
    revoked_at: string | null;
};

let tokensReady: boolean | null = null;
let flagOn = false;
let flagAt = 0;

/** A yes is kept. A no is asked again, so applying 0023 needs no restart. */
export async function detectTokens(db: D1Database): Promise<boolean> {
    if (tokensReady === true) return true;
    try {
        const row = await db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'access_tokens'`,
        ).first<{ name: string }>();
        if (row) {
            tokensReady = true;
            return true;
        }
    } catch {
        return false;
    }
    return false;
}

/** Only a row with value `on` is on. No table, no row, and a read error are off. The row is read at most once per 30 seconds. */
export async function agentAccessOn(db: D1Database): Promise<boolean> {
    const now = Date.now();
    if (now - flagAt < FLAG_TTL_MS) return flagOn;
    flagAt = now;
    try {
        const table = await db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'platform_flags'`,
        ).first<{ name: string }>();
        if (!table) {
            flagOn = false;
            return false;
        }
        const row = await db.prepare(
            `SELECT value FROM platform_flags WHERE key = 'agent_access'`,
        ).first<{ value: string }>();
        flagOn = row?.value === 'on';
    } catch {
        flagOn = false;
    }
    return flagOn;
}

/** The admin write updates this isolate at once. Others pick it up within 30 seconds. */
export function noteAgentAccess(value: 'on' | 'off'): void {
    flagOn = value === 'on';
    flagAt = Date.now();
}

const TOKEN_PREFIX = 'tv_pat_';

function bearerValue(c: AppContext): string | null {
    const header = c.req.header('authorization');
    if (!header) return null;
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    return match ? match[1] : '';
}

function paused(c: AppContext): Response {
    return fail(c, 503, 'agents_paused', AGENTS_PAUSED);
}

function unavailable(c: AppContext): Response {
    return fail(c, 503, 'tokens_unavailable', TOKENS_UNAVAILABLE);
}

function invalid(c: AppContext): Response {
    return fail(c, 401, 'token_invalid', TOKEN_INVALID);
}

async function actorFromToken(c: AppContext, token: string, scope: AccessScopeName | null): Promise<AgentActor | Response> {
    if (!await detectTokens(c.env.DB)) return unavailable(c);
    if (!await agentAccessOn(c.env.DB)) return paused(c);
    if (!token.startsWith(TOKEN_PREFIX)) return invalid(c);
    const hash = await hashToken(token);
    const row = await c.env.DB.prepare(
        `SELECT id, user_id, scopes, universe_id, expires_at, revoked_at FROM access_tokens WHERE token_hash = ?`,
    ).bind(hash).first<TokenRow>();
    if (!row || !tokenUsable(row, Date.now())) return invalid(c);
    const account = await c.env.DB.prepare(
        `SELECT id, email, role, banned FROM user WHERE id = ?`,
    ).bind(row.user_id).first<{ id: string; email: string; role: string | null; banned: number | null }>();
    if (!account || account.banned) return invalid(c);
    const scopes = scopesOf(row.scopes);
    if (scope && !scopes.includes(scope)) return fail(c, 403, 'scope_missing', SCOPE_MISSING);
    await c.env.DB.prepare(`UPDATE access_tokens SET last_used_at = ? WHERE id = ?`).bind(new Date().toISOString(), row.id).run();
    const actor: AgentActor = {
        id: account.id,
        email: account.email,
        role: account.role ?? '',
        via: 'token',
        tokenId: row.id,
        universeId: row.universe_id,
        scopes,
    };
    c.set('userId', actor.id);
    c.set('via', 'token');
    c.set('tokenId', actor.tokenId);
    return actor;
}

/**
 * Cookie owner, or a bearer token with `scope`.
 * A route that does not call this keeps accepting only the cookie.
 */
export async function requireAgent(c: AppContext, scope: AccessScopeName): Promise<AgentActor | Response> {
    const presented = bearerValue(c);
    if (presented !== null) {
        if (presented === '') return invalid(c);
        return actorFromToken(c, presented, scope);
    }
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    c.set('via', 'cookie');
    c.set('tokenId', null);
    return { ...user, via: 'cookie', tokenId: null, universeId: null, scopes: [...ACCESS_SCOPES] };
}

/** MCP takes a bearer token and never a cookie. A missing bearer is `token_invalid`. */
export async function requireBearer(c: AppContext): Promise<AgentActor | Response> {
    if (!originAllowed(c)) {
        return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
    }
    const presented = bearerValue(c);
    if (presented === null || presented === '') return invalid(c);
    return actorFromToken(c, presented, null);
}

export function rateLimited(c: AppContext): Response {
    c.header('retry-after', '60');
    return fail(c, 429, 'rate_limited', 'Too many requests.');
}

export { AccessScope };
