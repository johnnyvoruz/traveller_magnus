/**
 * Words and small readings for the account pop-up and the signed-out Campaign panel
 * (findings/campaign_workspace_design.md §1). Pure: it runs under Node.
 */
import type { SessionUser } from '../account/session.ts';

/** What an account is for, in one sentence. The second says the viewer needs none. */
export const SIGN_IN_PITCH = 'Keep a private campaign on top of this map: people, places, jobs, your ship.';
export const SIGN_IN_FREE = 'The map works the same without an account.';
export const SIGN_IN_FINE = 'Nothing you add changes the map, and nobody else sees it.';
export const SIGN_IN_OFFLINE = 'You are offline.';
/** X alone, as before: what the card offers when the server does not say which providers it has. */
export const SIGN_IN_LABEL = 'Sign in with X';

/** better-auth's provider ids (apps/api/src/auth/options.ts), in the order the card offers them. */
export type SignInProvider = { id: 'twitter' | 'discord' | 'google'; name: string; label: string; opening: string };
export const SIGN_IN_PROVIDERS: readonly SignInProvider[] = [
    { id: 'twitter', name: 'X', label: SIGN_IN_LABEL, opening: 'Opening X…' },
    { id: 'discord', name: 'Discord', label: 'Sign in with Discord', opening: 'Opening Discord…' },
    { id: 'google', name: 'Google', label: 'Sign in with Google', opening: 'Opening Google…' },
];

/** Where the card asks which providers the server has switched on (`SignInProviders` in packages/shared). */
export const SIGN_IN_PROVIDERS_URL = '/api/providers';

/**
 * The providers to offer, from the ids the server lists. Ids the card does not know are
 * dropped. A null list (the route is missing or failed) is X alone, which is today's card.
 */
export function offeredProviders(ids: readonly string[] | null): SignInProvider[] {
    if (ids === null) return [SIGN_IN_PROVIDERS[0]];
    return SIGN_IN_PROVIDERS.filter((item) => ids.includes(item.id));
}

/** The server's list of provider ids, or null when it cannot be had. Never throws. */
export async function readProviders(fetchImpl: (url: string) => Promise<Response>): Promise<string[] | null> {
    try {
        const res = await fetchImpl(SIGN_IN_PROVIDERS_URL);
        if (!res.ok) return null;
        const body = await res.json() as { data?: unknown };
        const flags = body ? body.data : null;
        if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return null;
        // One flag a provider: true means the server has it registered.
        return Object.entries(flags as Record<string, unknown>).filter((entry) => entry[1] === true).map((entry) => entry[0]);
    } catch {
        return null;
    }
}

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** The name shown for a signed-in user: the display name, else the handle, else the e-mail, else a plain word. */
export function displayName(user: SessionUser | null): string {
    if (!user) return '';
    const profile = user.profile;
    return clean(profile && profile.displayName) || clean(profile && profile.handle) || clean(user.email) || 'Signed in';
}

/** The line under the name: the handle with its @, else the e-mail; empty when it would repeat the name. */
export function accountLine(user: SessionUser | null): string {
    if (!user) return '';
    const handle = clean(user.profile && user.profile.handle);
    const line = handle ? '@' + handle.replace(/^@+/, '') : clean(user.email);
    return line === displayName(user) ? '' : line;
}

/** One or two capitals for the rail's button: the first letters of the first two words of the name. */
export function initials(user: SessionUser | null): string {
    // An e-mail address stands for its part before the @.
    const name = displayName(user).replace(/^@+/, '').replace(/@.*$/, '');
    const words = name.split(/[\s._-]+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
    if (words.length === 0) return '';
    const first = (word: string): string => {
        const found = /[\p{L}\p{N}]/u.exec(word);
        return found ? found[0].toUpperCase() : '';
    };
    if (words.length === 1) return first(words[0]);
    return first(words[0]) + first(words[1]);
}
