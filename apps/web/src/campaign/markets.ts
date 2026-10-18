/**
 * Worlds near a ship (Epic T, step T4a). Pure.
 * Distance is `parsecsBetween`. Starport, trade codes and the population
 * character come off the sector index. WTN is on the built tree
 * (`body.mgtSocio.WTN`), not on the index, so it stays empty until a tree is read.
 * No pairing and no price.
 */
import type { SectorHex } from '@voyage/shared';
import { parsecsBetween } from '../map/geometry.ts';
import { starport } from '../map/uwp.ts';

/** The ranges the referee picks. */
export const MARKET_RANGES = [2, 4, 6] as const;
export type MarketRange = (typeof MARKET_RANGES)[number];

export type MarketWorld = {
    hexKey: string;
    name: string;
    starport: string;
    tradeCodes: readonly string[];
    /** The population character on the UWP. Not a head count. */
    population: string;
    /** Set from the tree when one has been read. The index has no WTN. */
    wtn: number | null;
};

export type MarketRow = MarketWorld & { parsecs: number };

export type SectorAt = (slug: string) => { sx: number; sy: number } | null;

/** Fifth UWP character, the population digit `surface/profile.ts` reads at index 4. A blank or '?' is empty. */
export function populationDigit(uwp: string): string {
    const ch = uwp.length > 4 ? uwp.charAt(4) : '';
    if (ch === '' || ch === '?') return '';
    return ch;
}

/** One index row as a market world. WTN is left empty. */
export function marketFromIndex(sector: string, local: string, row: SectorHex): MarketWorld {
    return {
        hexKey: sector + '/' + local,
        name: row.name,
        starport: starport(row.uwp),
        tradeCodes: row.tradeCodes,
        population: populationDigit(row.uwp),
        wtn: null,
    };
}

/** The tree's world trade number, or null when that body has none. */
export function wtnOf(body: { mgtSocio?: { WTN?: unknown } } | null | undefined): number | null {
    const value = body?.mgtSocio?.WTN;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRange(range: number): range is MarketRange {
    return range === 2 || range === 4 || range === 6;
}

/**
 * Worlds at most `range` parsecs from `origin`, nearest first.
 * The origin is included at 0. A hex that cannot be measured is left out.
 */
export function marketsNearby(
    origin: string,
    worlds: readonly MarketWorld[],
    range: MarketRange,
    sectorAt: SectorAt,
): MarketRow[] {
    if (!isRange(range)) return [];
    const rows: MarketRow[] = [];
    for (const world of worlds) {
        const parsecs = parsecsBetween(origin, world.hexKey, sectorAt);
        if (parsecs == null || parsecs > range) continue;
        rows.push({ ...world, tradeCodes: world.tradeCodes.slice(), parsecs });
    }
    rows.sort((a, b) => a.parsecs - b.parsecs || (a.hexKey < b.hexKey ? -1 : a.hexKey > b.hexKey ? 1 : 0));
    return rows;
}
