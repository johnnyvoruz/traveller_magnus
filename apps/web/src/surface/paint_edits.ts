/**
 * The edit-aware parts of the hybrid surface map (DW2, design §10.3): a model with a referee's
 * edits laid over it, the guards on those edits (the world's digest, the grid side), the palette
 * the Paint rail shows, the "Painted sea X% · UWP Y%" line, and the pure pointer helpers (a Shift
 * run between two hexes). Nothing here touches a canvas or the page.
 *
 * The edited model keeps the generated hexes beside the edited ones (`generated`): the painter
 * blends unedited pixels from the generated records, so an unedited hex paints exactly as before,
 * and takes an edited pixel's water and terrain from its record across the whole hex (the hard
 * edge the design promises).
 */
import { ACCENT_CODES, CODE_TABLE, FEATURE_CODES, TERRAIN_CODES, type AccentCode, type CodeRow, type FeatureCode, type SurfaceCode, type TerrainCode } from './hybrid/codes.ts';
import { dot, norm, type Grid, type V3 } from './hybrid/grid.ts';
import { HYBRID_SURFACE_VERSION, worldDigest, type HybridWorld } from './hybrid/inputs.ts';
import type { HexRecord, HybridModel } from './hybrid/model.ts';
import { applyEdits, HEX_EDITS_FORMAT, serializeEdits, type HexEdit, type HexEdits } from './hybrid/serialize.ts';

// ---- the edits as data ---------------------------------------------------------------------------

/** No edits yet, stamped for this world: the grid side, the world's digest and the painter's version. */
export function emptyEdits(world: HybridWorld): HexEdits {
    return { format: HEX_EDITS_FORMAT, n: world.size, digest: worldDigest(world), surface: HYBRID_SURFACE_VERSION, edits: [] };
}

/** How many hexes carry an edit. */
export function paintedCount(edits: HexEdits | null): number {
    return edits ? edits.edits.length : 0;
}

export type EditsStatus =
    /** Null or empty: the generated map. */
    | 'none'
    /** Made on this world as it is. */
    | 'fit'
    /** The world's data changed since (design §10.3): shown over the new map, and said. */
    | 'stale'
    /** Made on another grid side: not applied. */
    | 'other-size';

export function editsStatus(edits: HexEdits | null, world: HybridWorld): EditsStatus {
    if (!edits || edits.edits.length === 0) return 'none';
    if (edits.n !== world.size) return 'other-size';
    if (edits.digest && edits.digest !== worldDigest(world)) return 'stale';
    return 'fit';
}

export const STALE_WORDS = 'The world changed since this map was painted. The paint is shown over the new map.';
export const OTHER_SIZE_WORDS = 'This map was painted on a world of another size, so it is not shown.';

/** The saved text of the edits, sorted; '' for none. The same edits always give the same text. */
export function editsText(edits: HexEdits | null): string {
    if (!edits || edits.edits.length === 0) return '';
    return serializeEdits(edits.n, edits.edits, edits);
}

/** FNV-1a over the edits' text, for cache keys; '' for none. */
export function editsDigest(edits: HexEdits | null): string {
    const text = editsText(edits);
    if (!text) return '';
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + ':' + text.length;
}

// ---- the edited model ----------------------------------------------------------------------------

/**
 * The generated model with the edits laid over its hexes (a new model object; the base is not
 * changed). Edits for another grid side, or none, give the base back.
 */
export function editedModel(base: HybridModel, edits: HexEdits | null): HybridModel {
    const status = editsStatus(edits, base.world);
    if (status === 'none' || status === 'other-size' || !edits) return base;
    return { ...base, hexes: applyEdits(base, edits), generated: base.generated, edits };
}

/** Area-weighted share of the hexes that are water, 0..1 (the painted sea). */
export function paintedSea(hexes: readonly HexRecord[]): number {
    let sea = 0;
    for (const hex of hexes) if (hex.water) sea += hex.area;
    return Math.max(0, Math.min(1, sea));
}

/** "Painted sea 61% · UWP 70%": the hexes as painted against the UWP's figure, which painting never changes. */
export function seaLine(model: HybridModel): string {
    return 'Painted sea ' + Math.round(paintedSea(model.hexes) * 100) + '% · UWP ' + Math.round(model.world.hydroPercent) + '%';
}

/** "14 hexes painted". */
export function paintedWords(count: number): string {
    return count + (count === 1 ? ' hex painted' : ' hexes painted');
}

// ---- the palette ---------------------------------------------------------------------------------

export type Swatch =
    | { readonly kind: 'terrain'; readonly code: TerrainCode }
    | { readonly kind: 'accent'; readonly code: AccentCode }
    | { readonly kind: 'feature'; readonly code: FeatureCode }
    /** Back to the generated hex. */
    | { readonly kind: 'clear' };

export type PaletteRow = { readonly swatch: Swatch; readonly row: CodeRow | null; readonly name: string };

const rowOf = (code: SurfaceCode): CodeRow => CODE_TABLE[code];

/** The rail's groups, in the table's order: the 19 terrains, the 3 accents, the features, then Clear hex. */
export function paletteGroups(): { readonly name: string; readonly rows: readonly PaletteRow[] }[] {
    return [
        { name: 'Terrain', rows: TERRAIN_CODES.map((code) => ({ swatch: { kind: 'terrain', code }, row: rowOf(code), name: rowOf(code).name })) },
        { name: 'Accents', rows: ACCENT_CODES.map((code) => ({ swatch: { kind: 'accent', code }, row: rowOf(code), name: rowOf(code).name })) },
        { name: 'Features', rows: FEATURE_CODES.map((code) => ({ swatch: { kind: 'feature', code }, row: rowOf(code), name: rowOf(code).name })) },
        { name: '', rows: [{ swatch: { kind: 'clear' }, row: null, name: 'Clear hex' }] },
    ];
}

