/**
 * Placing a package on the map (contracts/b_marketplace.md F5, F12): the piece's outline
 * follows the pointer as one rigid shape that snaps to hexes. The shift is `placeCells` /
 * `placeKeys` from @voyage/shared, the same code the server runs, so the outline is where
 * the preview will put it. The state lives here; MapView draws it (PlaceMarks.vue) and the
 * package page reads the placement back.
 *
 * The pure parts run under Node.
 */
import { reactive } from 'vue';
import { PlaceError, placeCells, placeKeys } from '@voyage/shared';
import type { InstallPreview, InstallRow } from '../../marketplace/catalogue.ts';

export type Slot = { x: number; y: number };

export const placing = reactive({
    /** The outline is on the map. */
    active: false,
    packageId: '',
    version: 0,
    title: '',
    universeId: '',
    /** The package's own hex keys. */
    keys: [] as string[],
    /** The package hex that follows the pointer, and the hex it lands on. */
    anchor: '',
    to: '',
    /** Set when the person selects Preview: the package page runs the preview with it. */
    chosen: null as { anchor: string; to: string } | null,
});

export function startPlacing(input: { packageId: string; version: number; title: string; universeId: string; keys: readonly string[]; to?: string }): void {
    const keys = [...input.keys].sort();
    placing.packageId = input.packageId;
    placing.version = input.version;
    placing.title = input.title;
    placing.universeId = input.universeId;
    placing.keys = keys;
    placing.anchor = keys[0] ?? '';
    placing.to = input.to ?? placing.anchor;
    placing.chosen = null;
    placing.active = keys.length > 0;
}

export function stopPlacing(): void {
    placing.active = false;
}

/** The address the package page reads the chosen placement from. */
export function placedPath(packageId: string, universeId: string): string {
    return '/packages/' + encodeURIComponent(packageId) + '?import=' + encodeURIComponent(universeId) + '&placed=1';
}

export function choosePlacement(): string {
    placing.chosen = { anchor: placing.anchor, to: placing.to };
    placing.active = false;
    return placedPath(placing.packageId, placing.universeId);
}

/** Where every hex of the piece lands, or the reason it does not fit. Slugs the browser does not know sit at slot (0, 0): one sector moves the same wherever it starts. */
export function placedKeys(
    keys: readonly string[],
    placement: { anchor: string; to: string },
    slotOf: (slug: string) => Slot | null,
    slugAt: (sx: number, sy: number) => string,
): { keys: string[]; error: string } {
    try {
        const cells = placeCells(keys, placement, (slug) => slotOf(slug) ?? { x: 0, y: 0 }, (slug) => slotOf(slug));
        const map = placeKeys(cells, slugAt);
        return { keys: keys.map((key) => map.get(key) ?? key), error: '' };
    } catch (err) {
        if (err instanceof PlaceError && err.reason === 'outside') return { keys: [], error: 'The piece does not fit on the map.' };
        if (err instanceof PlaceError) return { keys: [], error: 'The piece cannot go there.' };
        throw err;
    }
}

/** The package hex whose placed copy is `placedKey`: the one the pointer picked up. */
export function anchorUnder(keys: readonly string[], placed: readonly string[], placedKey: string): string | null {
    const at = placed.indexOf(placedKey);
    return at >= 0 ? keys[at] ?? null : null;
}

// ---- the preview, in words ------------------------------------------------------------------------------

export const OUTCOMES = ['new', 'replaces chart', 'replaces own', 'conflict', 'already installed'] as const;

export function outcomeWords(outcome: string): string {
    if (outcome === 'new') return 'New';
    if (outcome === 'replaces chart') return 'Replaces the chart';
    if (outcome === 'replaces own') return 'Replaces yours';
    if (outcome === 'conflict') return 'Conflict';
    return 'Already the same';
}

export function plural(count: number, one: string, many: string): string {
    return count.toLocaleString('en-US') + ' ' + (count === 1 ? one : many);
}

/** The preview's hexes by outcome, in the order above, empty groups left out. */
export function byOutcome(preview: InstallPreview): { outcome: string; words: string; hexes: InstallPreview['hexes'] }[] {
    return OUTCOMES.map((outcome) => ({ outcome, words: outcomeWords(outcome), hexes: preview.hexes.filter((hex) => hex.outcome === outcome) }))
        .filter((group) => group.hexes.length > 0);
}

