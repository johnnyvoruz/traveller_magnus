/**
 * The orbit view's clock: pure arithmetic over a count of days. Ported from
 * js/system_viewer.js (each function names its legacy lines; the behaviour is recorded in
 * findings/legacy_orbit_inventory.md §3). No state lives here: the view holds one number,
 * `days`, and these functions read and move it.
 */
import { formatDisplayNumber } from '../dossier/labels.ts';

/** The date on screen counts 365-day years (system_viewer.js:411, 420). */
export const DISPLAY_YEAR_DAYS = 365;
/** Orbital motion divides elapsed days by 365.25 (system_viewer.js:2851). The two differ on purpose. */
export const ORBIT_YEAR_DAYS = 365.25;
export const DAY_SECONDS = 86400;
/** The skip buttons move one hour (system_viewer.js:1754-1756). */
export const HOUR = 1 / 24;
/** Speed slider: a game second per real second, up to a year per second (1797). */
export const REAL_TIME = 1 / DAY_SECONDS;
export const FASTEST = 365;
export const SPEED_SLIDER_MAX = 1000;
/** Shuttle limits in days per second, and the one selected at first (1579-1581). */
export const SHUTTLE_LIMITS = [1, 10, 365, 3650] as const;
export const SHUTTLE_DEFAULT_LIMIT = 365;
/** The scrub slider reaches this many days either way (1562). */
export const SCRUB_DAYS = 30;
/** One frame never advances the clock by more than this many seconds of real time (2022). */
export const TICK_CAP_SECONDS = 0.25;
/**
 * Where the clock starts without a date in the link (Johnny, 2026-10-03, Q4): 002-1105 at
 * 0000 hours, the first day of the first week of the standard campaign year. Day 001 is
 * Holiday and belongs to no week; 1105 is Travellermap's default milieu.
 */
export const DEFAULT_START = { year: 1105, day: 2 };

/** The `?` text beside the date. */
export const START_HELP = 'Default date 002-1105, the first day of the first week of the standard campaign year. '
    + 'Set a date in the link to open elsewhere.';

/** _totalDays (411). `day` runs from 1. */
export function totalDays(year: number, day: number): number {
    return year * DISPLAY_YEAR_DAYS + day - 1;
}

/** _setDays (412-415): the year, and the day as a float in [1, 366). */
export function splitDays(days: number): { year: number; day: number } {
    const year = Math.floor(days / DISPLAY_YEAR_DAYS);
    return { year, day: days - year * DISPLAY_YEAR_DAYS + 1 };
}

/** Seconds into the current day, in [0, 86400). */
export function secondsOfDay(days: number): number {
    const fraction = days - Math.floor(days);
    return fraction * DAY_SECONDS;
}

/** _clockText (406-409): HH:MM:SS from seconds, wrapping at a day. */
export function clockText(seconds: number): string {
    const whole = Math.floor(seconds + 1e-5) % DAY_SECONDS;
    return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
        .map((n) => String(n).padStart(2, '0')).join(':');
}

/** _dateText (420-422). */
export function dateText(days: number): string {
    const year = Math.floor(days / DISPLAY_YEAR_DAYS);
    const day = days - year * DISPLAY_YEAR_DAYS;
    return 'Year ' + formatDisplayNumber(year, 0) + ' · Day ' + (Math.floor(day) + 1)
        + ' · ' + clockText((day % 1) * DAY_SECONDS);
}

/** Years of orbital motion since day 0 (2851). */
export function elapsedOrbitYears(days: number): number {
    return days / ORBIT_YEAR_DAYS;
}

/** _sliderToSpeed (1798): days per second on a log scale. */
export function speedFromSlider(value: number): number {
    return REAL_TIME * Math.pow(FASTEST / REAL_TIME, value / SPEED_SLIDER_MAX);
}

/** _speedToSlider (1799). */
export function sliderFromSpeed(daysPerSecond: number): number {
    return Math.log(daysPerSecond / REAL_TIME) / Math.log(FASTEST / REAL_TIME) * SPEED_SLIDER_MAX;
}

/** Under a second and a half of game time per second counts as real time (1802, 1828). */
export function isRealTime(daysPerSecond: number): boolean {
    return daysPerSecond * DAY_SECONDS < 1.5;
}

/** _fmtSpeed (1800-1808). */
export function speedText(daysPerSecond: number): string {
    const secs = daysPerSecond * DAY_SECONDS;
    if (secs < 1.5) return 'Real time';
    if (secs < 60) return formatDisplayNumber(secs, 0) + ' s/s';
    if (secs < 3600) return formatDisplayNumber(secs / 60, secs < 600 ? 1 : 0) + ' min/s';
    if (secs < DAY_SECONDS) return formatDisplayNumber(secs / 3600, secs < 36000 ? 1 : 0) + ' h/s';
    if (daysPerSecond < 364.5) return formatDisplayNumber(daysPerSecond, daysPerSecond < 10 ? 1 : 0) + ' d/s';
    return '1 yr/s';
}

