/**
 * DU39: the referee's time toolset for trade (Johnny's 124: "Trade shouldn't be so literal, we should offer a
 * little toolset to the ref to manage the trade"). Wherever trade rolls or writes a time, a days box prefilled
 * from it and an Advance button move the campaign clock by the referee's number, longer or shorter than the
 * roll: the same clock change as DJ1's jump tiles (campaign/store.ts setCampaignDate, the held rev as its base)
 * and a toast with the new date, with Undo. No roll changes; nothing here reads a rule.
 */
import { campaign, setCampaignDate } from '../campaign/store.ts';
import { canAdvanceClock } from '../dossier/journey_clock.ts';
import { showToast } from '../shell/toast.ts';
import { stardate } from './stardate.ts';

/** A rolled wait as Trade here has it: the amount and the file's unit ("days", "hours"). */
export type RolledWait = { amount: number; unit: string | null };

/** The whole days a rolled wait means: days as they are, hours rounded up to the day, weeks by seven; null for anything else. */
export function waitDays(time: RolledWait | null | undefined): number | null {
    if (!time || !Number.isFinite(time.amount) || time.amount < 0) return null;
    const unit = (time.unit ?? '').trim().toLowerCase().replace(/s$/, '');
    if (unit === 'day') return Math.ceil(time.amount);
    if (unit === 'hour') return Math.ceil(time.amount / 24);
    if (unit === 'week') return Math.ceil(time.amount * 7);
    return null;
}

/** The whole days from the campaign date to an arrival, the fraction rounded up so the ship has arrived; 0 when it has. */
export function daysTo(nowDays: number, arrives: number): number {
    return Math.max(0, Math.ceil(arrives - nowDays));
}

/** A typed count of days: a whole number 0 or more; blank or anything else is null. */
export function typedDays(text: string): number | null {
    const typed = text.trim();
    return /^\d+$/.test(typed) ? Number(typed) : null;
}

function daysWords(days: number): string {
    return days + (days === 1 ? ' day' : ' days');
}

/** "Advance 3 days to 017-1105". The target keeps the campaign date's time of day. */
export function advanceWords(days: number, nowDays: number): string {
    return 'Advance ' + daysWords(days) + ' to ' + stardate(nowDays + days).date;
}

/**
 * The referee's press: one clock change of `days` on the held rev, then a toast with the new date and Undo
 * (the date back as it was). False, and nothing sent, for anyone but the referee with the clock set, or
 * for anything but a whole number of days above zero.
 */
export function advanceDays(days: number): boolean {
    if (!canAdvanceClock.value || !campaign.clock || !Number.isInteger(days) || days <= 0) return false;
    const before = campaign.clock.days;
    const next = before + days;
    setCampaignDate(next);
    showToast('Advanced ' + daysWords(days) + '. The campaign date is now ' + stardate(next).date + '.', {
        action: { label: 'Undo', run: () => { setCampaignDate(before); } },
    });
    return true;
}