/** One line under the preview. */
export function previewLine(preview: InstallPreview): string {
    const records = preview.records.add + preview.records.replace + preview.records.conflicts.length;
    // A records-only package (F18) says its records, not "0 hexes".
    const parts = preview.hexes.length > 0 || records === 0 ? [plural(preview.hexes.length, 'hex', 'hexes')] : [];
    if (records) parts.push(plural(records, 'record', 'records'));
    if (preview.sectorsCreated.length) parts.push(plural(preview.sectorsCreated.length, 'new sector', 'new sectors'));
    if (preview.conflicts) parts.push(plural(preview.conflicts, 'conflict', 'conflicts'));
    return parts.join(', ') + '.';
}

/**
 * A records-only import drops the records' own-sector places (F18): said before the install.
 * Empty when none is dropped; an older server sends no count, which reads as none.
 */
export function anchorsDroppedWords(preview: Pick<InstallPreview, 'records'>): string {
    const dropped = preview.records.anchorsDropped ?? 0;
    if (dropped <= 0) return '';
    if (dropped === 1) return '1 record loses its place on the map.';
    return dropped.toLocaleString('en-US') + ' records lose their place on the map.';
}

/** The Remove confirmation, as Johnny worded it. */
export function removeWords(row: Pick<InstallRow, 'hexCount'>, records: number): string {
    return 'Removes ' + plural(row.hexCount, 'system', 'systems') + ' and ' + plural(records, 'record', 'records') + ' that came from this package, including any you changed.';
}

/** A hex address in words: "Spinward Marches 3110", "empty space, hex 0101", or "your own sector, hex 0101". */
export function hexWords(key: string): string {
    const at = key.lastIndexOf('/');
    const slug = at >= 0 ? key.slice(0, at) : key;
    const local = at >= 0 ? key.slice(at + 1) : '';
    if (/^~slot_-?\d+_-?\d+$/.test(slug)) return 'empty space, hex ' + local;
    if (slug.startsWith('~')) return 'your own sector, hex ' + local;
    return slug.replace(/_/g, ' ') + ' ' + local;
}

export function placementWords(row: Pick<InstallRow, 'placement'>): string {
    return row.placement ? 'Placed at ' + hexWords(row.placement.to) : 'In place';
}

/** The line on the map while the outline is placed. */
export function landingWords(count: number, to: string): string {
    return plural(count, 'hex', 'hexes') + ', starting at ' + hexWords(to) + '.';
}
// ---- the outline on the package page -------------------------------------------------------------------

/**
 * A small drawing of the piece: one flat-topped hex per key, even columns half a hex down, as
 * on the chart. Sectors the page does not know sit side by side in key order. Returns the
 * polygons and the view box that holds them.
 */
export function outlineHexes(keys: readonly string[], slotOf: (slug: string) => Slot | null = () => null): { points: string[]; viewBox: string } {
    const order = new Map<string, number>();
    const cells: { x: number; y: number }[] = [];
    for (const key of keys) {
        const at = key.lastIndexOf('/');
        const slug = key.slice(0, at);
        const local = key.slice(at + 1);
        if (!/^\d{4}$/.test(local)) continue;
        let slot = slotOf(slug);
        if (!slot) {
            if (!order.has(slug)) order.set(slug, order.size);
            slot = { x: order.get(slug)!, y: 0 };
        }
        const col = slot.x * 32 + Number(local.slice(0, 2));
        const row = slot.y * 40 + Number(local.slice(2));
        cells.push({ x: col * 1.5, y: (row + (col % 2 === 0 ? 0.5 : 0)) * Math.sqrt(3) });
    }
    if (!cells.length) return { points: [], viewBox: '0 0 1 1' };
    const r = 1;
    const h = Math.sqrt(3) / 2;
    const points = cells.map((c) => [[c.x - r, c.y], [c.x - r / 2, c.y - h], [c.x + r / 2, c.y - h], [c.x + r, c.y], [c.x + r / 2, c.y + h], [c.x - r / 2, c.y + h]]
        .map(([x, y]) => x.toFixed(2) + ',' + y.toFixed(2)).join(' '));
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const x0 = Math.min(...xs) - 1.5;
    const y0 = Math.min(...ys) - 1.5;
    const w = Math.max(...xs) - x0 + 1.5;
    const hh = Math.max(...ys) - y0 + 1.5;
    return { points, viewBox: [x0, y0, w, hh].map((n) => n.toFixed(2)).join(' ') };
}
