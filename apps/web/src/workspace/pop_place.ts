/**
 * Where a floating menu goes (slice 2 follow-up 16): on the body, fixed, under its anchor
 * and aligned to its left edge, kept inside the window by a margin, above the anchor when
 * there is no room below. Nothing in the page's flow moves. Pure.
 */

export type Rect = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type Placement = { left: number; top: number; above: boolean };

/** The gap between the anchor and the menu, and the least distance to the window's edge. */
export const POP_GAP = 4;
export const POP_MARGIN = 8;

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

export function placePop(anchor: Rect, size: Size, viewport: Size): Placement {
    const left = clamp(anchor.left, POP_MARGIN, Math.max(POP_MARGIN, viewport.width - POP_MARGIN - size.width));
    const below = anchor.bottom + POP_GAP;
    const fitsBelow = below + size.height <= viewport.height - POP_MARGIN;
    const aboveTop = anchor.top - POP_GAP - size.height;
    if (fitsBelow || aboveTop < POP_MARGIN) {
        return { left, top: fitsBelow ? below : Math.max(POP_MARGIN, viewport.height - POP_MARGIN - size.height), above: false };
    }
    return { left, top: aboveTop, above: true };
}
