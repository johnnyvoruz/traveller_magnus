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
import { FASTEST, REAL_TIME, SPEED_SLIDER_MAX, sliderFromSpeed, speedFromSlider } from './clock.ts';


/** The speed's steps from the keyboard: this many from real time to the fastest. */
export const SPEED_STEPS = 10;

/**
 * One step faster or slower (the keys of orbit-faster and orbit-slower, and the two buttons
 * by the slider): a tenth of the slider's travel, which is a tenth of the way from real
 * time to the fastest on its own scale. It stops at each end.
 */
export function stepSpeed(daysPerSecond: number, direction: 1 | -1): number {
    const step = SPEED_SLIDER_MAX / SPEED_STEPS;
    const at = Math.round(sliderFromSpeed(daysPerSecond) / step) + direction;
    if (at <= 0) return REAL_TIME;
    if (at >= SPEED_STEPS) return FASTEST;
    return speedFromSlider(at * step);
}

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

export type ResetState = 'live' | 'quiet' | 'absent';

/**
 * The header's reset button, before Play (Johnny, 2026-10-06): it brings the view back to
 * the campaign date. Off the date it is the live control; on the date it is quiet and
 * disabled, and says so; with no campaign date it is not there. Its place does not depend
 * on which of the two it is, so the header never moves when the view leaves or reaches the
 * date, or under a scrub.
 */
export function resetState(state: { hasCampaignDate: boolean; onCampaignDate: boolean }): ResetState {
    if (!state.hasCampaignDate) return 'absent';
    return state.onCampaignDate ? 'quiet' : 'live';
}

/** The header clock's width-affecting controls, as a signature: the reset holds its place in both its states. */
export function headerSignature(state: { hasCampaignDate: boolean; onCampaignDate: boolean; scrubbing: boolean }): string {
    return resetState(state) === 'absent' ? 'play+readout' : 'reset+play+readout';
}

/** The row's width-affecting controls, as a signature: it must not change while a scrub is under way. */
export function rowSignature(state: { canSetDate: boolean; onCampaignDate: boolean; scrubbing: boolean; hasCampaignDate: boolean }): string {
    const set = setButtonState(state);
    return set === 'absent' ? '' : 'set';
}
