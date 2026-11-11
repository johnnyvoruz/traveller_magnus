/**
 * Board and Pay now (BT2). The fare is rules/mgt2e_trade.json, the file the referee's
 * page reads when fareFor is called with no table set. A campaign table set is not read.
 * The day count is apps/web/src/orbit/clock.ts: DISPLAY_YEAR_DAYS 365, totalDays, splitDays,
 * DEFAULT_START year 1105 day 2. The ledger date is dayOf in apps/web/src/workspace/vessel_trade.ts.
 * The due-day move is payNow in apps/web/src/campaign/ship_finance.ts. This file does not import apps/web.
 */
import tradeFile from '../../../../rules/mgt2e_trade.json' with { type: 'json' };

const FARE_KEYS = ['high', 'middle', 'basic', 'low'] as const;
type FareKey = (typeof FARE_KEYS)[number];

type PassageRow = { name?: unknown };
type FareRow = { parsecs?: unknown } & Partial<Record<FareKey, unknown>>;

const trade = tradeFile as {
    passengers?: { passages?: PassageRow[] };
    fares?: { rows?: FareRow[] };
};

function keyOf(name: string): FareKey | null {
    const word = name.trim().toLowerCase();
    return (FARE_KEYS as readonly string[]).includes(word) ? word as FareKey : null;
}

/**
 * The official file's passage name and credits for this class over this many parsecs.
 * Null when the class is not one of the four, or the jump has no row.
 */
export function officialFare(className: string, parsecs: number): { name: string; credits: number } | null {
    const key = keyOf(className);
    if (!key || !Number.isInteger(parsecs)) return null;
    const named = (trade.passengers?.passages ?? []).find((row) => typeof row.name === 'string' && keyOf(row.name) === key);
    if (!named || typeof named.name !== 'string') return null;
    const row = (trade.fares?.rows ?? []).find((one) => one.parsecs === parsecs);
    const credits = row ? row[key] : undefined;
    if (typeof credits !== 'number' || !Number.isFinite(credits)) return null;
    return { name: named.name, credits };
}

/** apps/web/src/orbit/clock.ts */
const DISPLAY_YEAR_DAYS = 365;
const DEFAULT_START = { year: 1105, day: 2 };

function totalDays(year: number, day: number): number {
    return year * DISPLAY_YEAR_DAYS + day - 1;
}

function splitDays(days: number): { year: number; day: number } {
    const year = Math.floor(days / DISPLAY_YEAR_DAYS);
    return { year, day: days - year * DISPLAY_YEAR_DAYS + 1 };
}

/** The campaign day a ledger line is dated, including the clock's default start. */
export function campaignCalendarDay(days: number | null): { year: number; day: number } {
    const count = days == null ? totalDays(DEFAULT_START.year, DEFAULT_START.day) : days;
    const split = splitDays(count);
    return { year: split.year, day: Math.min(DISPLAY_YEAR_DAYS, Math.max(1, Math.floor(split.day))) };
}

/** The next due day, moved on by everyDays the way payNow moves it. */
export function nextDueDay(due: { year: number; day: number }, everyDays: number): { year: number; day: number } {
    const next = splitDays(totalDays(due.year, due.day) + everyDays);
    return { year: next.year, day: Math.floor(next.day) };
}

/** "Fare: Ada Voss, High passage, 2 parsecs". One parsec stays singular. */
export function fareMemo(label: string, className: string, parsecs: number): string {
    const who = label.trim() || 'a passenger';
    return 'Fare: ' + who + ', ' + className + ' passage, ' + parsecs + (parsecs === 1 ? ' parsec' : ' parsecs');
}
