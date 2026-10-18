/**
 * The referee's calls on a player (players_build_plan.md P5; contracts/b_players.md routes): Archive,
 * Bring back, and which person in the party a player is. The invite and the list are A's
 * (campaign/membership.ts). Each answer keeps the server's own message, so a refusal ("This campaign
 * has 255 players, the most it can have.") is said as the server said it.
 */
import { PlayerPerson, PlayerStatus } from '@voyage/shared';
import { parseRead } from '../../campaign/read.ts';
import { campaign, noteUnauthorized, transport } from '../../campaign/store.ts';
import { apiFetch } from '../../platform/http.ts';

/** What a call came to: its data, or the sentence to show. */
export type CallResult<T> = { ok: true; data: T } | { ok: false; message: string };

const FALLBACK = 'That did not work. Try again.';

/** The sentence a failed answer carries, or a plain one when it carries none. */
export async function failWords(res: Response): Promise<string> {
    try {
        const body = await res.json() as { error?: { message?: unknown } };
        const message = body && body.error ? body.error.message : null;
        return typeof message === 'string' && message.trim() ? message : FALLBACK;
    } catch {
        return FALLBACK;
    }
}

async function call<T>(suffix: string, init: RequestInit, schema: { parse(data: unknown): T } | null): Promise<CallResult<T | null>> {
    if (!campaign.universeId) return { ok: false, message: FALLBACK };
    const path = `/api/universes/${encodeURIComponent(campaign.universeId)}${suffix}`;
    let res: Response;
    try {
        res = await apiFetch(transport.fetch, path, init);
    } catch {
        return { ok: false, message: 'You seem to be offline. Try again when you are back.' };
    }
    if (res.status === 401) {
        noteUnauthorized();
        return { ok: false, message: 'Sign in to continue.' };
    }
    if (!res.ok) return { ok: false, message: await failWords(res) };
    if (!schema) return { ok: true, data: null };
    const body = await res.json() as { data?: unknown };
    return { ok: true, data: parseRead(schema, body.data) };
}

const member = (userId: string): string => '/players/' + encodeURIComponent(userId);

/** Archive: the player's access ends at once; the row stays, so they can be brought back. */
export function archiveMember(userId: string): Promise<CallResult<null>> {
    return call(member(userId), { method: 'DELETE' }, null) as Promise<CallResult<null>>;
}

/** Bring back an archived player. */
export function bringBack(userId: string): Promise<CallResult<PlayerStatus | null>> {
    return call(member(userId), { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }, PlayerStatus);
}

/** Which person in the party this player is; null for none yet. */
export function setMemberPerson(userId: string, personId: string | null): Promise<CallResult<PlayerPerson | null>> {
    return call(member(userId), { method: 'PATCH', body: JSON.stringify({ personId }) }, PlayerPerson);
}
