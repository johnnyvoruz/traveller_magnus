import type { Env } from '../env';
import { allowanceSentence, resetsAt, utcDay } from './allowance_clock';
import { roleSatisfies } from './roles';

/** Non-admins. The same rank as `requireRole(c, 'admin')`. A reviewer is capped. */
export const ALLOWANCE_CODE = 'generation_allowance';
export const DEFAULT_DAILY_LIMIT = 100;

export type AllowanceView = {
    /** Null when this account is an admin and has no cap. */
    limit: number | null;
    used: number;
    remaining: number | null;
    /** Midnight UTC that ends this day, ISO-8601. */
    resetsAt: string;
};

export type AllowanceRefusal = {
    message: string;
    details: {
        code: typeof ALLOWANCE_CODE;
        remaining: number;
        limit: number;
        resetsAt: string;
    };
};

type Stored = { dailyLimit: number; day: string; used: number };

function viewOf(row: Stored, now: Date, capped: boolean): AllowanceView {
    if (!capped) return { limit: null, used: 0, remaining: null, resetsAt: resetsAt(now) };
    const used = row.day === utcDay(now) ? row.used : 0;
    const limit = row.dailyLimit;
    return { limit, used, remaining: Math.max(0, limit - used), resetsAt: resetsAt(now) };
}

function refusal(row: Stored, now: Date): AllowanceRefusal {
    const shown = viewOf(row, now, true);
    const remaining = shown.remaining ?? 0;
    const limit = shown.limit ?? row.dailyLimit;
    return {
        message: allowanceSentence(remaining),
        details: { code: ALLOWANCE_CODE, remaining, limit, resetsAt: shown.resetsAt },
    };
}

async function ensureRow(env: Env, userId: string): Promise<void> {
    await env.DB.prepare(
        `INSERT INTO generation_allowance (user_id, daily_limit, day, used) VALUES (?, ?, '', 0)
         ON CONFLICT(user_id) DO NOTHING`,
    ).bind(userId, DEFAULT_DAILY_LIMIT).run();
}

async function readRow(env: Env, userId: string): Promise<Stored> {
    await ensureRow(env, userId);
    const row = await env.DB.prepare(
        `SELECT daily_limit AS dailyLimit, day, used FROM generation_allowance WHERE user_id = ?`,
    ).bind(userId).first<Stored>();
    if (!row) throw new Error('Allowance was not stored.');
    return row;
}

export function isAllowanceRefusal(value: AllowanceView | AllowanceRefusal): value is AllowanceRefusal {
    return 'message' in value;
}

/** Read the allowance. Does not count a system. Admins are not capped. */
export async function readAllowance(env: Env, userId: string, role: string, now = new Date()): Promise<AllowanceView> {
    if (roleSatisfies(role, 'admin')) return viewOf({ dailyLimit: DEFAULT_DAILY_LIMIT, day: '', used: 0 }, now, false);
    return viewOf(await readRow(env, userId), now, true);
}

/**
 * Count `count` systems against today's allowance, or refuse the whole request.
 * One UPDATE checks and adds. Two requests cannot both pass the same remainder.
 * A count of 0 only reads. An admin is not counted.
 * The day is the UTC date of `now`. A stored day that is not today starts again at 0.
 */
export async function takeAllowance(
    env: Env,
    userId: string,
    role: string,
    count: number,
    now = new Date(),
): Promise<AllowanceView | AllowanceRefusal> {
    if (roleSatisfies(role, 'admin')) return readAllowance(env, userId, role, now);
    if (count < 1) return readAllowance(env, userId, role, now);
    await ensureRow(env, userId);
    const today = utcDay(now);
    const updated = await env.DB.prepare(
        `UPDATE generation_allowance
         SET used = CASE WHEN day = ?2 THEN used + ?3 ELSE ?3 END,
             day = ?2
         WHERE user_id = ?1
           AND (CASE WHEN day = ?2 THEN used ELSE 0 END) + ?3 <= daily_limit
         RETURNING daily_limit AS dailyLimit, day, used`,
    ).bind(userId, today, count).first<Stored>();
    if (!updated) return refusal(await readRow(env, userId), now);
    return viewOf(updated, now, true);
}

/** Put a count back when this request failed before it generated. Undo does not call this. */
export async function releaseAllowance(env: Env, userId: string, role: string, count: number, now = new Date()): Promise<void> {
    if (roleSatisfies(role, 'admin') || count < 1) return;
    await env.DB.prepare(
        `UPDATE generation_allowance
         SET used = CASE WHEN used >= ?3 THEN used - ?3 ELSE 0 END
         WHERE user_id = ?1 AND day = ?2`,
    ).bind(userId, utcDay(now), count).run();
}
