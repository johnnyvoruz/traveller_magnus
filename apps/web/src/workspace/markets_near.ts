/**
 * Markets nearby (DT4a; backlog T4a): the chart around a world, for A's `marketsNearby`. The sector grid
 * gives where each sector stands; the indexes of the sector and its eight neighbours give the worlds (a
 * sector is 32 by 40 hexes, so six parsecs never reach further); each world's tree gives its WTN, read
 * as the row is listed. The released chart only: a referee's own sectors are not in it.
 */
import { reactive } from 'vue';
import type { SectorHex, SectorIndex, TruthOverview } from '@voyage/shared';
import { marketFromIndex, marketsNearby, wtnOf, type MarketRange, type MarketRow, type MarketWorld, type SectorAt } from '../campaign/markets.ts';
import { TruthClient } from '../map/truth_client.ts';
import { pageOrigin } from '../platform/browser.ts';
import { chartVersion } from '../search/chart_hold.ts';
import { parseHexKey } from './places.ts';

export type GridSector = Pick<TruthOverview['sectors'][number], 'slug' | 'x' | 'y' | 'canonical'>;

/** Where each sector stands, for `parsecsBetween`. The canonical sector wins a shared slug. */
export function sectorAtOf(sectors: readonly GridSector[]): SectorAt {
    return (slug) => {
        const found = sectors.find((item) => item.slug === slug && item.canonical) ?? sectors.find((item) => item.slug === slug);
        return found ? { sx: found.x, sy: found.y } : null;
    };
}

/** The sector and the eight around it, the sector first. Empty when the sector is not on the grid. */
export function sectorsAround(sectors: readonly GridSector[], slug: string): string[] {
    const at = sectorAtOf(sectors)(slug);
    if (!at) return [];
    const out = [slug];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const found = sectors.find((item) => item.x === at.sx + dx && item.y === at.sy + dy && item.canonical);
            if (found && !out.includes(found.slug)) out.push(found.slug);
        }
    }
    return out;
}

/** Every world on the indexes given: a hex with a UWP. Its tree hash rides along for the WTN. */
export function worldsOf(indexes: ReadonlyArray<{ slug: string; index: SectorIndex }>, wtn: Readonly<Record<string, number | null>>): { worlds: MarketWorld[]; trees: Record<string, string> } {
    const worlds: MarketWorld[] = [];
    const trees: Record<string, string> = {};
    for (const { slug, index } of indexes) {
        for (const [local, row] of Object.entries(index.hexes) as Array<[string, SectorHex]>) {
            if (!row || !row.uwp || !row.uwp.trim()) continue;
            const world = marketFromIndex(slug, local, row);
            const known = wtn[world.hexKey];
            worlds.push(known === undefined ? world : { ...world, wtn: known });
            if (row.tree) trees[world.hexKey] = row.tree;
        }
    }
    return { worlds, trees };
}


/** What the section reads: the version and the grid once in, a tick per index arrived, the WTNs read. */
export const marketsChart = reactive({
    version: '',
    sectors: null as GridSector[] | null,
    failed: false,
    arrivals: 0,
    wtn: {} as Record<string, number | null>,
});

let held: TruthClient | null = null;

/** One client, made on first use (the page's origin is read then), counting the indexes as they arrive. */
function client(): TruthClient {
    if (!held) {
        held = new TruthClient({
            cdnBase: import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage',
            apiBase: pageOrigin(),
            fetch,
        });
        held.onArrive(() => { marketsChart.arrivals += 1; });
    }
    return held;
}

let starting: Promise<void> | null = null;

/** The version (the map's when it has one) and the grid, once per page. A failure can be tried again. */
export function startMarkets(): Promise<void> {
    if (marketsChart.sectors) return Promise.resolve();
    if (!starting) {
        starting = (async () => {
            const version = chartVersion.value || await client().currentVersion();
            const overview = await client().overview(version);
            marketsChart.version = version;
            marketsChart.sectors = overview.sectors.map((item) => ({ slug: item.slug, x: item.x, y: item.y, canonical: item.canonical }));
            marketsChart.failed = false;
        })().catch(() => {
            marketsChart.failed = true;
            starting = null;
        });
    }
    return starting;
}

const treesAsked = new Set<string>();

/** Each listed world's tree, once, for its WTN. A tree that cannot be read leaves the WTN empty. */
function wantWtn(rows: readonly MarketRow[], trees: Readonly<Record<string, string>>): void {
    for (const row of rows) {
        const hash = trees[row.hexKey];
        if (!hash || treesAsked.has(row.hexKey)) continue;
        treesAsked.add(row.hexKey);
        void client().tree(hash).then(
            (envelope) => { marketsChart.wtn[row.hexKey] = wtnOf(envelope.body as { mgtSocio?: { WTN?: unknown } }); },
            () => { marketsChart.wtn[row.hexKey] = null; },
        );
    }
}

/**
 * The worlds within `range` of `hexKey`, nearest first, and whether some sector is still on its way.
 * Reactive: call it in a computed. It asks for what is missing.
 */
export function marketsAround(hexKey: string, range: MarketRange): { rows: MarketRow[]; waiting: boolean } {
    void marketsChart.arrivals;
    const place = parseHexKey(hexKey);
    const { version, sectors } = marketsChart;
    if (!place || !version || !sectors) return { rows: [], waiting: !marketsChart.failed };
    const slugs = sectorsAround(sectors, place.slug);
    if (slugs.length === 0) return { rows: [], waiting: false };
    const held: Array<{ slug: string; index: SectorIndex }> = [];
    const missing: string[] = [];
    for (const slug of slugs) {
        const index = client().index(version, slug);
        if (index) held.push({ slug, index });
        else missing.push(slug);
    }
    if (missing.length) client().want(version, missing);
    const { worlds, trees } = worldsOf(held, marketsChart.wtn);
    const rows = marketsNearby(hexKey, worlds, range, sectorAtOf(sectors));
    wantWtn(rows, trees);
    return { rows, waiting: missing.length > 0 };
}

/**
 * One hex as the chart this module reads says it, for the world card (DW1): its index row; 'empty' when the
 * sector is read and the hex has no world; null while the sector is not read (it is asked for).
 */
export function chartEntry(hexKey: string): SectorHex | 'empty' | null {
    void marketsChart.arrivals;
    const place = parseHexKey(hexKey);
    if (!place) return null;
    if (!marketsChart.version) {
        void startMarkets();
        return null;
    }
    const index = client().index(marketsChart.version, place.slug);
    if (!index) {
        client().want(marketsChart.version, [place.slug]);
        return null;
    }
    const row = index.hexes[place.hex];
    return row && row.uwp && row.uwp.trim() ? row : 'empty';
}
