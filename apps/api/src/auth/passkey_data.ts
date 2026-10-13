import { APIError } from '@better-auth/core/error';
import { DEFAULT_DAILY_LIMIT } from './allowance';
import {
    LAST_PASSKEY,
    LAST_PROVIDER,
    RECOVERY_INVALID,
    RECOVERY_LIMIT,
    RECOVERY_SHOWN,
    SIGNUP_LIMIT,
    USERNAME_TAKEN,
} from './passkey_words';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_MAX = 5;
const FAILURE_MAX = 5;
const CODE_LENGTH = 12;

export function clientAddress(headers: Headers | undefined): string {
    const cf = headers?.get('cf-connecting-ip')?.trim();
    if (cf) return cf.slice(0, 64);
    const forwarded = headers?.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded.slice(0, 64);
    return 'unknown';
}

function countOf(row: { n: number | string } | null): number {
    return Number(row?.n ?? 0);
}

export async function usernameTaken(db: D1Database, username: string, exceptUserId: string | null): Promise<boolean> {
    const user = await db.prepare(
        `SELECT id FROM user WHERE username = ? AND id != ?`,
    ).bind(username, exceptUserId ?? '').first<{ id: string }>();
    if (user) return true;
    const handle = await db.prepare(
        `SELECT user_id AS userId FROM profile WHERE handle = ? AND user_id != ?`,
    ).bind(username, exceptUserId ?? '').first<{ userId: string }>();
    return Boolean(handle);
}

export async function countSignup(db: D1Database, address: string, now = Date.now()): Promise<void> {
    const since = now - HOUR_MS;
    await db.prepare(`DELETE FROM passkey_signup WHERE created_at < ?`).bind(since).run();
    const row = await db.prepare(
        `SELECT COUNT(*) AS n FROM passkey_signup WHERE address = ? AND created_at >= ?`,
    ).bind(address, since).first<{ n: number }>();
    if (countOf(row) >= SIGNUP_MAX) throw APIError.from('TOO_MANY_REQUESTS', { code: 'signup_limit', message: SIGNUP_LIMIT });
    await db.prepare(
        `INSERT INTO passkey_signup (id, address, created_at) VALUES (?, ?, ?)`,
    ).bind(crypto.randomUUID(), address, now).run();
}

