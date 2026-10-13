/**
 * Link Google, Discord, or X to the signed-in account (contracts/b_auth.md, "Linked providers"):
 * `POST /api/auth/link-social` with `{ provider, disableRedirect: true, callbackURL }`. Success is
 * the provider's address; the page then leaves for it and the callback returns to `callbackURL`.
 * `POST /api/auth/sign-in/social` (account/passkey.ts `startSocial`) would sign in as the
 * provider's account instead, so it is not used here. Lane A's client doesn't wrap this route
 * yet; when it does, the account page calls that and this file goes.
 */
import { apiFetch } from '../../platform/http.ts';
import { NOT_REACHED } from './words.ts';

export type LinkResult = { ok: true; url: string } | { ok: false; code: string; message: string };

export async function linkSocial(provider: string, callbackURL = '/account', fetchImpl: typeof fetch = fetch): Promise<LinkResult> {
    try {
        const res = await apiFetch(fetchImpl, '/api/auth/link-social', {
            method: 'POST',
            body: JSON.stringify({ provider, disableRedirect: true, callbackURL }),
        });
        const body = await res.json().catch(() => null) as { url?: unknown; code?: unknown; message?: unknown } | null;
        if (res.ok && body && typeof body.url === 'string' && body.url) return { ok: true, url: body.url };
        const code = body && typeof body.code === 'string' ? body.code : res.ok ? 'unreadable' : 'link_failed';
        const message = body && typeof body.message === 'string' && body.message ? body.message : NOT_REACHED;
        return { ok: false, code, message };
    } catch {
        return { ok: false, code: 'network', message: NOT_REACHED };
    }
}
