import { reactive } from 'vue';
import type { GenerationAllowance as Allowance } from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';

export type SessionUser = {
    id: string;
    email: string | null;
    role: string;
    profile: { handle?: string; displayName?: string | null } | null;
    /** The public handle, or null when this account has not set a username. */
    username: string | null;
    hasPasskey: boolean;
    unusedRecoveryCodes: number;
    /** Provider ids. `twitter` is X. */
    linkedProviders: string[];
};

/** `recovery` can only add a passkey. The screen routes on this. */
export type SessionGate = 'signed-out' | 'open' | 'recovery';

const RESETS_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * The signed-in user, for any component. `error` is a failed sign-in only. A 401 leaves it blank.
 * `allowance` is how many systems this account may still generate today.
 * It is the account's number, so it lives here: GET /api/me arrives before any map is open,
 * and every map shows the same one. Null until that answer, and null when signed out.
 */
export const session = reactive({
    user: null as SessionUser | null,
    error: '',
    allowance: null as Allowance | null,
    gate: 'signed-out' as SessionGate,
});

let once: Promise<void> | null = null;
let meFetch: typeof fetch = fetch;
/** Bumped on sign-out so a late /api/me from the previous account cannot fill the next one. */
let epoch = 0;
/** The resetsAt we have already asked /api/me about. One ask, no timer. */
let asked: string | null = null;

function whole(value: unknown, min: number): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

/** The four allowance fields. Extra keys are ignored. A bad field is no allowance. */
export function readAllowanceFields(value: unknown): Allowance | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as { limit?: unknown; used?: unknown; remaining?: unknown; resetsAt?: unknown };
    const limit = row.limit === null ? null : row.limit;
    const remaining = row.remaining === null ? null : row.remaining;
    const used = row.used;
    if (!(limit === null || whole(limit, 1))) return null;
    if (!whole(used, 0)) return null;
    if (!(remaining === null || whole(remaining, 0))) return null;
    if (typeof row.resetsAt !== 'string' || !RESETS_AT.test(row.resetsAt)) return null;
    return { limit, used, remaining, resetsAt: row.resetsAt };
}

function readUser(body: unknown): SessionUser | null {
    if (!body || typeof body !== 'object') return null;
    const data = (body as { data?: unknown }).data;
    if (!data || typeof data !== 'object') return null;
    const row = data as Partial<SessionUser> & { linkedProviders?: unknown };
    if (typeof row.id !== 'string') return null;
    const linked = Array.isArray(row.linkedProviders)
        ? row.linkedProviders.filter((item): item is string => typeof item === 'string')
        : [];
    const unused = row.unusedRecoveryCodes;
    return {
        id: row.id,
        email: typeof row.email === 'string' ? row.email : null,
        role: typeof row.role === 'string' ? row.role : 'user',
        profile: row.profile && typeof row.profile === 'object' ? row.profile : null,
        username: typeof row.username === 'string' ? row.username : null,
        hasPasskey: row.hasPasskey === true,
        unusedRecoveryCodes: whole(unused, 0) ? unused : 0,
        linkedProviders: linked,
    };
}

function parsedAllowance(body: unknown): Allowance | null {
    if (!body || typeof body !== 'object') return null;
    const data = (body as { data?: unknown }).data;
    if (!data || typeof data !== 'object' || !('allowance' in data)) return null;
    return readAllowanceFields((data as { allowance?: unknown }).allowance);
}

/** A generate answer's allowance. Ignored when it belongs to another account, or when signed out. */
export function noteAllowance(value: unknown, accountId: string | null): void {
    if (!session.user || accountId === null || session.user.id !== accountId) return;
    const parsed = readAllowanceFields(value);
    if (!parsed) return;
    session.allowance = parsed;
}

function failureOf(body: unknown): { code: string; message: string } | null {
    if (!body || typeof body !== 'object') return null;
    const row = body as { code?: unknown; message?: unknown; error?: { code?: unknown; message?: unknown } };
    const nested = row.error && typeof row.error === 'object' ? row.error : null;
    const code = typeof row.code === 'string' ? row.code : typeof nested?.code === 'string' ? nested.code : '';
    if (!code) return null;
    const message = typeof row.message === 'string' ? row.message : typeof nested?.message === 'string' ? nested.message : '';
    return { code, message };
}

async function failureFrom(res: Response): Promise<{ code: string; message: string } | null> {
    try {
        return failureOf(await res.json());
    } catch {
        return null;
    }
}

