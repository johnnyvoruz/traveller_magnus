/**
 * A record's date (campaign schema `when`): a start day, and an end day only when one is set.
 * Typed dates use the journal's DDD-YYYY parse. Nothing here reads or writes the campaign clock.
 */
import { parseWhen } from './journal/dates.ts';
import { stardate } from './stardate.ts';

export type RecordDay = { year: number; day: number };
export type RecordWhen = { start: RecordDay; end?: RecordDay };

/** Shown when the typed text is not a date. */
export const DATE_HINT = 'A date is DDD-YYYY, day 001 to 365.';
/** Shown when the end day falls before the start day. */
export const ORDER_HINT = 'Choose an end date on or after the start date.';
/** Shown when "Use the campaign date" has no campaign date to copy. */
export const NO_CLOCK = 'No campaign date yet.';

export function beforeDay(a: RecordDay, b: RecordDay): boolean {
    return a.year < b.year || (a.year === b.year && a.day < b.day);
}

export function sameRecordDay(a: RecordDay | undefined, b: RecordDay | undefined): boolean {
    if (!a || !b) return !a && !b;
    return a.year === b.year && a.day === b.day;
}

/** True when both dates are absent, or the start and the optional end name the same days. */
export function sameRecordWhen(a: RecordWhen | null | undefined, b: RecordWhen | null | undefined): boolean {
    if (!a || !b) return !a && !b;
    return sameRecordDay(a.start, b.start) && sameRecordDay(a.end, b.end);
}

function withEnd(start: RecordDay, end: RecordDay | undefined): RecordWhen {
    return end ? { start, end } : { start };
}

/** The start field. An empty field clears the date, end included. */
export function whenFromStart(text: string, end: RecordDay | undefined): { when: RecordWhen | null } | { error: 'bad' | 'order' } {
    if (text.trim() === '') return { when: null };
    const start = parseWhen(text);
    if (!start) return { error: 'bad' };
    if (end && beforeDay(end, start)) return { error: 'order' };
    return { when: withEnd(start, end) };
}

/** The end field. An empty field keeps the start and drops the end. */
export function whenFromEnd(text: string, start: RecordDay): { when: RecordWhen } | { error: 'bad' | 'order' } {
    if (text.trim() === '') return { when: { start } };
    const end = parseWhen(text);
    if (!end) return { error: 'bad' };
    if (beforeDay(end, start)) return { error: 'order' };
    return { when: { start, end } };
}

/** The start day copied from the campaign clock's day count. The clock itself is left alone. */
export function whenFromClock(days: number, end: RecordDay | undefined): { when: RecordWhen } | { error: 'order' } {
    const said = stardate(days);
    const start = { year: said.year, day: said.day };
    if (end && beforeDay(end, start)) return { error: 'order' };
    return { when: withEnd(start, end) };
}

/** The end day copied from the campaign clock's day count. The clock itself is left alone. */
export function endFromClock(days: number, start: RecordDay): { when: RecordWhen } | { error: 'order' } {
    const said = stardate(days);
    const end = { year: said.year, day: said.day };
    if (beforeDay(end, start)) return { error: 'order' };
    return { when: { start, end } };
}
