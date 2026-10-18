/**
 * Passkey sign-in for the screens. Loaded by a dynamic import of the two libraries,
 * so neither is in the first chunk. Recovery codes are returned to the caller and stored nowhere.
 *
 * The contract's sample names `window`. This file uses `globalThis`: the manifesto forbids `window`.
 */
import { enterRecovery, reloadSession, session } from './session.ts';

export type AuthFailure = { ok: false; code: string; message: string };
export type AuthResult<T> = ({ ok: true } & T) | AuthFailure;

export const CEREMONY_CANCELLED = 'ceremony_cancelled';
export const CEREMONY_CANCELLED_MESSAGE = 'You closed the passkey prompt.';
export const PASSKEY_UNAVAILABLE = 'passkey_unavailable';
export const PASSKEY_UNAVAILABLE_MESSAGE = 'This browser cannot create a passkey.';
const NETWORK = 'network';
const NETWORK_MESSAGE = 'The server could not be reached. Try again.';
const UNREADABLE = 'unreadable';
const UNREADABLE_MESSAGE = 'The answer could not be read.';

export type PasskeyRow = { id: string; name: string; createdAt: string | null };

/** Contract codes. Anything else from a ceremony is a library sentence and is not shown. */
const SERVER_CODES = new Set([
    'username_invalid', 'username_reserved', 'username_taken',
    'recovery_shown', 'recovery_invalid', 'recovery_limit',
    'session_required', 'signup_limit', 'passkey_required',
    'last_passkey', 'last_provider', 'auth_unconfigured', 'session_failed',
    'passkey_unavailable', 'PROVIDER_NOT_FOUND',
]);
const CEREMONY_FAILED = 'ceremony_failed';
const CEREMONY_FAILED_MESSAGE = 'The passkey could not be used. Try again.';
export type LinkedAccount = { id: string; providerId: string };

type CeremonyError = { code?: string; message?: string; name?: string; cause?: unknown };
type Ceremony = { data: { user?: { username?: string | null } | null } | null; error: CeremonyError | null };
type PasskeyApi = {
    signIn: { passkey: (opts?: object) => Promise<Ceremony> };
    passkey: { addPasskey: (opts?: { name?: string; createSession?: boolean }) => Promise<Ceremony> };
};

let fetchImpl: typeof fetch = fetch;
let clientPromise: Promise<PasskeyApi> | null = null;
let loader: () => Promise<PasskeyApi> = loadReal;

/** Tests replace the library. Pass null to restore the real client. */
export function _loadPasskeyClientForTests(next: (() => Promise<PasskeyApi>) | null): void {
    clientPromise = null;
    loader = next ?? loadReal;
}

/** Tests replace fetch. Pass null to restore the page fetch. */
export function _fetchForTests(next: typeof fetch | null): void {
    fetchImpl = next ?? fetch;
}

async function loadReal(): Promise<PasskeyApi> {
    const [{ createAuthClient }, { passkeyClient }] = await Promise.all([
        import('better-auth/client'),
        import('@better-auth/passkey/client'),
    ]);
    const origin = globalThis.location?.origin ?? '';
    return createAuthClient({ baseURL: origin, plugins: [passkeyClient()] }) as unknown as PasskeyApi;
}

async function client(): Promise<PasskeyApi> {
    if (!clientPromise) {
        const pending = loader();
        clientPromise = pending;
        pending.catch(() => {
            if (clientPromise === pending) clientPromise = null;
        });
    }
    return clientPromise;
}

/** True when this browser can run a passkey ceremony. Call it before one starts. */
export function passkeySupported(): boolean {
    const credentials = globalThis.navigator?.credentials as { create?: unknown; get?: unknown } | undefined;
    return typeof credentials?.create === 'function' && typeof credentials?.get === 'function';
}

function unavailable(): AuthFailure {
    return { ok: false, code: PASSKEY_UNAVAILABLE, message: PASSKEY_UNAVAILABLE_MESSAGE };
}

function unreadable(): AuthFailure {
    return { ok: false, code: UNREADABLE, message: UNREADABLE_MESSAGE };
}

function cancelled(error: unknown): boolean {
    const seen = new Set<unknown>();
    const walk = (value: unknown): boolean => {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        const row = value as { name?: unknown; code?: unknown; cause?: unknown };
        if (row.name === 'NotAllowedError' || row.name === 'AbortError') return true;
        if (row.code === 'ERROR_CEREMONY_ABORTED' || row.code === 'AUTH_CANCELLED' || row.code === 'NotAllowedError' || row.code === 'AbortError') return true;
        return walk(row.cause);
    };
    return walk(error);
}

/**
 * better-auth's sign-in drops the cause of `@simplewebauthn/browser`'s wrap.
 * What arrives is `{ code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'Auth cancelled' }`.
 */
function closedPrompt(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    return (error as { message?: unknown }).message === 'Auth cancelled';
}

