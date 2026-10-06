/**
 * The time row's small rules (orbit/TimeControls.vue). The one that matters: while a scrub
 * is under way, nothing in the row may appear or vanish, because a control appearing beside
 * the slider reflows the row, the slider's width changes under the pointer, the pointer's
 * place on the track then reads as another value, the view jumps, the control vanishes
 * again, and the view jumps back: Johnny's "jumps back and forth for a moment" when a scrub
 * crosses the campaign date (the "Set as campaign date" button comes and goes with it, and
 * the date readout grows or shrinks with the weekday's name, "Fiday" to "Sixday"). So the
 * button keeps its place, unseen, until the scrub is released, and the readout is as wide
 * as its longest reading. Pure.
 */

/** The readout's longest reading, "DDD-YYYY · Thirday · HH:MM:SS", in characters of its mono face; the button is this wide. */
export const READOUT_CHARS = 'DDD-YYYY · Thirday · HH:MM:SS'.length;

export type SetButtonState = 'shown' | 'held' | 'absent';

/**
 * Whether "Set as campaign date" is shown, holds its space unseen, or is not there at all.
 * It is shown off the campaign day; on the day it is absent, except while a scrub is under
 * way, when it keeps its space so the row cannot reflow under the pointer.
 */
export function setButtonState(state: { canSetDate: boolean; onCampaignDate: boolean; scrubbing: boolean }): SetButtonState {
    if (!state.canSetDate) return 'absent';
    if (!state.onCampaignDate) return 'shown';
    return state.scrubbing ? 'held' : 'absent';
}

/**
 * "Go to the campaign date" (the Time drawer; the header's mark is gone, Johnny 2026-10-06):
 * there when the campaign has a date and the view is off it, and, like Set, holding its
 * place unseen while a scrub crosses the day.
 */
export function goButtonState(state: { hasCampaignDate: boolean; onCampaignDate: boolean; scrubbing: boolean }): SetButtonState {
    if (!state.hasCampaignDate) return 'absent';
    if (!state.onCampaignDate) return 'shown';
    return state.scrubbing ? 'held' : 'absent';
}

/** The row's width-affecting controls, as a signature: it must not change while a scrub is under way. */
export function rowSignature(state: { canSetDate: boolean; onCampaignDate: boolean; scrubbing: boolean; hasCampaignDate: boolean }): string {
    const set = setButtonState(state);
    const go = goButtonState(state);
    return [go === 'absent' ? '' : 'go', set === 'absent' ? '' : 'set'].filter(Boolean).join('+');
}
