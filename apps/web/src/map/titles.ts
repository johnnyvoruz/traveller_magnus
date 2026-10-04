import { HEX_SIZE } from './geometry.ts';

/** A box. x and y are the top-left corner. Screen pixels unless a function says map units. */
export type Box = { x: number; y: number; w: number; h: number };

const MIN_W = 56;
const MIN_H = 24;
const MARGIN = 4;
const MIN_STEP = 12;
const HIT = 0.8;
const CORE = 0.35;

function overlaps(a: Box, b: Box): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Centre within `rad` of the rectangle. The boundary does not count. */
function hitsCircle(pill: Box, cx: number, cy: number, rad: number): boolean {
    const nx = Math.max(pill.x, Math.min(cx, pill.x + pill.w));
    const ny = Math.max(pill.y, Math.min(cy, pill.y + pill.h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < rad * rad;
}

/**
 * Spots along the inside edge: top left to right, then the bottom edge, then
 * down both sides. A visible box under 56 px wide or 24 px tall has none.
 */
export function titleCandidates(visible: Box, pillW: number, pillH: number): { x: number; y: number }[] {
    if (visible.w < MIN_W || visible.h < MIN_H) return [];
    const xL = visible.x + MARGIN;
    const yT = visible.y + MARGIN;
    const xR = Math.max(xL, visible.x + visible.w - pillW - MARGIN);
    const yB = Math.max(yT, visible.y + visible.h - pillH - MARGIN);
    const step = Math.max(MIN_STEP, pillH);
    const spots: { x: number; y: number }[] = [];
    const row = (y: number) => {
        for (let x = xL; ; x = Math.min(xR, x + step)) {
            spots.push({ x, y });
            if (x >= xR) break;
        }
    };
    row(yT);
    if (yB > yT) row(yB);
    for (let y = yT + step; y < yB; y += step) {
        spots.push({ x: xL, y });
        if (xR > xL) spots.push({ x: xR, y });
    }
    return spots;
}

/**
 * Cheapest allowed spot. A world centre within 0.8 hex sizes counts 1, and
 * within 0.35 counts 10. Overlap with a blocked box is not allowed. The first
 * spot wins a tie.
 */
export function placeTitle(
    visible: Box,
    pillW: number,
    pillH: number,
    worlds: { x: number; y: number }[],
    hexSizePx: number,
    blocked: Box[],
): { x: number; y: number } | null {
    const near = HIT * hexSizePx;
    const core = CORE * hexSizePx;
    let best: { x: number; y: number } | null = null;
    let bestCost = Infinity;
    for (const spot of titleCandidates(visible, pillW, pillH)) {
        if (bestCost === 0) break;
        const pill: Box = { x: spot.x, y: spot.y, w: pillW, h: pillH };
        let forbidden = false;
        for (const box of blocked) {
            if (overlaps(pill, box)) {
                forbidden = true;
                break;
            }
        }
        if (forbidden) continue;
        let cost = 0;
        for (const world of worlds) {
            if (!hitsCircle(pill, world.x, world.y, near)) continue;
            cost += hitsCircle(pill, world.x, world.y, core) ? 10 : 1;
            if (cost >= bestCost) break;
        }
        if (cost < bestCost) {
            best = spot;
            bestCost = cost;
        }
    }
    return best;
}

/**
 * B1.12a. A title is placed once per subsector and zoom step, in map space, and then rides
 * with the map. The functions below are that decision and the two continuous adjustments
 * (sticky at the top, fade) the renderer applies each frame.
 */

/** Two steps per doubling of the zoom. Placement and font size are fixed within a step. */
export function zoomStep(ppp: number): number {
    return Math.round(Math.log2(ppp) * 2);
}

/** The pixels-per-parsec a step is decided at: the middle of the step. */
export function stepScale(step: number): number {
    return 2 ** (step / 2);
}

/**
 * Where the pill sits for one subsector at one zoom step: its top-left corner in map units.
 * `rect` is the subsector's full rectangle and `worlds` are world centres, both in map
 * units; the pill size is in pixels. Null when the rectangle cannot hold a title.
 */
export function titleAnchor(
    rect: Box,
    step: number,
    pillW: number,
    pillH: number,
    worlds: { x: number; y: number }[],
): { x: number; y: number } | null {
    const scale = stepScale(step);
    const hexSizePx = scale * HEX_SIZE;
    const reach = HIT * HEX_SIZE;
    const full: Box = { x: 0, y: 0, w: rect.w * scale, h: rect.h * scale };
    const local: { x: number; y: number }[] = [];
    for (const world of worlds) {
        if (world.x <= rect.x - reach || world.x >= rect.x + rect.w + reach) continue;
        if (world.y <= rect.y - reach || world.y >= rect.y + rect.h + reach) continue;
        local.push({ x: (world.x - rect.x) * scale, y: (world.y - rect.y) * scale });
    }
    const spot = placeTitle(full, pillW, pillH, local, hexSizePx, []);
    if (!spot) return null;
    return { x: rect.x + spot.x / scale, y: rect.y + spot.y / scale };
}

/**
 * Sticky position in screen space (B1.12b). A title sticks to the top edge of `bounds` only,
 * where it reads as a header. It never leaves `home` (its own subsector on screen): when the
 * subsector slides up and out, its bottom edge pushes the pill out with it. Sideways and
 * downward the pill simply rides with the map; it is never held at a side or bottom edge.
 * y is a clamp of the input, so it moves no further than the pan does.
 */
export function clampTitle(
    spot: { x: number; y: number },
    pillH: number,
    home: Box,
    bounds: Box,
): { x: number; y: number } {
    const held = Math.max(spot.y, bounds.y + MARGIN);
    const floor = Math.max(home.y + MARGIN, home.y + home.h - pillH - MARGIN);
    return { x: spot.x, y: Math.min(held, floor) };
}

/**
 * The whole pill is inside `bounds`. A pill that has left by the left, right or bottom edge,
 * or been pushed out at the top, is not: it fades out, and is never moved back in.
 */
export function titleInView(spot: { x: number; y: number }, pillW: number, pillH: number, bounds: Box): boolean {
    return spot.x >= bounds.x + MARGIN && spot.x + pillW <= bounds.x + bounds.w - MARGIN
        && spot.y >= bounds.y + MARGIN && spot.y + pillH <= bounds.y + bounds.h - MARGIN;
}

/** True when two boxes overlap. Touching edges do not count. */
export function boxesOverlap(a: Box, b: Box): boolean {
    return overlaps(a, b);
}

/** One step of a linear fade: `value` moves toward `target` by at most `amount`. */
export function fadeToward(value: number, target: number, amount: number): number {
    if (!(amount > 0)) return value;
    if (value < target) return Math.min(target, value + amount);
    return Math.max(target, value - amount);
}