function ceremonyFailure(error: unknown): AuthFailure {
    if (cancelled(error) || closedPrompt(error)) {
        return { ok: false, code: CEREMONY_CANCELLED, message: CEREMONY_CANCELLED_MESSAGE };
    }
    const row = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
    const code = typeof row.code === 'string' ? row.code : '';
    const message = typeof row.message === 'string' ? row.message : '';
    if (code && message && SERVER_CODES.has(code)) return { ok: false, code, message };
    return { ok: false, code: CEREMONY_FAILED, message: CEREMONY_FAILED_MESSAGE };
}

function failureOf(body: unknown): AuthFailure | null {
    if (!body || typeof body !== 'object') return null;
    const row = body as { code?: unknown; message?: unknown; error?: { code?: unknown; message?: unknown } };
    const nested = row.error && typeof row.error === 'object' ? row.error : null;
    const code = typeof row.code === 'string' ? row.code : typeof nested?.code === 'string' ? nested.code : '';
    if (!code) return null;
    const message = typeof row.message === 'string' ? row.message : typeof nested?.message === 'string' ? nested.message : '';
    return { ok: false, code, message };
}

async function call(path: string, init?: RequestInit): Promise<{ ok: true; body: unknown } | AuthFailure> {
    let res: Response;
    try {
        res = await fetchImpl(path, { ...init, credentials: 'include' });
    } catch {
        return { ok: false, code: NETWORK, message: NETWORK_MESSAGE };
    }
    const text = await res.text().catch(() => '');
    let body: unknown = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            return unreadable();
        }
    }
    if (!res.ok) {
        const failure = failureOf(body) ?? unreadable();
        if (failure.code === 'passkey_required') enterRecovery();
        return failure;
    }
    return { ok: true, body };
}

function post(path: string, body?: unknown): Promise<{ ok: true; body: unknown } | AuthFailure> {
    return call(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? '{}' : JSON.stringify(body),
    });
}

function codesOf(body: unknown): string[] | null {
    if (!body || typeof body !== 'object') return null;
    const codes = (body as { codes?: unknown }).codes;
    if (!Array.isArray(codes) || codes.length !== 10 || !codes.every((item) => typeof item === 'string')) return null;
    return codes;
}

async function reveal(): Promise<AuthResult<{ codes: string[] }>> {
    const done = await post('/api/auth/recovery/reveal');
    if (!done.ok) return done;
    const codes = codesOf(done.body);
    if (!codes) return unreadable();
    return { ok: true, codes };
}

async function runCeremony(run: (api: PasskeyApi) => Promise<Ceremony>): Promise<Ceremony | AuthFailure> {
    if (!passkeySupported()) return unavailable();
    try {
        return await run(await client());
    } catch (error) {
        return ceremonyFailure(error);
    }
}

/** Sign up while signed out. `name` is the username. The ten codes come back once, on this result only. */
export async function signUp(username: string): Promise<AuthResult<{ codes: string[] }>> {
    const made = await runCeremony((api) => api.passkey.addPasskey({ name: username, createSession: true }));
    if ('ok' in made) return made;
    if (made.error) return ceremonyFailure(made.error);
    const shown = await reveal();
    await reloadSession(fetchImpl);
    return shown;
}

/** Sign in with a passkey. A change of account clears the held allowance until GET /api/me answers. */
export async function signInWithPasskey(): Promise<AuthResult<{ username: string | null }>> {
    const made = await runCeremony((api) => api.signIn.passkey());
    if ('ok' in made) return made;
    if (made.error) return ceremonyFailure(made.error);
    const username = typeof made.data?.user?.username === 'string' ? made.data.user.username : null;
    await reloadSession(fetchImpl);
    return { ok: true, username };
}

/**
 * Redeem one recovery code. The session can only add a passkey: `session.gate` becomes `recovery`.
 * GET /api/me is not called. The screen routes on the redeem body and on `session.gate`.
 */
export async function redeemRecovery(username: string, code: string): Promise<AuthResult<{ mustAddPasskey: true }>> {
    const done = await post('/api/auth/recovery/redeem', { username, code });
    if (!done.ok) return done;
    const flag = done.body && typeof done.body === 'object' ? (done.body as { mustAddPasskey?: unknown }).mustAddPasskey : null;
    if (flag !== true) return unreadable();
    enterRecovery();
    return { ok: true, mustAddPasskey: true };
}

/**
 * Add a passkey. On a recovery session this is the call that finishes it, and no codes are revealed.
 * The first passkey on an account that has none reveals the ten codes once.
 */
export async function addPasskey(name: string): Promise<AuthResult<{ codes: string[] | null }>> {
    const revealNow = session.gate !== 'recovery' && (!session.user || !session.user.hasPasskey);
    const made = await runCeremony((api) => api.passkey.addPasskey({ name, createSession: true }));
    if ('ok' in made) return made;
    if (made.error) return ceremonyFailure(made.error);
    if (!revealNow) {
        await reloadSession(fetchImpl);
        return { ok: true, codes: null };
    }
    const shown = await reveal();
    await reloadSession(fetchImpl);
    if (!shown.ok) return shown;
    return { ok: true, codes: shown.codes };
}

