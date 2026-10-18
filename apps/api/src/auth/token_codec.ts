import { ACCESS_SCOPES, type AccessScope as AccessScopeName } from '@voyage/shared';

const TOKEN_PREFIX = 'tv_pat_';
const PREFIX_CHARS = 12;
const SECRET_BYTES = 32;
const LIVE_LIMIT = 10;
const DEFAULT_DAYS = 90;
const READ_LIMIT = 120;
const SUBMIT_LIMIT = 10;
const WINDOW_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const hits = new Map<string, number[]>();

export function resetTokenLimits(): void {
    hits.clear();
}

export function clearTokenHits(): void {
    resetTokenLimits();
}

export async function hashToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `tv_pat_` plus 43 base64url characters from 32 random bytes. Shown once. */
export function mintToken(): { token: string; prefix: string } {
    const bytes = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const body = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const token = `${TOKEN_PREFIX}${body}`;
    return { token, prefix: token.slice(0, PREFIX_CHARS) };
}

export function expiryIso(days: number, nowMs: number): string {
    return new Date(nowMs + days * DAY_MS).toISOString();
}

export function defaultExpiryDays(): number {
    return DEFAULT_DAYS;
}

export function liveTokenLimit(): number {
    return LIVE_LIMIT;
}

export function scopesOf(raw: string): AccessScopeName[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is AccessScopeName => ACCESS_SCOPES.includes(item as AccessScopeName));
    } catch {
        return [];
    }
}

export function tokenUsable(row: { expires_at: string; revoked_at: string | null }, nowMs: number): boolean {
    if (row.revoked_at) return false;
    return Date.parse(row.expires_at) > nowMs;
}

function spend(key: string, limit: number): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= limit) {
        hits.set(key, recent);
        return true;
    }
    recent.push(now);
    hits.set(key, recent);
    return false;
}

/** True when this token has already read 120 times in the minute. */
export function tokenReadLimited(tokenId: string): boolean {
    return spend(`${tokenId}:read`, READ_LIMIT);
}

/** True when this token has already submitted 10 times in the minute. */
export function tokenSubmitLimited(tokenId: string): boolean {
    return spend(`${tokenId}:submit`, SUBMIT_LIMIT);
}
