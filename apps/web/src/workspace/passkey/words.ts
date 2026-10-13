/**
 * Words and small readings for the passkey screens: the sign-in card, the recovery codes, the
 * account page and the recovery-session screen (findings/passkey_screens_design.md). It runs
 * under Node; the calls are Lane A's, in account/passkey.ts.
 */
import { shallowRef } from 'vue';

export const PASSKEY_EXPLAIN = 'A passkey signs you in with your fingerprint, face, or device PIN. There is no password.';
export const PASSKEY_WAITING = 'Waiting for your passkey…';
export const PASSKEY_CLOSED = 'You closed the passkey prompt.';
export const SIGN_IN_PASSKEY = 'Sign in with a passkey';
export const CREATE_ACCOUNT = 'Create an account';
export const USERNAME_HINT = '3 to 24 letters, digits, or underscores. Other people see this name.';
export const LOST_PASSKEY = 'I lost my passkey';
export const RECOVER_HEADING = 'Sign in with a recovery code';
export const RECOVER_LEAD = 'Enter your username and one of the recovery codes you saved when you made the account.';
export const OTHER_ACCOUNTS = 'Or sign in with another account';
export const NO_WEBAUTHN_PROVIDERS = 'This browser can’t use passkeys. Sign in with another account instead.';
export const NO_WEBAUTHN_ALONE = 'This browser can’t use passkeys. Open this page in a browser that can.';
/** The account is lost when every way in is lost: said once where the codes are shown, and once by the passkey list. */
export const LOST_MEANS_LOST = 'If you lose your passkeys, these codes, and every linked account, this account can’t be recovered.';
export const CODES_HEADING = 'Save your recovery codes';
export const CODES_LEAD = 'If you can’t use your passkey, sign in with one of these codes. Each code works once. This is the only time they’re shown, so save them now: copy them into a password manager, or download the file.';
export const CODES_SAVED = 'I saved these codes';
export const NUDGE_HEADING = 'Add a second passkey';
export const NUDGE_LEAD = 'Add a passkey on another device, such as your phone, so you can still sign in if you lose this one.';
export const ONE_PASSKEY = 'You have one passkey. Add another on a second device so you can still sign in if you lose this one.';
export const NO_PASSKEY = 'You don’t have a passkey yet.';
export const LAST_PASSKEY_SAY = 'This is your only way to sign in. Add another passkey before you remove it.';
export const LAST_PROVIDER_SAY = 'This is your only way to sign in. Add a passkey before you unlink it.';
export const NEW_CODES_ASK = 'Your current codes stop working when you make new ones.';
export const RECOVERY_HEADING = 'Add a passkey to finish';
export const RECOVERY_USED = 'You signed in with a recovery code. That code is used up.';
export const RECOVERY_DO = 'Add a passkey to finish. Until you do, you can’t use the rest of this account.';
export const PASSKEY_ADDED = 'Passkey added.';
export const NEW_CODES_OFFER = 'Make new codes if you think someone else has seen yours.';
export const CODES_FILE = 'traveller-voyage-recovery-codes.txt';
/** A sentence for a failure that came with none: a network fault, or an answer that could not be read. */
export const NOT_REACHED = 'The server could not be reached. Try again.';

/** The contract's username refusals (contracts/b_auth.md, Username), used for the check as typed. */
export const USERNAME_INVALID = 'Use 3 to 24 letters, digits, or underscores.';
export const USERNAME_RESERVED = 'That username is reserved.';
const RESERVED = ['admin', 'api', 'support', 'user'];

/**
 * The username checked in the browser, before any request. `typing` is true while the field
 * still has focus: a name that is only too short is not refused until the person is done.
 */
export function usernameProblem(value: string, typing = false): string {
    const name = value.trim();
    if (name === '') return '';
    if (!/^[A-Za-z0-9_]*$/.test(name) || name.length > 24) return USERNAME_INVALID;
    if (name.length < 3) return typing ? '' : USERNAME_INVALID;
    if (RESERVED.includes(name.toLowerCase())) return USERNAME_RESERVED;
    return '';
}

/** The server codes whose sentence belongs at the username field rather than under the button. */
export function atUsername(code: string): boolean {
    return code === 'username_invalid' || code === 'username_reserved' || code === 'username_taken';
}

/**
 * When a passkey was added, in the house form for a real-world date (YYYY-MM-DD, as a journal
 * entry's Played date), in the person's own time zone. Empty when the date can't be read.
 */
export function addedOn(value: string | null | undefined): string {
    if (!value) return '';
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return '';
    const two = (n: number): string => String(n).padStart(2, '0');
    return 'Added ' + at.getFullYear() + '-' + two(at.getMonth() + 1) + '-' + two(at.getDate());
}

/** How many recovery codes are left, as a sentence. */
export function unusedWords(n: number): string {
    if (n <= 0) return 'You have no unused recovery codes. Make new ones so you can still sign in if you lose your passkeys.';
    return n + ' of 10 recovery codes ' + (n === 1 ? 'is' : 'are') + ' unused.';
}

/** The text file a person downloads: whose codes, when, the codes, and what they are for. */
export function codesFile(username: string, codes: readonly string[], at: Date = new Date()): string {
    const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const lines = ['Traveller.voyage recovery codes'];
    if (username) lines.push('Username: ' + username);
    lines.push(
        'Made: ' + day,
        '',
        ...codes,
        '',
        'Each code works once. If you can’t use your passkey, choose "I lost my passkey" on the sign-in card and enter your username and one code.',
        LOST_MEANS_LOST,
        '',
    );
    return lines.join('\n');
}

/**
 * The last way in: a passkey can't be removed when it is the only one and no provider is
 * linked, and a provider can't be unlinked when it is the only one and there is no passkey.
 */
export function lastPasskey(passkeys: number, providers: number): boolean {
    return passkeys === 1 && providers === 0;
}
export function lastProvider(passkeys: number, providers: number): boolean {
    return passkeys === 0 && providers === 1;
}

/** The provider's own name. `twitter` is X. */
export function providerName(id: string): string {
    if (id === 'twitter') return 'X';
    if (id === 'discord') return 'Discord';
    if (id === 'google') return 'Google';
    return id;
}

// ---- Codes on their way to the screen that shows them -----------------------------------

/**
 * The codes of a new account, handed from the sign-in card to the account page. Memory only:
 * never storage, never a log. The page takes them and this is emptied.
 */
export const heldCodes = shallowRef<{ username: string; codes: string[] } | null>(null);

export function takeCodes(): { username: string; codes: string[] } | null {
    const held = heldCodes.value;
    heldCodes.value = null;
    return held;
}

// ---- The recovery session: its own small module, so the first chunk can hold the guard ------

export { guardRecovery, RECOVERY_PATH, recoveryRedirect } from './recovery.ts';