/** The speed readout's tooltip (1824). */
export function speedFactorText(daysPerSecond: number): string {
    return formatDisplayNumber(daysPerSecond * DAY_SECONDS, 0) + '× real time';
}

/** updateShuttle (1588): the slider runs -100..100, cubed so the middle is gentle. */
export function shuttleRate(value: number, limit: number): number {
    return Math.pow(value / 100, 3) * limit;
}

/** The shuttle readout (1584). */
export function shuttleText(rate: number): string {
    return rate ? formatDisplayNumber(rate, 2) + ' d/s' : 'Stopped';
}

/**
 * One frame of the tick (2020-2022). `shuttle` wins over the running speed; a paused clock
 * with no shuttle does not move.
 */
export function tickRate(paused: boolean, speed: number, shuttle: number): number {
    return shuttle || (paused ? 0 : speed);
}

export function advance(days: number, elapsedMs: number, rate: number): number {
    if (!rate) return days;
    return days + Math.min(elapsedMs / 1000, TICK_CAP_SECONDS) * rate;
}

/** The skip buttons (1742-1747). */
export function skipHours(days: number, hours: number): number {
    return days + hours * HOUR;
}

/** A week is seven days: the "1 week" button's step (slice_2_campaign.md K6, Johnny 2026-10-04). */
export const WEEK_DAYS = 7;

/** The same time of day, a whole number of weeks on (or back, for a negative count). */
export function skipWeeks(days: number, weeks: number): number {
    return days + weeks * WEEK_DAYS;
}

/** The scrub slider (1565-1569): an offset from where the drag began. */
export function scrubbed(startDays: number, offsetDays: number): number {
    return startDays + offsetDays;
}

/** The Year field (1766-1769): the day and time of day stay. */
export function withYear(days: number, typed: string): number {
    const { day } = splitDays(days);
    return (parseInt(typed, 10) || 0) * DISPLAY_YEAR_DAYS + day - 1;
}

/** The Day field (1772-1776): clamped to 1..365, the time of day stays. */
export function withDay(days: number, typed: string): number {
    const { year, day } = splitDays(days);
    const wanted = parseInt(typed, 10) || 1;
    return year * DISPLAY_YEAR_DAYS + Math.min(DISPLAY_YEAR_DAYS, Math.max(1, wanted)) - 1 + day % 1;
}

/** The Time field (1781-1785): "HH:MM" or "HH:MM:SS". An empty value changes nothing. */
export function withTime(days: number, typed: string): number {
    if (!typed) return days;
    const parts = typed.split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return days;
    return Math.floor(days) + (parts[0] * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)) / DAY_SECONDS;
}

/** The value a time input shows: HH:MM:SS of the current day. */
export function timeFieldValue(days: number): string {
    return clockText(secondsOfDay(days));
}

/** The date in a link: `?date=DDD-YYYY`, and `&time=HHMM` when it is not midnight. */
export function formatLinkDate(days: number): { date: string; time?: string } {
    const { year, day } = splitDays(days);
    const minutes = Math.floor(secondsOfDay(days) / 60 + 1e-6);
    const yearText = year < 0 ? '-' + String(-year).padStart(4, '0') : String(year).padStart(4, '0');
    const date = String(Math.floor(day)).padStart(3, '0') + '-' + yearText;
    if (!minutes) return { date };
    return { date, time: String(Math.floor(minutes / 60)).padStart(2, '0') + String(minutes % 60).padStart(2, '0') };
}

function single(value: unknown): string {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * A link's date as a count of days, or null when it is not a valid date. The form is
 * DDD-YYYY; a day outside 001-365 is invalid and is not clamped. A time that is not HHMM
 * within 0000-2359 is ignored and the date opens at 0000.
 */
export function parseLinkDate(date: unknown, time?: unknown): number | null {
    const matched = /^(\d{3})-(-?\d{1,6})$/.exec(single(date));
    if (!matched) return null;
    const day = Number(matched[1]);
    const year = Number(matched[2]);
    if (day < 1 || day > DISPLAY_YEAR_DAYS) return null;
    let days = totalDays(year, day);
    const clock = /^(\d{2})(\d{2})$/.exec(single(time));
    if (clock) {
        const hours = Number(clock[1]);
        const minutes = Number(clock[2]);
        if (hours < 24 && minutes < 60) days += (hours * 3600 + minutes * 60) / DAY_SECONDS;
    }
    return days;
}

/**
 * Where the clock starts (first match wins): the link's date when it is valid; day 002 of
 * the selected milieu's year when a milieu other than 1105 is selected; else DEFAULT_START.
 * The viewer has no milieu selector yet, so callers pass no milieu year today.
 */
export function startDays(date: unknown, time?: unknown, milieuYear: number | null = null): number {
    const linked = parseLinkDate(date, time);
    if (linked !== null) return linked;
    if (milieuYear !== null && Number.isFinite(milieuYear) && milieuYear !== DEFAULT_START.year) {
        return totalDays(milieuYear, DEFAULT_START.day);
    }
    return totalDays(DEFAULT_START.year, DEFAULT_START.day);
}
