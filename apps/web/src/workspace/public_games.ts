/**
 * The owner's public games switch (contracts/b_public_games.md, "The setting";
 * prompts/d_public_games_wire.md item 2). The universe carries `publicGames` only when the
 * server has the setting: absent is not on, and then no switch is shown at all. The write is
 * `PATCH /api/universes/:id/public-games` with `{ public }`; the answer is the raw object
 * `{ public }`, and a refusal is said in the server's sentence.
 */
import { reactive } from 'vue';
import { apiFetch } from '../platform/http.ts';

export const PUBLIC_GAMES_LABEL = 'Show my party on other maps';
/** What turning it on shows other people (the board, "Public games"): one mark and the name, nothing else. */
export const PUBLIC_GAMES_SAY = 'When this is on, people on the same published chart see one mark on your party’s hex, with this campaign’s name. They see nothing else.';
/** Under the switch while it is on and the party has no hex the server would publish (Johnny, 2026-10-13). */
export const PUBLIC_GAMES_NO_PLACE = 'Your party isn’t on the chart yet. Choose the ship and set where it is.';
const NOT_SAVED = 'The setting could not be saved. Try again.';
const NOT_REACHED = 'The server could not be reached. Try again.';

/** What a write answered, by universe: the list this browser holds is older than the switch. */
const written = reactive<Record<string, boolean>>({});

/** On, off, or null when the server does not have the setting: null shows no switch. */
export function publicGamesOf(universe: { id: string; publicGames?: boolean } | null): boolean | null {
    if (!universe || typeof universe.publicGames !== 'boolean') return null;
    return universe.id in written ? written[universe.id] : universe.publicGames;
}

/**
 * The party stands on a hex of the published chart: the server publishes no mark for a party
 * that is nowhere, or in a sector of the referee's own (a slug that starts with "~").
 */
export function partyOnChart(hexKey: string | null): boolean {
    return hexKey !== null && hexKey !== '' && !hexKey.startsWith('~');
}

export function publicGamesToast(on: boolean, name: string): string {
    return on ? 'Other people on this chart now see ' + name + ' where your party is.' : name + ' is no longer shown on other maps.';
}

export type SwitchResult = { ok: true; public: boolean } | { ok: false; message: string };

export async function setPublicGames(id: string, on: boolean, fetchImpl: typeof fetch = fetch): Promise<SwitchResult> {
    let res: Response;
    try {
        res = await apiFetch(fetchImpl, '/api/universes/' + encodeURIComponent(id) + '/public-games', {
            method: 'PATCH',
            body: JSON.stringify({ public: on }),
        });
    } catch {
        return { ok: false, message: NOT_REACHED };
    }
    const body = await res.json().catch(() => null) as { public?: unknown; error?: { message?: unknown } } | null;
    if (res.ok && body && typeof body.public === 'boolean') {
        written[id] = body.public;
        return { ok: true, public: body.public };
    }
    const said = body && body.error && typeof body.error.message === 'string' ? body.error.message : '';
    return { ok: false, message: said || NOT_SAVED };
}

/** Tests start clean. */
export function _forgetPublicGames(): void {
    for (const key of Object.keys(written)) delete written[key];
}
