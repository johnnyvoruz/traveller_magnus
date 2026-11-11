/**
 * The characters this member is tied to, in the browser (DS6; DS4b; Johnny 141). The server keeps the
 * tie (`universe_members.person_id`, a list since B's BM2a) and reads it on every append; B's BM3 route
 * `GET /api/universes/:id/players/me` answers `{ personId, personIds }` to a playing member. A player's
 * ship screens read it here: who presses, and, when the member holds several characters, which one is
 * picked on the page (the first by default). Empty, a player reads and acts on nothing.
 */
import { reactive } from 'vue';
import { PlayerSelf } from '@voyage/shared';
import { apiFetch } from '../../platform/http.ts';
import { transport } from '../../campaign/store.ts';

export const me = reactive({
    /** The ids of the party characters tied to this member, in the server's order. */
    personIds: [] as string[],
    /** The character picked on the page; empty is the first. */
    picked: '',
    /** The campaign the list was read for, so another campaign's list is never used. */
    universeId: '',
    /** The campaign whose list the server answered (BM2c): until then, an empty list is not yet "none". */
    readFor: '',
});

/** This member plays no character in the campaign, as the server said (BM2c; Johnny 141). */
export function playsNone(universeId: string | null): boolean {
    return !!universeId && me.readFor === universeId && me.personIds.length === 0;
}

export function myPersonIds(): readonly string[] {
    return me.personIds;
}

export function setMyPersonIds(ids: readonly string[]): void {
    me.personIds = [...ids];
    if (me.picked && !me.personIds.includes(me.picked)) me.picked = '';
}

export function isMine(personId: string): boolean {
    return me.personIds.includes(personId);
}

/** The character who presses: the one picked, else the first; empty with none. */
export function actingPerson(): string {
    return me.picked && me.personIds.includes(me.picked) ? me.picked : (me.personIds[0] ?? '');
}

export function pickPerson(personId: string): void {
    if (me.personIds.includes(personId)) me.picked = personId;
}

/** The route's answer as a list, or null when it can't be read. Pure. */
export function personIdsFrom(body: unknown): string[] | null {
    const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined;
    const parsed = PlayerSelf.safeParse(data);
    if (!parsed.success) return null;
    const ids = parsed.data.personIds.length ? parsed.data.personIds : (parsed.data.personId ? [parsed.data.personId] : []);
    return [...ids];
}

/** Reads this member's characters for a campaign. A failed read leaves the list empty: the screens then only read. */
export async function loadMe(universeId: string): Promise<void> {
    if (!universeId) return;
    if (me.universeId !== universeId) {
        me.universeId = universeId;
        me.readFor = '';
        setMyPersonIds([]);
    }
    try {
        const res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(universeId)}/players/me`, { method: 'GET' });
        if (!res.ok || me.universeId !== universeId) return;
        const ids = personIdsFrom(await res.json());
        if (ids && me.universeId === universeId) {
            setMyPersonIds(ids);
            me.readFor = universeId;
        }
    } catch {
        // Offline: the list stays as it was; the screens read.
    }
}