async function passkeyCount(db: D1Database, userId: string): Promise<number> {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM passkey WHERE user_id = ?`).bind(userId).first<{ n: number }>();
    return countOf(row);
}

async function providerCount(db: D1Database, userId: string): Promise<number> {
    const row = await db.prepare(
        `SELECT COUNT(*) AS n FROM account WHERE user_id = ? AND provider_id IN ('google', 'discord', 'twitter')`,
    ).bind(userId).first<{ n: number }>();
    return countOf(row);
}

export async function assertCanDeletePasskey(db: D1Database, userId: string): Promise<void> {
    if (await passkeyCount(db, userId) !== 1) return;
    if (await providerCount(db, userId) > 0) return;
    throw APIError.from('BAD_REQUEST', { code: 'last_passkey', message: LAST_PASSKEY });
}

export async function assertCanUnlink(db: D1Database, userId: string): Promise<void> {
    if (await providerCount(db, userId) !== 1) return;
    if (await passkeyCount(db, userId) > 0) return;
    throw APIError.from('BAD_REQUEST', { code: 'last_provider', message: LAST_PROVIDER });
}

export async function insertAllowance(db: D1Database, userId: string): Promise<void> {
    await db.prepare(
        `INSERT INTO generation_allowance (user_id, daily_limit, day, used) VALUES (?, ?, '', 0)
         ON CONFLICT(user_id) DO NOTHING`,
    ).bind(userId, DEFAULT_DAILY_LIMIT).run();
}

export async function syncHandle(db: D1Database, userId: string, username: string): Promise<void> {
    const other = await db.prepare(
        `SELECT user_id AS userId FROM profile WHERE handle = ? AND user_id != ?`,
    ).bind(username, userId).first<{ userId: string }>();
    if (other) throw APIError.from('BAD_REQUEST', { code: 'username_taken', message: USERNAME_TAKEN });
    const now = new Date().toISOString();
    const existing = await db.prepare(`SELECT user_id AS userId FROM profile WHERE user_id = ?`).bind(userId).first();
    if (!existing) {
        await db.prepare(
            `INSERT INTO profile (user_id, handle, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`,
        ).bind(userId, username, username, now, now).run();
        return;
    }
    await db.prepare(`UPDATE profile SET handle = ? WHERE user_id = ?`).bind(username, userId).run();
}

export type ProfileCard = {
    profile: {
        userId: string;
        handle: string;
        displayName: string;
        avatarUrl: string | null;
        createdAt: string;
        lastSeenAt: string | null;
    };
    username: string | null;
    hasPasskey: boolean;
    unusedRecoveryCodes: number;
    linkedProviders: string[];
};

/**
 * The profile row plus the passkey fields, in the one read `GET /api/me` already did.
 * Null when the profile does not exist yet.
 */
export async function readProfileCard(db: D1Database, userId: string): Promise<ProfileCard | null> {
    const row = await db.prepare(
        `SELECT
            p.user_id AS userId,
            p.handle AS handle,
            p.display_name AS displayName,
            p.avatar_url AS avatarUrl,
            p.created_at AS createdAt,
            p.last_seen_at AS lastSeenAt,
            u.username AS username,
            (SELECT COUNT(*) FROM passkey WHERE user_id = p.user_id) AS passkeys,
            (SELECT COUNT(*) FROM recovery_code WHERE user_id = p.user_id AND used_at IS NULL) AS unused,
            (SELECT group_concat(provider_id) FROM account
              WHERE user_id = p.user_id AND provider_id IN ('google', 'discord', 'twitter')) AS providers
         FROM profile p
         JOIN user u ON u.id = p.user_id
         WHERE p.user_id = ?`,
    ).bind(userId).first<{
        userId: string;
        handle: string;
        displayName: string;
        avatarUrl: string | null;
        createdAt: string;
        lastSeenAt: string | null;
        username: string | null;
        passkeys: number;
        unused: number;
        providers: string | null;
    }>();
    if (!row) return null;
    const linkedProviders = row.providers ? row.providers.split(',').filter(Boolean).sort() : [];
    return {
        profile: {
            userId: row.userId,
            handle: row.handle,
            displayName: row.displayName,
            avatarUrl: row.avatarUrl,
            createdAt: row.createdAt,
            lastSeenAt: row.lastSeenAt,
        },
        username: row.username,
        hasPasskey: Number(row.passkeys) > 0,
        unusedRecoveryCodes: Number(row.unused),
        linkedProviders,
    };
}

export async function clearPasskeyGate(db: D1Database, userId: string): Promise<void> {
    await db.prepare(`UPDATE session SET must_add_passkey = 0 WHERE user_id = ?`).bind(userId).run();
}

function randomCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    let code = '';
    for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
    return code;
}

export function plainCode(raw: string): string {
    return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function dashed(code: string): string {
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

async function codeHash(secret: string, code: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + code));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameHash(left: string, right: string): boolean {
    const a = new TextEncoder().encode(left);
    const b = new TextEncoder().encode(right);
    const length = Math.max(a.length, b.length);
    let diff = a.length === b.length ? 0 : 1;
    for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
}

async function aesKey(secret: string): Promise<CryptoKey> {
    const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function encode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function decode(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function seal(secret: string, codes: string[]): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await aesKey(secret),
        new TextEncoder().encode(JSON.stringify(codes)),
    ));
    return `${encode(iv)}.${encode(cipher)}`;
}

async function open(secret: string, payload: string): Promise<string[]> {
    const [iv, cipher] = payload.split('.');
    if (!iv || !cipher) return [];
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decode(iv) },
        await aesKey(secret),
        decode(cipher),
    );
    const codes = JSON.parse(new TextDecoder().decode(plain)) as unknown;
    return Array.isArray(codes) ? codes.filter((item) => typeof item === 'string') : [];
}

/** Ten new codes. Replaces the unused set. Returns the dashed codes. The hash is the undashed code. */
export async function writeCodes(db: D1Database, secret: string, userId: string, now = Date.now()): Promise<string[]> {
    await db.prepare(`DELETE FROM recovery_code WHERE user_id = ? AND used_at IS NULL`).bind(userId).run();
    const codes = Array.from({ length: 10 }, () => randomCode());
    const hashes = await Promise.all(codes.map((code) => codeHash(secret, code)));
    await db.batch(codes.map((code, index) => db.prepare(
        `INSERT INTO recovery_code (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), userId, hashes[index], now)));
    return codes.map(dashed);
}

