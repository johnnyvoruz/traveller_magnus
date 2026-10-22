/**
 * Agent tokens for the signed-in account (spec_session_ingest.md §2, SI2).
 * List, make, and revoke. The token text is only in the make answer.
 */
import { AccessTokenCreate, AccessTokenCreated, AccessTokenList } from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';
import { parseRead } from '../campaign/read.ts';
import { transport } from '../campaign/store.ts';

type TokenCreateBody = ReturnType<typeof AccessTokenCreate.parse>;
type TokenCreated = ReturnType<typeof AccessTokenCreated.parse>;
type TokenRow = TokenCreated['row'];

/** Live tokens, and tokens revoked in the last 30 days. Never the token text. */
export async function listTokens(): Promise<TokenRow[]> {
    const res = await apiFetch(transport.fetch, '/api/tokens');
    if (!res.ok) return [];
    return parseRead(AccessTokenList, (await res.json()).data).items;
}

/** Makes a token. The text is in this answer only. */
export async function makeToken(body: TokenCreateBody): Promise<TokenCreated | null> {
    const parsed = AccessTokenCreate.safeParse(body);
    if (!parsed.success) return null;
    const res = await apiFetch(transport.fetch, '/api/tokens', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
    });
    if (!res.ok) return null;
    return parseRead(AccessTokenCreated, (await res.json()).data);
}

/** Revokes a token. The same answer when it is already revoked. */
export async function revokeToken(id: string): Promise<boolean> {
    const res = await apiFetch(transport.fetch, `/api/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.ok;
}
