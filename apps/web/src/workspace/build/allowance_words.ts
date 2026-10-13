/**
 * The daily generation allowance in Build's words (prompts/d_dots_allowance.md part 2; the
 * number from findings/builder_allowance_store.md, the rules from contracts/b_builder.md "Daily
 * generation allowance"). Quiet while there is plenty. At 20 or fewer, one short line. A request
 * that is sure to pass what is left is not sent: the button is off and one sentence says why
 * and when the allowance resets, in the person's own time zone. An admin sees none of it.
 *
 * The server counts the density roll's writes, not the hexes named: a hex the roll leaves empty
 * costs nothing, and a hex that already holds a system is always written. So a request has a
 * least (`least`) and a most (`most`) it can write. The button is off only when the least is
 * more than what is left, or when the most is certain ("Every hex", one hex). Between the two
 * the roll decides on the server: the button stays on, and the sentence says what happens if
 * the roll would make too many.
 */
import type { GenerationAllowance } from '@voyage/shared';
import { readAllowance } from '../../account/session.ts';
import { AllowanceRefused, allowanceResetsLocal } from '../../builder/allowance.ts';
import type { Density } from './seam.ts';

/** At this many left or fewer, the line shows. */
export const ALLOWANCE_QUIET = 20;

export type AllowanceSay = { text: string; blocked: boolean };

/** The account's allowance now: null signed out, or before the first answer. */
export function allowanceNow(): GenerationAllowance | null {
    return readAllowance();
}

/** The least and the most a request can write: a filled hex is always written, an empty one only when the roll keeps it. */
export function writesOf(empty: number, filled: number, density: Density | null): { least: number; most: number } {
    const most = empty + filled;
    return { least: density === null || density === 'every' ? most : filled, most };
}

function systems(n: number): string {
    return n === 1 ? '1 more system' : n.toLocaleString('en') + ' more systems';
}

/** "7:00 PM", or "tomorrow at 7:00 PM" when the reset falls on the next local day. */
export function resetWords(at: Date, now: Date = new Date()): string {
    const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return at.toDateString() === now.toDateString() ? time : 'tomorrow at ' + time;
}

function resetSentence(allowance: GenerationAllowance, now: Date): string {
    const at = allowanceResetsLocal(allowance);
    if (!at) return '';
    const when = resetWords(at, now);
    return ' The allowance resets ' + (when.startsWith('tomorrow') ? when : 'at ' + when) + '.';
}

/**
 * What to say by a Generate control for a request that writes between `least` and `most`
 * systems, or null when there is nothing to say (plenty left, an admin, signed out).
 */
export function allowanceSay(allowance: GenerationAllowance | null, least: number, most: number, now: Date = new Date()): AllowanceSay | null {
    if (!allowance || allowance.limit === null || allowance.remaining === null) return null;
    const left = allowance.remaining;
    const limit = allowance.limit;
    if (left <= 0) return { text: 'You’ve used today’s ' + limit.toLocaleString('en') + ' systems.' + resetSentence(allowance, now), blocked: true };
    if (least > left || (least === most && most > left)) return { text: 'You can generate ' + systems(left) + ' today.' + resetSentence(allowance, now), blocked: true };
    if (most > left) return { text: 'You can generate ' + systems(left) + ' today. If the roll would make more than ' + left.toLocaleString('en') + ', nothing is generated.', blocked: false };
    if (left <= ALLOWANCE_QUIET) return { text: left.toLocaleString('en') + ' of ' + limit.toLocaleString('en') + ' left today.', blocked: false };
    return null;
}

/** With nothing selected: said only at zero, so a person knows before they select anything. */
export function allowanceSpent(allowance: GenerationAllowance | null, now: Date = new Date()): string {
    const say = allowanceSay(allowance, 0, 0, now);
    return say && allowance && allowance.remaining === 0 ? say.text : '';
}

/** The server's refusal: its own sentence, then the reset in the person's time zone. */
export function refusalWords(err: AllowanceRefused, now: Date = new Date()): string {
    const at = new Date(err.resetsAt);
    if (Number.isNaN(at.getTime())) return err.message;
    return err.message + ' In your time zone, that’s ' + resetWords(at, now) + '.';
}

/** An act's error in words: the allowance's refusal with its local time, else the error's own message. */
export function actError(err: unknown, fallback: string): string {
    if (err instanceof AllowanceRefused) return refusalWords(err);
    return err instanceof Error && err.message ? err.message : fallback;
}

export { AllowanceRefused };
