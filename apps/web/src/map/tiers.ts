/** Tuning knobs. Nothing else compares against ppp except through these. */
export const PPP_MIN = 0.05, PPP_MAX = 160;
export const PPP_DOTS = 5.25, PPP_GRID = 22.5, PPP_NAMES = 63.75; // js/renderer.js:163-171 times 75

export type Tier = 'galaxy' | 'sector' | 'hex';

/** galaxy below PPP_DOTS, sector from PPP_DOTS until PPP_GRID, hex from PPP_GRID up. */
export function tierFor(ppp: number): Tier {
    if (ppp < PPP_DOTS) return 'galaxy';
    if (ppp < PPP_GRID) return 'sector';
    return 'hex';
}