/**
 * The held allowance. When `resetsAt` has passed, asks GET /api/me once and replaces it.
 * Nothing polls while the value is unread.
 */
export function readAllowance(now = Date.now()): Allowance | null {
    if (!session.user) return null;
    const held = session.allowance;
    if (!held) return null;
    const at = Date.parse(held.resetsAt);
    if (Number.isFinite(at) && at <= now && asked !== held.resetsAt) {
        asked = held.resetsAt;
        void refreshMe(epoch);
    }
    return session.allowance;
}

/**
 * One session read, after the map's first paint. Never throws.
 * 401 and any other failure are signed out, with no message.
 */
export function loadSession(fetchImpl: typeof fetch = fetch): Promise<void> {
    meFetch = fetchImpl;
    if (!once) once = pull(fetchImpl, epoch);
    return once;
}

/** Forget the cached read and ask GET /api/me again. The held allowance is cleared until that answer. */
export function reloadSession(fetchImpl: typeof fetch = fetch): Promise<void> {
    meFetch = fetchImpl;
    once = null;
    epoch += 1;
    session.allowance = null;
    asked = null;
    once = pull(fetchImpl, epoch);
    return once;
}

function applyMe(body: unknown, ticket: number): void {
    if (ticket !== epoch) return;
    const user = readUser(body);
    const next = user ? parsedAllowance(body) : null;
    if (!user || (session.user && session.user.id !== user.id)) session.allowance = next;
    else if (next) session.allowance = next;
    session.user = user;
    if (user) session.gate = 'open';
}

async function pull(fetchImpl: typeof fetch, ticket: number): Promise<void> {
    try {
        const res = await apiFetch(fetchImpl, '/api/me');
        if (ticket !== epoch) return;
        if (!res.ok) {
            await refused(res, ticket);
            return;
        }
        applyMe(await res.json(), ticket);
    } catch {
        if (ticket !== epoch) return;
        session.user = null;
        session.allowance = null;
        session.gate = 'signed-out';
    }
}

/** A recovery session. The held user and allowance are cleared, and a late /api/me cannot fill them. */
export function enterRecovery(): void {
    session.user = null;
    session.allowance = null;
    session.gate = 'recovery';
    once = null;
    asked = null;
    epoch += 1;
}

async function refused(res: Response, ticket: number): Promise<void> {
    if (ticket !== epoch) return;
    const failure = await failureFrom(res);
    if (failure?.code === 'passkey_required') {
        enterRecovery();
        return;
    }
    session.user = null;
    session.allowance = null;
    session.gate = 'signed-out';
}

async function refreshMe(ticket: number): Promise<void> {
    try {
        const res = await apiFetch(meFetch, '/api/me');
        if (ticket !== epoch) return;
        if (!res.ok) {
            await refused(res, ticket);
            return;
        }
        applyMe(await res.json(), ticket);
    } catch {
        // One ask. The held value stays until a later answer replaces it.
    }
}

/**
 * The sign-in call. A failure sets `session.error`.
 * `callbackURL` is where the sign-in returns. The claim page passes its own path.
 * `provider` is better-auth's id: 'twitter' (X), 'discord' or 'google'.
 */
export async function signIn(fetchImpl: typeof fetch = fetch, callbackURL = '/', provider = 'twitter'): Promise<void> {
    session.error = '';
    try {
        const res = await apiFetch(fetchImpl, '/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ provider, callbackURL }),
        });
        const body = await res.json() as { url?: string; message?: string; error?: { message?: string } };
        if (res.ok && body.url) {
            location.assign(body.url);
            return;
        }
        session.error = body.message || body.error?.message || 'Sign-in is not available.';
    } catch {
        session.error = 'Sign-in is not available.';
    }
}

export type SignOutResult = { ok: true } | { ok: false; code: string; message: string };

/**
 * Ends the session. The user is signed out even when the request fails.
 * A 403 `passkey_required` is returned as the server sent it, and the local session stays.
 */
export async function signOut(fetchImpl: typeof fetch = fetch): Promise<SignOutResult> {
    try {
        const res = await apiFetch(fetchImpl, '/api/auth/sign-out', { method: 'POST' });
        if (!res.ok) {
            const failure = await failureFrom(res);
            if (failure?.code === 'passkey_required') {
                session.gate = 'recovery';
                return { ok: false, code: failure.code, message: failure.message };
            }
        }
    } catch {
        // The local session still ends.
    }
    session.user = null;
    session.error = '';
    session.allowance = null;
    session.gate = 'signed-out';
    once = null;
    asked = null;
    epoch += 1;
    return { ok: true };
}
