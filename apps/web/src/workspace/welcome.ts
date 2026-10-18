/**
 * The welcome window (streams/C.md C2). Words are drafts for Johnny. The positioning
 * sentence is the orchestrator's. No legal text: the footer is the geomorph credit and the version.
 */
import { apiFetch } from '../platform/http.ts';
import { storageSet } from '../platform/browser.ts';
import { WELCOME_KEY } from './first_visit.ts';

export const WELCOME_LINE = 'Traveller.voyage puts a private campaign on the official chart of the Traveller universe. It\'s free.';

export const WELCOME_PANES = [
    {
        id: 'fly',
        kicker: 'Fly',
        title: 'The chart',
        text: 'The chart has 512 sectors. Open Regina to read one world.',
        button: 'Open Regina',
        picture: 'The chart, with world names',
    },
    {
        id: 'run',
        kicker: 'Run',
        title: 'A campaign on the map',
        text: 'Keep records, ships, and a clock on the chart. An example ship is already flying.',
        button: 'See an example ship',
        picture: 'The orbit of Regina with the time drawer open',
    },
    {
        id: 'share',
        kicker: 'Share',
        title: 'A package you can import',
        text: 'Publish part of your map, or import a package into a campaign.',
        button: 'Browse the marketplace',
        picture: 'A package page',
    },
] as const;

/** The deck-plan credit already in the app. Legal words wait for Johnny. */
export const WELCOME_CREDIT = 'Deck geomorphs by Robert Pearce and Eric B. Smith, CC BY-NC 4.0.';

export const EXAMPLE_SECTOR = 'Spinward_Marches';

const MARK_ID = /^pm_[0-9A-HJKMNP-TV-Z]{26}$/;
const LOCAL_HEX = /^\d{4}$/;

export type ExampleShip = {
    sector: string;
    hex: string;
    mark: string;
    ship: string;
    aboard: readonly string[];
};

export function markWelcomeShown(): void {
    storageSet(WELCOME_KEY, '1');
}

/** The newest released truth version, or null. */
export function releasedVersion(body: unknown): string | null {
    const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
    if (!Array.isArray(data)) return null;
    let best: { version: string; releasedAt: string } | null = null;
    for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        const row = item as { version?: unknown; releasedAt?: unknown };
        if (typeof row.version !== 'string' || row.version.length === 0) continue;
        if (typeof row.releasedAt !== 'string' || row.releasedAt.length === 0) continue;
        if (!best || row.releasedAt > best.releasedAt) best = { version: row.version, releasedAt: row.releasedAt };
    }
    return best ? best.version : null;
}

/** The first example ship on the feed, or null when the body has none. */
export function firstExampleShip(body: unknown, sector = EXAMPLE_SECTOR): ExampleShip | null {
    const hexes = body && typeof body === 'object' ? (body as { hexes?: unknown }).hexes : null;
    if (!Array.isArray(hexes)) return null;
    for (const item of hexes) {
        if (!item || typeof item !== 'object') continue;
        const row = item as { hex?: unknown; ships?: unknown };
        if (typeof row.hex !== 'string' || !LOCAL_HEX.test(row.hex) || !Array.isArray(row.ships)) continue;
        for (const shipRow of row.ships) {
            if (!shipRow || typeof shipRow !== 'object') continue;
            const ship = shipRow as { mark?: unknown; ship?: unknown; aboard?: unknown; example?: unknown };
            if (ship.example !== true) continue;
            if (typeof ship.mark !== 'string' || !MARK_ID.test(ship.mark)) continue;
            if (typeof ship.ship !== 'string' || ship.ship.trim() === '') continue;
            const aboard = Array.isArray(ship.aboard)
                ? ship.aboard.filter((name): name is string => typeof name === 'string' && name.trim() !== '')
                : [];
            return { sector, hex: row.hex, mark: ship.mark, ship: ship.ship.trim(), aboard };
        }
    }
    return null;
}

/** One example ship from the public feed, or null. Never throws. */
export async function loadExampleShip(fetchImpl: typeof fetch): Promise<ExampleShip | null> {
    try {
        const versions = await apiFetch(fetchImpl, '/api/truth/versions');
        if (!versions.ok) return null;
        const version = releasedVersion(await versions.json().catch(() => null));
        if (!version) return null;
        const params = new URLSearchParams({ truthVersion: version, sector: EXAMPLE_SECTOR });
        const games = await apiFetch(fetchImpl, '/api/public-games?' + params.toString());
        if (!games.ok) return null;
        return firstExampleShip(await games.json().catch(() => null));
    } catch {
        return null;
    }
}
