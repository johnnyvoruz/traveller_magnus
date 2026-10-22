/**
 * Agent access on the account page (SI3): whether the server takes tokens now, and the account's
 * tokens. A's `account/tokens.ts` makes and revokes; the list is read here so the screen can say
 * why there is none (agent access paused, or not available yet), in the server's own sentence.
 */
import { AccessTokenList } from '@voyage/shared';
import { parseRead } from '../../campaign/read.ts';
import { transport } from '../../campaign/store.ts';
import { apiFetch } from '../../platform/http.ts';

type TokenRow = ReturnType<typeof AccessTokenList.parse>['items'][number];

export type AccessState =
    | { kind: 'on'; items: TokenRow[] }
    | { kind: 'paused' | 'unavailable' | 'failed'; message: string };

export const PAUSED_WORDS = 'Agent access is paused on Traveller.voyage, so you can\'t make or use a token. To bring in a session without one, select Copy for your AI in the Campaign panel\'s menu, then paste your AI\'s reply into Proposals.';

/** Reads the token list, or why there is none. */
export async function readAccess(): Promise<AccessState> {
    let res: Response;
    try {
        res = await apiFetch(transport.fetch, '/api/tokens');
    } catch {
        return { kind: 'failed', message: 'Your tokens could not be loaded. You are offline.' };
    }
    if (res.ok) return { kind: 'on', items: parseRead(AccessTokenList, ((await res.json()) as { data?: unknown }).data).items };
    let code = '';
    let message = '';
    try {
        const body = await res.json() as { error?: { code?: unknown; message?: unknown } };
        code = typeof body?.error?.code === 'string' ? body.error.code : '';
        message = typeof body?.error?.message === 'string' ? body.error.message : '';
    } catch {
        // No envelope: the plain sentence below.
    }
    if (res.status === 503 && code === 'agents_paused') return { kind: 'paused', message: PAUSED_WORDS };
    if (res.status === 503) return { kind: 'unavailable', message: message || 'Agent access is not available yet.' };
    return { kind: 'failed', message: message || 'Your tokens could not be loaded. Try again.' };
}

/** A token is live until it is revoked or past its date. */
export function tokenLive(row: TokenRow, now: number): boolean {
    return !row.revokedAt && Date.parse(row.expiresAt) > now;
}

const SCOPE_WORDS: Record<string, string> = { 'campaign:read': 'reads the campaign', 'proposals:write': 'sends proposals' };

/** "Reads the campaign and sends proposals". */
export function scopeWords(scopes: readonly string[]): string {
    const words = scopes.map((scope) => SCOPE_WORDS[scope] ?? scope);
    const text = words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : words[0] ?? '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}
