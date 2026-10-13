/** Sentences a person can read. Google developer documentation style. */

export const USERNAME_INVALID = 'Use 3 to 24 letters, digits, or underscores.';
export const USERNAME_RESERVED = 'That username is reserved.';
export const USERNAME_TAKEN = 'That username is taken.';
export const SIGNUP_LIMIT = 'You can start 5 passkey sign-ups an hour from this network. Try again later.';
export const SIGNUP_SESSION = 'Sign-up has to create a session after the passkey is verified.';
export const PASSKEY_REQUIRED = 'Add a passkey before you use the rest of this account.';
export const PASSKEY_UNAVAILABLE = 'Passkey sign-in is not available yet.';
export const PROVIDER_ALREADY_LINKED = 'That provider is already linked to another account.';
export const LAST_PASSKEY = 'This passkey is the only way to sign in. Add another passkey, or link Google, Discord, or X, before you remove it.';
export const LAST_PROVIDER = 'This is the only linked provider on an account with no passkey. Add a passkey before you unlink it.';
export const RECOVERY_INVALID = 'That recovery code is not valid.';
export const RECOVERY_LIMIT = 'Too many incorrect recovery codes. Try again in 15 minutes.';
export const RECOVERY_SHOWN = 'These recovery codes have already been shown.';

const RESERVED = new Set(['admin', 'api', 'support', 'user']);

export type UsernameVerdict =
    | { ok: true; username: string }
    | { ok: false; code: 'username_invalid' | 'username_reserved'; message: string };

/** Letters, digits, and underscore. Case is ignored. 3 to 24 characters. */
export function judgeUsername(raw: unknown): UsernameVerdict {
    if (typeof raw !== 'string') return { ok: false, code: 'username_invalid', message: USERNAME_INVALID };
    const username = raw.toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return { ok: false, code: 'username_invalid', message: USERNAME_INVALID };
    if (RESERVED.has(username)) return { ok: false, code: 'username_reserved', message: USERNAME_RESERVED };
    return { ok: true, username };
}

export function usernameAllowed(value: string): boolean {
    return judgeUsername(value).ok;
}
