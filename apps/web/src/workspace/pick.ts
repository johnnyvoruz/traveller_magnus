/**
 * Picking a system for a record's place (design §3, the anchor's first step): while a pick is
 * on, a system clicked on the map or chosen in the omnibox is handed to whoever asked, in
 * place of opening its dossier. One pick at a time; starting another ends the first.
 */
import { ref } from 'vue';

export type PickedSystem = { slug: string; hex: string; name: string };

/** True while a pick is on: the map and the omnibox offer what is chosen. */
export const picking = ref(false);

let take: ((system: PickedSystem) => void) | null = null;
let cancel: (() => void) | null = null;

/** Starts a pick. `onCancel` is told when it is ended from outside (Esc on the map, another pick). */
export function beginPick(onTake: (system: PickedSystem) => void, onCancel: () => void = () => {}): void {
    const was = cancel;
    take = onTake;
    cancel = onCancel;
    picking.value = true;
    if (was) was();
}

/** Ends the pick quietly: the one who started it is finished with it. */
export function endPick(): void {
    take = null;
    cancel = null;
    picking.value = false;
}

/** Ends the pick and tells the one who started it. */
export function cancelPick(): void {
    const was = cancel;
    endPick();
    if (was) was();
}

/** A system chosen on the map or in the omnibox. True when a pick took it. */
export function offerSystem(system: PickedSystem): boolean {
    const taker = take;
    if (!taker) return false;
    taker(system);
    return true;
}
