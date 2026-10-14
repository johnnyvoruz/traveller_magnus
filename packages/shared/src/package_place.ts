/**
 * Place a package piece somewhere else on the map (contracts/b_marketplace.md F5).
 * Pure and deterministic; imports nothing. The piece moves as one rigid shape by the
 * cube vector between its anchor hex and the target hex, so every neighbour pair is kept
 * on the odd-q grid (odd global columns sit half a row lower, apps/web/src/map/geometry.ts).
 * Global coordinates are `q = sx * 32 + col - 1`, `r = sy * 40 + row - 1` (geometry.ts toGlobal).
 */

export const SECTOR_COLS = 32;
export const SECTOR_ROWS = 40;
/** `SectorSlot` bounds (schemas/sector.ts), the limit the server enforces. */
export const SLOT_MIN = -1000;
export const SLOT_MAX = 1000;

/** A sector's slot, or null when the slug is unknown. */
export type SectorAt = (slug: string) => { x: number; y: number } | null;

/** One placed hex. `slot` is the sector slot it lands in; `local` is its `ccrr`. */
export type PlaceCell = { from: string; sx: number; sy: number; col: number; row: number; local: string };

export type PlaceReason = 'key' | 'anchor' | 'unknown sector' | 'outside';

export class PlaceError extends Error {
    readonly reason: PlaceReason;
    readonly hexKey: string | null;

    constructor(reason: PlaceReason, message: string, hexKey: string | null = null) {
        super(message);
        this.reason = reason;
        this.hexKey = hexKey;
    }
}

/** A hex in a sector that does not exist yet, the Builder's form (schemas/sector.ts SectorGenerate). */
const EMPTY_SLOT = /^~slot_(-?\d+)_(-?\d+)$/;

function parseKey(hexKey: string): { slug: string; col: number; row: number } {
    const slash = hexKey.indexOf('/');
    const local = hexKey.slice(slash + 1);
    if (slash <= 0 || slash !== hexKey.lastIndexOf('/') || !/^\d{4}$/.test(local)) {
        throw new PlaceError('key', 'That hex address is not valid.', hexKey);
    }
    const col = Number(local.slice(0, 2));
    const row = Number(local.slice(2, 4));
    if (col < 1 || col > SECTOR_COLS || row < 1 || row > SECTOR_ROWS) throw new PlaceError('key', 'That hex address is not valid.', hexKey);
    return { slug: hexKey.slice(0, slash), col, row };
}

function slotOf(slug: string, sectorAt: SectorAt, hexKey: string): { x: number; y: number } {
    const empty = EMPTY_SLOT.exec(slug);
    if (empty) return { x: Number(empty[1]), y: Number(empty[2]) };
    const found = sectorAt(slug);
    if (!found) throw new PlaceError('unknown sector', 'A sector of the piece is not on the map.', hexKey);
    return found;
}

/** Odd-q offset to cube (x, z); y is -x - z. */
export function cubeOf(q: number, r: number): { x: number; z: number } {
    return { x: q, z: r - (q - (q & 1)) / 2 };
}

export function offsetOf(x: number, z: number): { q: number; r: number } {
    return { q: x, r: z + (x - (x & 1)) / 2 };
}

function globalOf(hexKey: string, sectorAt: SectorAt): { q: number; r: number } {
    const key = parseKey(hexKey);
    const slot = slotOf(key.slug, sectorAt, hexKey);
    return { q: slot.x * SECTOR_COLS + key.col - 1, r: slot.y * SECTOR_ROWS + key.row - 1 };
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

/**
 * Where each key lands. `source` knows the piece's sectors; `target` knows the
 * universe it lands in (plus `~slot_<x>_<y>` for empty space, which needs no lookup).
 */
export function placeCells(
    keys: readonly string[],
    placement: { anchor: string; to: string },
    source: SectorAt,
    target: SectorAt,
): PlaceCell[] {
    if (!keys.includes(placement.anchor)) throw new PlaceError('anchor', 'The anchor is not in the package.', placement.anchor);
    const from = globalOf(placement.anchor, source);
    const to = globalOf(placement.to, target);
    const a = cubeOf(from.q, from.r);
    const b = cubeOf(to.q, to.r);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return keys.map((key) => {
        const g = globalOf(key, source);
        const c = cubeOf(g.q, g.r);
        const moved = offsetOf(c.x + dx, c.z + dz);
        const sx = Math.floor(moved.q / SECTOR_COLS);
        const sy = Math.floor(moved.r / SECTOR_ROWS);
        if (sx < SLOT_MIN || sx > SLOT_MAX || sy < SLOT_MIN || sy > SLOT_MAX) {
            throw new PlaceError('outside', 'The piece does not fit on the map.', key);
        }
        const col = moved.q - sx * SECTOR_COLS + 1;
        const row = moved.r - sy * SECTOR_ROWS + 1;
        return { from: key, sx, sy, col, row, local: `${pad(col)}${pad(row)}` };
    });
}

/** The key each hex lands on. `slugAt` names the sector at a slot (chart, own, or one about to be made). */
export function placeKeys(cells: readonly PlaceCell[], slugAt: (sx: number, sy: number) => string): Map<string, string> {
    const map = new Map<string, string>();
    for (const cell of cells) map.set(cell.from, `${slugAt(cell.sx, cell.sy)}/${cell.local}`);
    return map;
}

const SUFFIXED = /^([^/]+\/\d{4})(-.+)$/;

function moveString(value: string, map: ReadonlyMap<string, string>): string {
    const exact = map.get(value);
    if (exact !== undefined) return exact;
    const suffixed = SUFFIXED.exec(value);
    if (suffixed) {
        const to = map.get(suffixed[1]!);
        if (to !== undefined) return `${to}${suffixed[2]}`;
    }
    return value;
}

/**
 * A deep copy in which every string that names a moved key, or a moved key plus a
 * suffix (`parentId` is `<key>-GG-pre`), names its new key. Key order is kept.
 * Keys outside the piece are left alone.
 */
export function placeTree<T>(value: T, map: ReadonlyMap<string, string>): T {
    if (typeof value === 'string') return moveString(value, map) as T;
    if (Array.isArray(value)) return value.map((item) => placeTree(item, map)) as T;
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = placeTree(item, map);
        return out as T;
    }
    return value;
}

/** A manifest hex summary. Same walk as a tree. */
export function placeSummary<T>(summary: T, map: ReadonlyMap<string, string>): T {
    return placeTree(summary, map);
}

/** A campaign record: its `anchor.hexKey` and any key in its text fields. */
export function placeRecord<T>(record: T, map: ReadonlyMap<string, string>): T {
    return placeTree(record, map);
}

/** Route and border-path lists: endpoints inside the piece move, the rest stay. */
export function placeLists<T>(lists: T, map: ReadonlyMap<string, string>): T {
    return placeTree(lists, map);
}