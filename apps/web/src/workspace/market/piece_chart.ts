/**
 * The chart piece on a package's page (streams/D.md D4): the package's own hexes, drawn by the map's
 * own renderer (map/MapRenderer.ts) from the rows the manifest carries, at the place the map gives
 * them. This turns a published manifest into what the renderer reads: the sectors with their slots
 * (own sectors from the manifest's `ownSectors`, chart sectors from the truth's manifest), one sector
 * index per sector holding only the piece's rows, and the box the piece fills. Pure: it runs under Node.
 */
import type { SectorHex, SectorIndex, TruthManifest } from '@voyage/shared';
import { HEX_SIZE, hexCentre, parseHex, ROW_STEP, toGlobal, type Rect } from '../../map/geometry.ts';

export type PieceSector = { slug: string; name: string; x: number; y: number; canonical: boolean };
export type Piece = {
    sectors: PieceSector[];
    /** The piece's rows by sector slug, then by hex ("0101"). */
    rows: Map<string, Record<string, SectorHex>>;
    /** Where the piece is, in the map's world units, with room for the names under the hexes. */
    box: Rect | null;
    count: number;
};

/** A chart sector's place on the chart: from the truth's manifest. */
export type ChartSlots = (slug: string) => { x: number; y: number; name: string } | null;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * A manifest hex's summary as the row the map draws. A chart hex's summary is the chart's row; an
 * own sector's is the Build row, whose `entry` is the row. Null when neither holds a system.
 */
export function pieceRow(summary: unknown): SectorHex | null {
    if (!summary || typeof summary !== 'object') return null;
    const source = summary as Record<string, unknown>;
    const row = source.entry && typeof source.entry === 'object' ? source.entry as Record<string, unknown> : source;
    if (typeof row.type !== 'string' || typeof row.uwp !== 'string') return null;
    return {
        tree: typeof row.tree === 'string' ? row.tree : null,
        type: row.type,
        name: text(row.name),
        uwp: row.uwp,
        allegiance: text(row.allegiance),
        zone: text(row.zone),
        bases: text(row.bases),
        tradeCodes: Array.isArray(row.tradeCodes) ? row.tradeCodes.filter((code): code is string => typeof code === 'string') : [],
        pbg: text(row.pbg),
        ix: typeof row.ix === 'number' ? row.ix : 0,
        ...(typeof row.stars === 'string' ? { stars: row.stars } : {}),
        partial: row.partial === 'full' || row.partial === 'partial' ? row.partial : null,
    };
}

/** The piece from a published manifest. A chart sector the truth doesn't place is left out. */
export function pieceFrom(manifest: unknown, chartSlot: ChartSlots): Piece {
    const empty: Piece = { sectors: [], rows: new Map(), box: null, count: 0 };
    if (!manifest || typeof manifest !== 'object') return empty;
    const doc = manifest as { hexes?: unknown; ownSectors?: unknown };
    if (!doc.hexes || typeof doc.hexes !== 'object') return empty;
    const own = doc.ownSectors && typeof doc.ownSectors === 'object' ? doc.ownSectors as Record<string, { x?: unknown; y?: unknown }> : {};
    const sectors = new Map<string, PieceSector>();
    const rows = new Map<string, Record<string, SectorHex>>();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let count = 0;
    for (const [key, hex] of Object.entries(doc.hexes as Record<string, { summary?: unknown; deleted?: unknown }>)) {
        if (!hex || hex.deleted === true) continue;
        const at = key.lastIndexOf('/');
        const slug = key.slice(0, at);
        const place = parseHex(key.slice(at + 1));
        const row = pieceRow(hex.summary);
        if (!place || !row) continue;
        let sector = sectors.get(slug);
        if (!sector) {
            const slot = own[slug];
            if (slot && typeof slot.x === 'number' && typeof slot.y === 'number') {
                sector = { slug, name: 'Own sector', x: slot.x, y: slot.y, canonical: false };
            } else {
                const chart = chartSlot(slug);
                if (!chart) continue;
                sector = { slug, name: chart.name, x: chart.x, y: chart.y, canonical: true };
            }
            sectors.set(slug, sector);
            rows.set(slug, {});
        }
        rows.get(slug)![key.slice(at + 1)] = row;
        count += 1;
        const { q, r } = toGlobal(sector.x, sector.y, place.col, place.row);
        const c = hexCentre(q, r);
        x0 = Math.min(x0, c.x - HEX_SIZE);
        x1 = Math.max(x1, c.x + HEX_SIZE);
        y0 = Math.min(y0, c.y - ROW_STEP / 2);
        y1 = Math.max(y1, c.y + ROW_STEP / 2);
    }
    return { sectors: [...sectors.values()], rows, box: count ? { x0, y0, x1, y1 } : null, count };
}

/** The renderer's chart: only the piece's sectors (MapRenderer reads the slugs, names, slots and canonical). */
export function pieceManifest(piece: Piece, truthVersion: string): TruthManifest {
    return {
        truthVersion,
        milieu: 'M1105',
        seed: '',
        settings: {},
        engineVersion: '',
        overviewHash: '',
        politiesHash: '',
        attribution: '',
        sectors: piece.sectors.map((sector) => ({ ...sector, tags: [], systems: 0, built: 0, partial: 0, indexHash: '' })),
    } as unknown as TruthManifest;
}

/** One sector's index holding only the piece's rows. */
export function pieceIndex(piece: Piece, slug: string, truthVersion: string): SectorIndex | null {
    const sector = piece.sectors.find((item) => item.slug === slug);
    const hexes = piece.rows.get(slug);
    if (!sector || !hexes) return null;
    return {
        slug, name: sector.name, x: sector.x, y: sector.y, tags: [], canonical: sector.canonical, truthVersion,
        systems: Object.keys(hexes).length, built: 0, partial: 0, hexes,
        metadata: { routes: [], borders: [], names: {}, allegiances: [] },
        territories: [], regions: [],
    };
}

/**
 * The camera and the canvas size for the piece: at a zoom where the map writes names (`ppp`), the
 * box fits the piece plus a margin; when that is wider than `maxWidth` or taller than `maxHeight`,
 * the zoom comes down so the whole piece fits, but never below `minPpp` (the map's hex tier, where
 * it draws systems): a piece bigger than that is shown round its middle, cropped to the box.
 */
export function pieceView(box: Rect, ppp: number, minPpp: number, maxWidth: number, maxHeight: number, marginPx: number): { width: number; height: number; cam: { x: number; y: number; ppp: number } } {
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    const fitted = Math.min(ppp, (maxWidth - 2 * marginPx) / w, (maxHeight - 2 * marginPx) / h);
    const scale = Math.max(fitted, minPpp);
    return {
        width: Math.round(Math.min(maxWidth, w * scale + 2 * marginPx)),
        height: Math.round(Math.min(maxHeight, h * scale + 2 * marginPx)),
        cam: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, ppp: scale },
    };
}
