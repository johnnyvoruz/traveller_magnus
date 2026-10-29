/**
 * Playing in someone else's campaign (players_build_plan.md P3).
 * The store keeps the rows. This file is the membership calls around that read.
 */
import {
    JoinClaim,
    JoinPreview,
    PlayerInvite,
    PlayerList,
    PlayerPerson,
    PlayingList,
} from '@voyage/shared';
import { session } from '../account/session.ts';
import { apiFetch } from '../platform/http.ts';
import { parseRead } from './read.ts';
import { campaign, loadPlayerPages, markMembershipGone, noteUnauthorized, pinTruthVersion, transport } from './store.ts';

function universePath(suffix: string): string | null {
    if (!campaign.universeId) return null;
    return `/api/universes/${encodeURIComponent(campaign.universeId)}${suffix}`;
}

async function readOk(res: Response): Promise<unknown | null> {
    if (res.status === 401) {
        noteUnauthorized();
        return null;
    }
    if (!res.ok) return null;
    const body = await res.json() as { data?: unknown };
    return body.data ?? null;
}

/** One campaign this account plays in, from a fresh playing list. Null when the list fails or the id is not on it. */
export async function findPlaying(id: string): Promise<PlayingList['items'][number] | null> {
    const items = await loadPlaying();
    if (!items) return null;
    return items.find((row) => row.id === id) ?? null;
}

/** Campaigns this account plays in. A 401 signs the store out. A failed list returns null. */
export async function loadPlaying(): Promise<PlayingList['items'] | null> {
    const res = await apiFetch(transport.fetch, '/api/me/playing');
    const data = await readOk(res);
    if (data === null && !res.ok) return null;
    const list = parseRead(PlayingList, data);
    campaign.playing = list.items;
    return list.items;
}

/**
 * Opens one campaign from the playing list and pins the map to that campaign's chart.
 * The read is the players page. An id that is not in the list does not open.
 */
export async function openPlaying(id: string): Promise<void> {
    const item = campaign.playing.find((row) => row.id === id);
    if (!item) return;
    pinTruthVersion(item.truthVersion);
    await loadPlayerPages(id);
}

/** Claims an invite. The answer is the campaign id, its name and the player role. */
export async function join(token: string): Promise<JoinClaim | null> {
    const res = await apiFetch(transport.fetch, '/api/join', {
        method: 'POST',
        body: JSON.stringify({ token }),
    });
    const data = await readOk(res);
    if (data === null) return null;
    return parseRead(JoinClaim, data);
}

/** The invite page's name and referee, before anyone joins. */
export async function invitePreview(token: string): Promise<JoinPreview | null> {
    const res = await apiFetch(transport.fetch, `/api/join/${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    return parseRead(JoinPreview, (await res.json() as { data?: unknown }).data);
}

/** The referee's live invite. One campaign, one link. */
export async function createInvite(): Promise<PlayerInvite | null> {
    const path = universePath('/players/invite');
    if (!path) return null;
    const res = await apiFetch(transport.fetch, path, { method: 'POST' });
    const data = await readOk(res);
    if (data === null) return null;
    return parseRead(PlayerInvite, data);
}

/**
 * The live invite after a reload (DU33; contracts/b_players.md "Invite link, read"): the url and the
 * expiry, or null when there is none, the read fails, or the body is not the link's shape. The read
 * sends no uses count. A 401 signs the store out, as every read does.
 */
export async function readInvite(): Promise<{ url: string; expiresAt: string } | null> {
    const path = universePath('/invite');
    if (!path) return null;
    let res: Response;
    try {
        res = await apiFetch(transport.fetch, path);
    } catch {
        return null;
    }
    const data = await readOk(res);
    if (!data || typeof data !== 'object') return null;
    const link = (data as { link?: unknown }).link;
    if (!link || typeof link !== 'object') return null;
    const { url, expiresAt } = link as { url?: unknown; expiresAt?: unknown };
    if (typeof url !== 'string' || !url || typeof expiresAt !== 'string') return null;
    return { url, expiresAt };
}

/** Revokes the live invite. */
export async function revokeInvite(): Promise<boolean> {
    const path = universePath('/players/invite');
    if (!path) return false;
    const res = await apiFetch(transport.fetch, path, { method: 'DELETE' });
    const data = await readOk(res);
    return data !== null;
}

/** Playing and archived members. The referee's list. */
export async function listPlayers(): Promise<PlayerList | null> {
    const path = universePath('/players');
    if (!path) return null;
    const res = await apiFetch(transport.fetch, path);
    const data = await readOk(res);
    if (data === null) return null;
    return parseRead(PlayerList, data);
}

/**
 * Leaves the open campaign. The server archives this account.
 * The store then clears and becomes `gone`.
 */
export async function leave(): Promise<boolean> {
    const who = session.user?.id;
    const path = who ? universePath(`/players/${encodeURIComponent(who)}`) : null;
    if (!path) return false;
    const res = await apiFetch(transport.fetch, path, { method: 'DELETE' });
    const data = await readOk(res);
    if (data === null) return false;
    markMembershipGone();
    return true;
}

/** Which person this player is, or null when they have not chosen. */
export async function setPerson(personId: string | null): Promise<PlayerPerson | null> {
    const path = universePath('/players/me');
    if (!path) return null;
    const res = await apiFetch(transport.fetch, path, {
        method: 'PATCH',
        body: JSON.stringify({ personId }),
    });
    const data = await readOk(res);
    if (data === null) return null;
    return parseRead(PlayerPerson, data);
}
