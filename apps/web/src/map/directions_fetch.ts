/**
 * The sectors a Directions route needs (streams/D.md DN1b). A route through a sector the chart has not fetched
 * missed before: now, before planning, the sectors in the box between From and To, widened by the jump, are
 * fetched. Nearest the straight line first, at most 16; past that the plan uses what is loaded and says so.
 * An end may name a system in a sector not loaded yet, by the sector's name (or slug) and the hex.
 */
import { boxEnd, directions, sameEnd, settled, type DirectionsForm, type DirectionsIndex, type DirectionsResult, type EndFound, type PinnedEnd, type PinnedEnds } from './directions.ts';
import { fromGlobal, parseHex, SECTOR_COLS, SECTOR_ROWS, toGlobal } from './geometry.ts';
import type { RouteEnd } from './route_plan.ts';

/** A sector of the chart's grid (the manifest's row): enough to place it and to name it. */
export type GridSector = { slug: string; name: string; x: number; y: number };

export const ROUTE_SECTOR_CAP = 16;
export const CAPPED_WORDS = 'Only the 16 sectors nearest the route were searched.';
export const FINDING_WORDS = 'Finding a route…';

const squash = (text: string): string => text.trim().toLowerCase().replace(/[_\s]+/g, ' ');

/** "Vland 0534" or "Vland/0534" for a sector of the grid, loaded or not; null otherwise. */
export function gridEnd(grid: readonly GridSector[], typed: string): RouteEnd | null {
    const coded = /^(.*?)[\s/]+(\d{4})$/.exec(typed.trim());
    if (!coded || !parseHex(coded[2])) return null;
    const wanted = squash(coded[1]);
    const sector = grid.find((one) => squash(one.slug) === wanted || squash(one.name) === wanted);
    return sector ? { sector: sector.slug, hex: coded[2] } : null;
}

/** The box's end: as the loaded sectors read it, else a sector and hex anywhere on the grid. */
export function resolveEnd(indexes: readonly DirectionsIndex[], grid: readonly GridSector[], typed: string, box: 'From' | 'To', pinned?: PinnedEnd | null): EndFound {
    const found = boxEnd(indexes, typed, box, pinned);
    if (found.ok) return found;
    const far = gridEnd(grid, typed);
    return far ? { ok: true, end: far, label: typed.trim() } : found;
}

function globalOf(grid: readonly GridSector[], end: RouteEnd): { q: number; r: number } | null {
    const sector = grid.find((one) => one.slug === end.sector);
    const local = parseHex(end.hex);
    return sector && local ? toGlobal(sector.x, sector.y, local.col, local.row) : null;
}

/** How far a point lies from the segment a to b, in parsec-sized steps of the grid. */
function fromLine(p: { q: number; r: number }, a: { q: number; r: number }, b: { q: number; r: number }): number {
    const dq = b.q - a.q;
    const dr = b.r - a.r;
    const length = dq * dq + dr * dr;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.q - a.q) * dq + (p.r - a.r) * dr) / length));
    return Math.hypot(p.q - (a.q + t * dq), p.r - (a.r + t * dr));
}

/**
 * The sectors of the grid in the box between the two ends widened by `jump` parsecs on every side, nearest the
 * line between the ends first (the ends' own sectors always first), at most `cap`; `capped` when more were in it.
 */
export function sectorsForRoute(grid: readonly GridSector[], from: RouteEnd, to: RouteEnd, jump: number, cap = ROUTE_SECTOR_CAP): { slugs: string[]; capped: boolean } {
    const a = globalOf(grid, from);
    const b = globalOf(grid, to);
    if (!a || !b) return { slugs: [], capped: false };
    const low = fromGlobal(Math.min(a.q, b.q) - jump, Math.min(a.r, b.r) - jump);
    const high = fromGlobal(Math.max(a.q, b.q) + jump, Math.max(a.r, b.r) + jump);
    const inBox: { slug: string; far: number }[] = [];
    for (const sector of grid) {
        if (sector.x < low.sx || sector.x > high.sx || sector.y < low.sy || sector.y > high.sy) continue;
        const own = sector.slug === from.sector || sector.slug === to.sector;
        const middle = { q: sector.x * SECTOR_COLS + SECTOR_COLS / 2, r: sector.y * SECTOR_ROWS + SECTOR_ROWS / 2 };
        inBox.push({ slug: sector.slug, far: own ? -1 : fromLine(middle, a, b) });
    }
    inBox.sort((one, two) => one.far - two.far || one.slug.localeCompare(two.slug));
    return { slugs: inBox.slice(0, cap).map((one) => one.slug), capped: inBox.length > cap };
}

export type FetchPlan = {
    /** The loaded sectors, read again after the fetch. */
    indexes: () => readonly DirectionsIndex[];
    grid: readonly GridSector[];
    /** One sector's index fetched; resolves when it is in or does not come. */
    fetchIndex?: (slug: string) => Promise<unknown>;
    /** Called once when sectors are to be fetched first. */
    finding?: () => void;
};

/** Both boxes settled on a system (pinned, a whole name, or a sector and hex on the grid). */
export function bothSettled(indexes: readonly DirectionsIndex[], grid: readonly GridSector[], form: DirectionsForm, pinned: PinnedEnds = {}): boolean {
    return settled(form.from, resolveEnd(indexes, grid, form.from, 'From', pinned.from))
        && settled(form.to, resolveEnd(indexes, grid, form.to, 'To', pinned.to));
}

/**
 * Both ends read (on the grid too), the sectors in the route's box fetched when missing, then A's planner over
 * what is loaded. `capped` when the box held more than 16 sectors; the words to say then are CAPPED_WORDS.
 */
export async function planFetching(how: FetchPlan, form: DirectionsForm, pinned: PinnedEnds = {}): Promise<{ result: DirectionsResult; capped: boolean }> {
    const from = resolveEnd(how.indexes(), how.grid, form.from, 'From', pinned.from);
    const to = resolveEnd(how.indexes(), how.grid, form.to, 'To', pinned.to);
    let capped = false;
    if (from.ok && to.ok && how.fetchIndex && !sameEnd(from.end, to.end)) {
        const wanted = sectorsForRoute(how.grid, from.end, to.end, form.jump);
        capped = wanted.capped;
        const held = new Set(how.indexes().map((index) => index.slug));
        const missing = wanted.slugs.filter((slug) => !held.has(slug));
        if (missing.length) {
            if (how.finding) how.finding();
            const fetchIndex = how.fetchIndex;
            await Promise.all(missing.map((slug) => fetchIndex(slug).catch(() => null)));
        }
    }
    const ends: PinnedEnds = {
        from: from.ok ? { label: form.from, end: from.end } : pinned.from,
        to: to.ok ? { label: form.to, end: to.end } : pinned.to,
    };
    return { result: directions(how.indexes(), form, ends), capped };
}

/** What the panel says under the route: the planner's reason, the cap's sentence, both, or nothing. */
export function saidAfter(result: DirectionsResult, capped: boolean): string {
    const reason = result.ok ? '' : result.message;
    return [reason, capped ? CAPPED_WORDS : ''].filter(Boolean).join(' ');
}