export async function listPasskeys(): Promise<AuthResult<{ passkeys: PasskeyRow[] }>> {
    const done = await call('/api/auth/passkey/list-user-passkeys');
    if (!done.ok) return done;
    if (!Array.isArray(done.body)) return unreadable();
    const passkeys: PasskeyRow[] = [];
    for (const item of done.body) {
        if (!item || typeof item !== 'object') return unreadable();
        const row = item as { id?: unknown; name?: unknown };
        if (typeof row.id !== 'string') return unreadable();
        const created = (item as { createdAt?: unknown }).createdAt;
        passkeys.push({
            id: row.id,
            name: typeof row.name === 'string' ? row.name : '',
            createdAt: typeof created === 'string' ? created : null,
        });
    }
    return { ok: true, passkeys };
}

export async function renamePasskey(id: string, name: string): Promise<AuthResult<{ passkey: PasskeyRow }>> {
    const done = await post('/api/auth/passkey/update-passkey', { id, name });
    if (!done.ok) return done;
    const passkey = done.body && typeof done.body === 'object' ? (done.body as { passkey?: unknown }).passkey : null;
    if (!passkey || typeof passkey !== 'object') return unreadable();
    const row = passkey as { id?: unknown; name?: unknown; createdAt?: unknown };
    if (typeof row.id !== 'string' || typeof row.name !== 'string') return unreadable();
    return {
        ok: true,
        passkey: { id: row.id, name: row.name, createdAt: typeof row.createdAt === 'string' ? row.createdAt : null },
    };
}

export async function removePasskey(id: string): Promise<{ ok: true } | AuthFailure> {
    const done = await post('/api/auth/passkey/delete-passkey', { id });
    if (!done.ok) return done;
    const status = done.body && typeof done.body === 'object' ? (done.body as { status?: unknown }).status : null;
    if (status !== true) return unreadable();
    await reloadSession(fetchImpl);
    return { ok: true };
}

export async function regenerateRecoveryCodes(): Promise<AuthResult<{ codes: string[] }>> {
    const done = await post('/api/auth/recovery/regenerate');
    if (!done.ok) return done;
    const codes = codesOf(done.body);
    if (!codes) return unreadable();
    await reloadSession(fetchImpl);
    return { ok: true, codes };
}

export async function setUsername(username: string): Promise<AuthResult<{ username: string }>> {
    const done = await post('/api/auth/username', { username });
    if (!done.ok) return done;
    const stored = done.body && typeof done.body === 'object' ? (done.body as { username?: unknown }).username : null;
    if (typeof stored !== 'string') return unreadable();
    await reloadSession(fetchImpl);
    return { ok: true, username: stored };
}

export async function listLinkedAccounts(): Promise<AuthResult<{ accounts: LinkedAccount[] }>> {
    const done = await call('/api/auth/list-accounts');
    if (!done.ok) return done;
    if (!Array.isArray(done.body)) return unreadable();
    const accounts: LinkedAccount[] = [];
    for (const item of done.body) {
        if (!item || typeof item !== 'object') return unreadable();
        const row = item as { id?: unknown; providerId?: unknown };
        if (typeof row.id !== 'string' || typeof row.providerId !== 'string') return unreadable();
        accounts.push({ id: row.id, providerId: row.providerId });
    }
    return { ok: true, accounts };
}

export async function unlinkAccount(accountId: string): Promise<{ ok: true } | AuthFailure> {
    const done = await post('/api/auth/unlink-account', { accountId });
    if (!done.ok) return done;
    await reloadSession(fetchImpl);
    return { ok: true };
}

/**
 * Start Google, Discord, or X. `twitter` is X. The screen assigns `url`.
 * This is `POST /api/auth/sign-in/social` with `disableRedirect: true`.
 * The redirect form used by the claim page stays `signIn` in `session.ts`.
 */
export async function startSocial(provider: string): Promise<AuthResult<{ url: string }>> {
    const done = await post('/api/auth/sign-in/social', { provider, disableRedirect: true });
    if (!done.ok) return done;
    const url = done.body && typeof done.body === 'object' ? (done.body as { url?: unknown }).url : null;
    if (typeof url !== 'string' || !url) return unreadable();
    return { ok: true, url };
}

/**
 * Link Google, Discord, or X to the account that is already signed in.
 * `POST /api/auth/link-social` with `{ provider, disableRedirect: true, callbackURL }`.
 * Success is `{ ok: true, url }`. The screen assigns `url`. This function does not navigate.
 * A refusal, including a provider already linked to another account, keeps the server's code and sentence.
 */
export async function linkProvider(provider: string, callbackURL: string): Promise<AuthResult<{ url: string }>> {
    const done = await post('/api/auth/link-social', { provider, disableRedirect: true, callbackURL });
    if (!done.ok) return done;
    const url = done.body && typeof done.body === 'object' ? (done.body as { url?: unknown }).url : null;
    if (typeof url !== 'string' || !url) return unreadable();
    return { ok: true, url };
}