/** One key per swatch, for the rail's buttons and the remembered choice. */
export function swatchKey(swatch: Swatch): string {
    return swatch.kind === 'clear' ? 'clear' : swatch.kind + ':' + swatch.code;
}

export function swatchOf(key: string): Swatch | null {
    if (key === 'clear') return { kind: 'clear' };
    const at = key.indexOf(':');
    const kind = key.slice(0, at);
    const code = key.slice(at + 1);
    if (kind === 'terrain' && (TERRAIN_CODES as readonly string[]).includes(code)) return { kind, code: code as TerrainCode };
    if (kind === 'accent' && (ACCENT_CODES as readonly string[]).includes(code)) return { kind, code: code as AccentCode };
    if (kind === 'feature' && (FEATURE_CODES as readonly string[]).includes(code)) return { kind, code: code as FeatureCode };
    return null;
}

// ---- painting one hex ----------------------------------------------------------------------------

export type HexAt = { readonly row: number; readonly col: number };

export function editOf(edits: HexEdits, at: HexAt): HexEdit | null {
    return edits.edits.find((e) => e.row === at.row && e.col === at.col) ?? null;
}

function replaced(edits: HexEdits, at: HexAt, next: HexEdit | null): HexEdits {
    const rest = edits.edits.filter((e) => !(e.row === at.row && e.col === at.col));
    return { ...edits, edits: next ? [...rest, next] : rest };
}

/** True when the edit changes nothing (so the hex can go back to generated). */
function blank(edit: HexEdit): boolean {
    return !edit.terrain && !edit.features && !edit.accents && !edit.note;
}

/**
 * The edits with one swatch put on one hex. A terrain replaces the hex's terrain; an accent or a
 * feature is added to what the hex has (the generated ones when the hex has no edit yet);
 * Clear hex removes the hex's edit. The same swatch twice is the same result.
 */
export function paintHex(edits: HexEdits, at: HexAt, swatch: Swatch, generated: HexRecord): HexEdits {
    const have = editOf(edits, at);
    if (swatch.kind === 'clear') return have ? replaced(edits, at, null) : edits;
    if (swatch.kind === 'terrain') {
        if (have && have.terrain === swatch.code) return edits;
        return replaced(edits, at, { ...(have ?? { row: at.row, col: at.col }), terrain: swatch.code });
    }
    if (swatch.kind === 'accent') {
        const accents = have && have.accents ? have.accents : generated.accents;
        if (accents.includes(swatch.code)) return edits;
        return replaced(edits, at, { ...(have ?? { row: at.row, col: at.col }), accents: [...accents, swatch.code] });
    }
    const features = have && have.features ? have.features : generated.features;
    if (features.includes(swatch.code)) return edits;
    return replaced(edits, at, { ...(have ?? { row: at.row, col: at.col }), features: [...features, swatch.code] });
}

/** Every hex back to generated. */
export function clearAll(edits: HexEdits): HexEdits {
    return { ...edits, edits: [] };
}

/** An edit that no longer changes anything is dropped, so a count is of hexes that differ. */
export function tidyEdits(edits: HexEdits): HexEdits {
    return { ...edits, edits: edits.edits.filter((e) => !blank(e)) };
}

// ---- a Shift run ---------------------------------------------------------------------------------

function nearest(grid: Grid, p: V3): number {
    let best = 0;
    let bestDot = -2;
    for (let id = 0; id < grid.count; id += 1) {
        const d = dot(grid.P[id], p);
        if (d > bestDot) {
            bestDot = d;
            best = id;
        }
    }
    return best;
}

/**
 * The hexes along the great circle from one hex to another, both included, each once, in order:
 * a straight run on the sphere (the lore maps are mostly coastlines and bands). The same hex
 * twice is that hex alone.
 */
export function runBetween(grid: Grid, from: number, to: number): number[] {
    if (from === to || !(from >= 0 && from < grid.count && to >= 0 && to < grid.count)) return [from];
    const a = grid.P[from];
    const b = grid.P[to];
    const cos = Math.max(-1, Math.min(1, dot(a, b)));
    const angle = Math.acos(cos);
    if (angle > Math.PI - 1e-6) {
        // Antipodes (pole to pole): no one great circle; go by way of a hex a quarter turn along.
        const side = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
        const mid = nearest(grid, norm([a[1] * side[2] - a[2] * side[1], a[2] * side[0] - a[0] * side[2], a[0] * side[1] - a[1] * side[0]]));
        const first = runBetween(grid, from, mid);
        return [...first, ...runBetween(grid, mid, to).filter((id) => !first.includes(id))];
    }
    // Hex spacing on the equator row is 2π / 5n; four samples per spacing never skips a hex.
    const spacing = (2 * Math.PI) / (5 * grid.n);
    const steps = Math.max(1, Math.ceil((angle / spacing) * 4));
    const out: number[] = [from];
    const sin = Math.sin(angle) || 1;
    for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        const wa = Math.sin((1 - t) * angle) / sin;
        const wb = Math.sin(t * angle) / sin;
        const p = norm([wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]]);
        const id = nearest(grid, p);
        if (!out.includes(id)) out.push(id);
    }
    if (out[out.length - 1] !== to) out.push(to);
    return out;
}
