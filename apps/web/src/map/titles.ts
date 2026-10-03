/** Screen-space box. x and y are the top-left corner. */
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
