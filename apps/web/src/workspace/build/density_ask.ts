/**
 * Generating more than one hex always asks how many of the empty hexes to fill (Johnny,
 * 2026-10-11; prompts/d_menu_selection.md part 0). Every way in (the pane's Generate, the G
 * key, the right-click menu, the palette, Generate in an empty sector slot) goes through
 * `askDensity`; nothing runs until the prompt's Generate. One hex never asks. The full Generate
 * sheet has its own "Hexes to fill" row and runs without asking again.
 */
import { nextTick } from 'vue';
import { generateMany, oneSectorFor } from './acts.ts';
import { generateGrowing, inEmptySlot, slotNamesMissing } from './grow_acts.ts';
import { buildStore } from './seam.ts';
import { build, setDensity } from './state.ts';
import type { Density } from './seam.ts';

/** The control that opened the prompt: focus goes back to it. */
let opener: HTMLElement | null = null;

function focused(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    const el = document.activeElement;
    return el && 'focus' in el ? (el as HTMLElement) : null;
}

/**
 * Focus goes back to the control that opened the prompt. The prompt takes the Generate card's
 * place, so a button in that card (or in a menu that has closed) is gone by then: the pane's
 * Generate button, drawn again, takes it instead.
 */
function giveBack(): void {
    const el = opener;
    opener = null;
    void nextTick(() => {
        if (el && el.isConnected) {
            el.focus();
            return;
        }
        if (typeof document === 'undefined') return;
        const again = document.querySelector<HTMLElement>('.panel.is-open [data-command="build-generate"]');
        if (again) again.focus();
    });
}

/** Opens the prompt for these hexes. One hex is never asked about: the caller generates it as before. */
export function askDensity(keys: readonly string[]): void {
    if (keys.length < 2 || build.job) return;
    // Two sectors are never sent: the pane says what to do instead, and nothing is asked.
    if (oneSectorFor(keys)) return;
    // A new sector is named first: its box says so and takes the cursor.
    if (inEmptySlot(keys) && slotNamesMissing(keys)) return;
    build.sheetOpen = false;
    opener = focused();
    build.asking = [...keys];
}

/** The prompt's Generate: the choice is remembered for this universe, and the run starts. */
export function confirmDensity(density: Density): void {
    const keys = build.asking;
    if (!keys) return;
    const store = buildStore();
    const universe = store && typeof store.universe === 'function' ? store.universe() : null;
    setDensity(universe ? universe.id : null, density);
    build.asking = null;
    giveBack();
    runMany(keys);
}

/** Cancel, or Escape: nothing is written. */
export function cancelDensity(): void {
    build.asking = null;
    giveBack();
}

/** Many hexes with the density already chosen (the prompt, or the full sheet). Hexes in an empty slot make their sector first. */
export function runMany(keys: readonly string[]): void {
    if (inEmptySlot(keys)) generateGrowing(keys);
    else generateMany(keys);
}
