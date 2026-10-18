import type { Env } from '../env';

/** The same cap the generate job and the image route already use. */
export const OBJECT_QUOTA_BYTES = 250 * 1024 * 1024;
export const QUOTA_SENTENCE = '250 MB of objects per universe.';

/**
 * One sector finishes in seconds. Fifteen minutes covers a slow retry.
 * A dead job stops counting after that, so it cannot hold the quota.
 */
export const RESERVATION_MS = 15 * 60 * 1000;

export const RESERVATION_TABLE = `CREATE TABLE IF NOT EXISTS object_reservations (
    id TEXT PRIMARY KEY,
    bytes INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
)`;

export type QuotaSql = {
    exec: (query: string, ...params: Array<string | number>) => Array<{ n?: number | bigint | null }>;
};

export function ensureReservationTable(sql: QuotaSql): void {
    sql.exec(RESERVATION_TABLE);
}

/** A test can shorten this. Production leaves the binding unset and keeps fifteen minutes. */
export function reservationTtlMs(raw: unknown): number {
    const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(n) || n <= 0) return RESERVATION_MS;
    return Math.min(RESERVATION_MS, Math.max(1000, Math.floor(n)));
}

export function isQuotaFull(err: unknown): boolean {
    return err instanceof Error && err.message === QUOTA_SENTENCE;
}

export type ReserveInput = {
    id: string;
    bytes: number;
    objectBytes: number;
    now: number;
    ttlMs: number;
};

/**
 * Drop expired rows, then add `bytes` onto `id`.
 * Refuse when charged bytes plus what is still reserved plus this request pass 250 MB.
 * Equal to 250 MB is allowed. The check and the insert are one transaction at the caller.
 * The same id adds bytes and refreshes the expiry, which is how one job's slices accumulate.
 */
export function reserveBytes(sql: QuotaSql, input: ReserveInput): { ok: true } | { ok: false } {
    const bytes = Math.floor(input.bytes);
    if (bytes <= 0) return { ok: true };
    const now = Math.floor(input.now);
    sql.exec(`DELETE FROM object_reservations WHERE expires_at <= ?`, now);
    const reserved = reservedBytes(sql);
    if (Math.floor(input.objectBytes) + reserved + bytes > OBJECT_QUOTA_BYTES) return { ok: false };
    const expiresAt = now + Math.floor(input.ttlMs);
    sql.exec(
        `INSERT INTO object_reservations (id, bytes, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET bytes = bytes + excluded.bytes, expires_at = excluded.expires_at`,
        input.id,
        bytes,
        expiresAt,
    );
    return { ok: true };
}

/** Subtract `bytes` from `id`. A missing row, or a second release, does nothing. */
export function releaseBytes(sql: QuotaSql, id: string, bytes: number): void {
    const amount = Math.floor(bytes);
    if (amount <= 0) return;
    sql.exec(`UPDATE object_reservations SET bytes = bytes - ? WHERE id = ?`, amount, id);
    sql.exec(`DELETE FROM object_reservations WHERE id = ? AND bytes <= 0`, id);
}

export function reservedBytes(sql: QuotaSql): number {
    const rows = sql.exec(`SELECT COALESCE(SUM(bytes), 0) AS n FROM object_reservations`);
    return Number(rows[0]?.n ?? 0);
}

export type QuotaBody = { id: string; bytes: number; universeId: string };

export function parseQuotaBody(value: unknown): QuotaBody | 'too_large' | null {
    if (!value || typeof value !== 'object') return null;
    const body = value as { id?: unknown; bytes?: unknown; universeId?: unknown };
    if (typeof body.id !== 'string' || body.id.length < 1 || body.id.length > 200) return null;
    if (typeof body.universeId !== 'string' || body.universeId.length < 1 || body.universeId.length > 200) return null;
    if (typeof body.bytes !== 'number' || !Number.isInteger(body.bytes) || body.bytes < 0) return null;
    if (body.bytes > OBJECT_QUOTA_BYTES) return 'too_large';
    return { id: body.id, bytes: body.bytes, universeId: body.universeId };
}

async function quotaFetch(env: Env, universeId: string, path: string, id: string, bytes: number): Promise<Response> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    return stub.fetch(new Request(`https://universe.internal${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-voyage-worker': 'quota' },
        body: JSON.stringify({ id, bytes, universeId }),
    }));
}

/** Refuse with the same sentence a full universe already answers. A request of 0 is free. */
export async function reserveObjectBytes(env: Env, universeId: string, id: string, bytes: number): Promise<void> {
    if (bytes <= 0) return;
    const response = await quotaFetch(env, universeId, '/quota/reserve', id, bytes);
    if (response.ok) return;
    const parsed = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const message = parsed?.error?.message;
    if (response.status === 400 && message === QUOTA_SENTENCE) throw new Error(QUOTA_SENTENCE);
    throw new Error(message || `quota ${response.status}`);
}

/**
 * Release after the bytes are on `object_bytes`, or after a put that failed.
 * False means the row is still there until its expiry. Releasing before the D1 add would open the race.
 */
export async function releaseObjectBytes(env: Env, universeId: string, id: string, bytes: number): Promise<boolean> {
    if (bytes <= 0) return true;
    try {
        const response = await quotaFetch(env, universeId, '/quota/release', id, bytes);
        return response.ok;
    } catch {
        return false;
    }
}
