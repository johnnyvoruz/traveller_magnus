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
/** The only provider in this slice (directives/slice_2_campaign.md, J1). */
export const SIGN_IN_LABEL = 'Sign in with X';

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
