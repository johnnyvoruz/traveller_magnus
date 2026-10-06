/**
 * The header's control drawers (slice 2 follow-up 6; findings/orbit_drawers_design.md):
 * one open at a time, its tab pressed again closes it, Esc closes it before anything else,
 * a press on the picture closes it. Pure; the shelf itself is orbit/Drawer.vue.
 */
import type { DrawerId } from './commands.ts';

export type DrawerState = DrawerId | '';

/** A tab pressed: its drawer opens, or closes when it was the open one. */
export function toggleDrawer(open: DrawerState, id: DrawerId): DrawerState {
    return open === id ? '' : id;
}

/** Escape's chain: the drawer, then a popover, then the selected body, then the map. */
export function escapeStep(state: { drawer: DrawerState; popover: boolean; body: boolean }): 'drawer' | 'popover' | 'body' | 'map' {
    if (state.drawer) return 'drawer';
    if (state.popover) return 'popover';
    if (state.body) return 'body';
    return 'map';
}

/** A press lands: on the picture it shuts the drawer; on the drawer, its tabs or the header's own controls it does not. */
export function pressCloses(where: { inDrawer: boolean; inHeader: boolean }): boolean {
    return !where.inDrawer && !where.inHeader;
}

/** The groups of an opening drawer land one step apart; closing has no stagger. */
export function groupDelaySteps(index: number, opening: boolean): number {
    return opening ? Math.max(0, index) : 0;
}
