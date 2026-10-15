/**
 * The read-only card of someone else's public ship (prompts/d_party_ships_map.md item 2):
 * `GET /api/public-ships/:mark` (contracts/b_party_ships.md, "The public card"). Read leniently:
 * a key this screen does not know is left unread, and a leg or a note that cannot be read is
 * left out rather than failing the card.
 */
import { CAMPAIGN_LIMITS, PUBLIC_CARD_BODY, PUBLIC_CARD_ENTRIES, PUBLIC_NAMES_PER_SHIP } from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';
import { totalDays } from '../orbit/clock.ts';
import { stardate } from './stardate.ts';

export type ShipCardLeg = { from: string; to: string; departs: number; arrives: number };
export type ShipCardNote = { title: string; body: string; date: string | null };
export type ShipCardBody = {
    game: string;
    referee: string | null;
    example: boolean;
    ship: string;
    aboard: string[];
    legs: ShipCardLeg[];
    journal: ShipCardNote[];
};

/**
 * What a click on a dart came to: the card; `gone` (404, the ship is no longer public);
 * `off` (503 or 401, a server before 0018: the dart stays hover-only); `failed` (anything else).
 */
export type ShipCardAnswer =
    | { kind: 'card'; card: ShipCardBody }
    | { kind: 'gone' }
    | { kind: 'off' }
    | { kind: 'failed' };

export const SHIP_GONE = 'This ship is no longer public.';
export const SHIP_FAILED = 'The card could not be loaded. Try again.';

const MARK_ID = /^pm_[0-9A-HJKMNP-TV-Z]{26}$/;
const HEX_KEY = /^[^/]+\/\d{4}$/;
const REAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function text(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const kept = value.trim();
    return kept.length > 0 ? kept.slice(0, max) : null;
}

/** An in-game date as the app writes it ("123-1105"), or the day it was written ("14 October 2026"). */
export function noteDate(when: unknown, realDate: unknown): string | null {
    if (when && typeof when === 'object') {
        const { year, day } = when as { year?: unknown; day?: unknown };
        if (Number.isInteger(year) && Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 365) {
            return stardate(totalDays(year as number, day as number)).date;
        }
    }
    if (typeof realDate === 'string') {
        const found = REAL_DATE.exec(realDate);
        const month = found ? MONTHS[Number(found[2]) - 1] : undefined;
        if (found && month) return String(Number(found[3])) + ' ' + month + ' ' + found[1];
    }
    return null;
}

/** The card's body, or null when it is not a card. */
export function readShipCard(body: unknown): ShipCardBody | null {
    if (!body || typeof body !== 'object') return null;
    const row = body as Record<string, unknown>;
    const game = text(row.game, CAMPAIGN_LIMITS.name);
    const ship = text(row.ship, CAMPAIGN_LIMITS.name);
    if (!game || !ship) return null;
    const aboard: string[] = [];
    if (Array.isArray(row.aboard)) {
        for (const name of row.aboard) {
            const kept = text(name, CAMPAIGN_LIMITS.name);
            if (kept && aboard.length < PUBLIC_NAMES_PER_SHIP) aboard.push(kept);
        }
    }
    const legs: ShipCardLeg[] = [];
    if (Array.isArray(row.legs)) {
        for (const item of row.legs) {
            if (!item || typeof item !== 'object' || legs.length >= CAMPAIGN_LIMITS.track) continue;
            const leg = item as Record<string, unknown>;
            if (typeof leg.from !== 'string' || typeof leg.to !== 'string' || !HEX_KEY.test(leg.from) || !HEX_KEY.test(leg.to)) continue;
            if (typeof leg.departs !== 'number' || typeof leg.arrives !== 'number' || !Number.isFinite(leg.departs) || !Number.isFinite(leg.arrives)) continue;
            legs.push({ from: leg.from, to: leg.to, departs: leg.departs, arrives: leg.arrives });
        }
    }
    legs.sort((a, b) => a.departs - b.departs);
    const journal: ShipCardNote[] = [];
    if (Array.isArray(row.journal)) {
        for (const item of row.journal) {
            if (!item || typeof item !== 'object' || journal.length >= PUBLIC_CARD_ENTRIES) continue;
            const note = item as Record<string, unknown>;
            const title = typeof note.title === 'string' ? note.title.trim().slice(0, CAMPAIGN_LIMITS.entryTitle) : '';
            const said = typeof note.body === 'string' ? note.body.trim().slice(0, PUBLIC_CARD_BODY) : '';
            if (!title && !said) continue;
            journal.push({ title, body: said, date: noteDate(note.when, note.realDate) });
        }
    }
    const referee = text(row.referee, CAMPAIGN_LIMITS.name);
    return { game, referee, example: row.example === true, ship, aboard, legs, journal };
}

/** One card, by the opaque mark from the feed. Never throws. */
export async function fetchShipCard(fetchImpl: typeof fetch, mark: string): Promise<ShipCardAnswer> {
    if (!MARK_ID.test(mark)) return { kind: 'failed' };
    try {
        const res = await apiFetch(fetchImpl, '/api/public-ships/' + encodeURIComponent(mark));
        if (res.status === 404) return { kind: 'gone' };
        if (res.status === 503 || res.status === 401) return { kind: 'off' };
        if (!res.ok) return { kind: 'failed' };
        const card = readShipCard(await res.json().catch(() => null));
        return card ? { kind: 'card', card } : { kind: 'failed' };
    } catch {
        return { kind: 'failed' };
    }
}

/** "Route" line on the card: how many finished legs the map is showing. Null with none. */
export function routeWords(legs: readonly ShipCardLeg[]): string | null {
    const moves = legs.filter((leg) => leg.from !== leg.to).length;
    if (moves === 0) return null;
    return moves === 1 ? 'One finished leg, drawn on the map.' : String(moves) + ' finished legs, drawn on the map.';
}
