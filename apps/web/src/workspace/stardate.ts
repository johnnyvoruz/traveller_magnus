/**
 * The campaign date in words (slice_2_campaign.md K6; campaign_manager_plan.md §7.9): the
 * orbit clock's day count said as DDD-YYYY with the weekday. Day 001 is "Holiday" and stands
 * outside the week; day 002 is Wonday and the seven names repeat to day 365. No calendar
 * arithmetic of its own: the day count is orbit/clock.ts's.
 */
import { DISPLAY_YEAR_DAYS, splitDays, totalDays } from '../orbit/clock.ts';

export const WEEKDAYS = ['Wonday', 'Tuday', 'Thirday', 'Forday', 'Fiday', 'Sixday', 'Senday'] as const;
export const HOLIDAY = 'Holiday';

export type Stardate = { year: number; day: number; date: string; weekday: string };

/** The weekday of a day of the year (1 to 365). */
export function weekdayName(day: number): string {
    const whole = Math.floor(day);
    if (whole <= 1) return HOLIDAY;
    return WEEKDAYS[(whole - 2) % 7];
}

function yearText(year: number): string {
    return year < 0 ? '-' + String(-year).padStart(4, '0') : String(year).padStart(4, '0');
}

/** A day count as the panel says it: "002-1105", "Wonday". */
export function stardate(days: number): Stardate {
    const { year, day } = splitDays(days);
    const whole = Math.floor(day);
    return { year, day: whole, date: String(whole).padStart(3, '0') + '-' + yearText(year), weekday: weekdayName(whole) };
}

/**
 * A date typed: "009-1105", "9-1105", "009 1105", "009/1105", or a day alone ("009", kept in
 * the year given). Null when it is not a date, or the day is outside 1 to 365.
 */
export function parseStardate(text: string, year: number): { day: number; year: number } | null {
    const found = /^\s*(\d{1,3})(?:\s*[-/ ]\s*(-?\d{1,4}))?\s*$/.exec(text);
    if (!found) return null;
    const day = Number(found[1]);
    const when = found[2] !== undefined ? Number(found[2]) : year;
    if (!Number.isInteger(day) || day < 1 || day > DISPLAY_YEAR_DAYS || !Number.isInteger(when)) return null;
    return { day, year: when };
}

/** The day count for a date typed over one held: the time of day is kept. */
export function withStardate(days: number, text: string): number | null {
    const have = stardate(days);
    const typed = parseStardate(text, have.year);
    if (!typed) return null;
    const fraction = days - Math.floor(days);
    return totalDays(typed.year, typed.day) + fraction;
}

/** True when two day counts fall on the same day. */
export function sameDay(a: number, b: number): boolean {
    return Math.floor(a) === Math.floor(b);
}