export async function sealEnvelope(db: D1Database, secret: string, userId: string, codes: string[], now = Date.now()): Promise<void> {
    const payload = await seal(secret, codes);
    await db.prepare(
        `INSERT INTO recovery_envelope (user_id, payload, created_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`,
    ).bind(userId, payload, now).run();
}

export async function openEnvelope(db: D1Database, secret: string, userId: string): Promise<string[]> {
    const row = await db.prepare(
        `SELECT payload FROM recovery_envelope WHERE user_id = ?`,
    ).bind(userId).first<{ payload: string }>();
    if (!row) throw APIError.from('BAD_REQUEST', { code: 'recovery_shown', message: RECOVERY_SHOWN });
    await db.prepare(`DELETE FROM recovery_envelope WHERE user_id = ?`).bind(userId).run();
    return open(secret, row.payload);
}

async function failureCount(db: D1Database, userId: string, now: number): Promise<number> {
    const since = now - WINDOW_MS;
    await db.prepare(`DELETE FROM recovery_failure WHERE user_id = ? AND created_at < ?`).bind(userId, since).run();
    const row = await db.prepare(
        `SELECT COUNT(*) AS n FROM recovery_failure WHERE user_id = ? AND created_at >= ?`,
    ).bind(userId, since).first<{ n: number }>();
    return countOf(row);
}

export type RedeemResult = 'ok' | 'invalid' | 'limited';

/** Five failures in 15 minutes is limited. A match marks the code used. */
export async function redeemCode(db: D1Database, secret: string, userId: string, raw: string, now = Date.now()): Promise<RedeemResult> {
    if (await failureCount(db, userId, now) >= FAILURE_MAX) return 'limited';
    const digest = await codeHash(secret, plainCode(raw));
    const dummy = await codeHash(secret, '000000000000');
    const rows = await db.prepare(
        `SELECT id, code_hash AS codeHash FROM recovery_code WHERE user_id = ? AND used_at IS NULL`,
    ).bind(userId).all<{ id: string; codeHash: string }>();
    let matched: string | null = null;
    for (const row of rows.results ?? []) {
        if (sameHash(row.codeHash, digest)) matched = row.id;
    }
    sameHash(digest, dummy);
    if (!matched) {
        await db.prepare(
            `INSERT INTO recovery_failure (id, user_id, created_at) VALUES (?, ?, ?)`,
        ).bind(crypto.randomUUID(), userId, now).run();
        return await failureCount(db, userId, now) >= FAILURE_MAX ? 'limited' : 'invalid';
    }
    await db.prepare(`UPDATE recovery_code SET used_at = ? WHERE id = ? AND used_at IS NULL`).bind(now, matched).run();
    await db.prepare(`DELETE FROM recovery_failure WHERE user_id = ?`).bind(userId).run();
    return 'ok';
}

export function recoveryError(result: Exclude<RedeemResult, 'ok'>): APIError {
    if (result === 'limited') return APIError.from('TOO_MANY_REQUESTS', { code: 'recovery_limit', message: RECOVERY_LIMIT });
    return APIError.from('BAD_REQUEST', { code: 'recovery_invalid', message: RECOVERY_INVALID });
}
