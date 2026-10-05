import { reactive } from 'vue';
import { apiFetch } from '../platform/http.ts';

export type SessionUser = {
    id: string;
    email: string | null;
    role: string;
    profile: { handle?: string; displayName?: string | null } | null;
};

/** The signed-in user, for any component. `error` is a failed sign-in only. A 401 leaves it blank. */
export const session = reactive({
    user: null as SessionUser | null,
    error: '',
});

let once: Promise<void> | null = null;

function readUser(body: unknown): SessionUser | null {
    if (!body || typeof body !== 'object') return null;
    const data = (body as { data?: unknown }).data;
    if (!data || typeof data !== 'object') return null;
    const row = data as Partial<SessionUser>;
    if (typeof row.id !== 'string') return null;
    return {
        id: row.id,
        email: typeof row.email === 'string' ? row.email : null,
        role: typeof row.role === 'string' ? row.role : 'user',
        profile: row.profile && typeof row.profile === 'object' ? row.profile : null,
    };
}

/**
 * One session read, after the map's first paint. Never throws.
 * 401 and any other failure are signed out, with no message.
 */
export function loadSession(fetchImpl: typeof fetch = fetch): Promise<void> {
    if (!once) once = pull(fetchImpl);
    return once;
}

async function pull(fetchImpl: typeof fetch): Promise<void> {
    try {
        const res = await apiFetch(fetchImpl, '/api/me');
        if (!res.ok) {
            session.user = null;
            return;
        }
        session.user = readUser(await res.json());
    } catch {
        session.user = null;
    }
}

/** The X sign-in call Account.vue used to make. A failure sets `session.error`. */
export async function signIn(fetchImpl: typeof fetch = fetch): Promise<void> {
    session.error = '';
    try {
        const res = await apiFetch(fetchImpl, '/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ provider: 'twitter', callbackURL: '/' }),
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

/** Ends the session. The user is signed out even when the request fails. No message. */
export async function signOut(fetchImpl: typeof fetch = fetch): Promise<void> {
    try {
        await apiFetch(fetchImpl, '/api/auth/sign-out', { method: 'POST' });
    } catch {
        // The local session still ends.
    }
    session.user = null;
    session.error = '';
}
