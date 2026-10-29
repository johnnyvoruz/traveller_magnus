/**
 * Session mode (streams/D.md DU1; UX backlog U1): the live session at the table. One command starts it:
 * a session entry is made (the journal's own draft: the next number, today's date, the party's place)
 * and the Campaign panel becomes the board at Full. The board's clock moves the view day only
 * ("looking is not advancing", ClockLine.vue): the campaign date moves when the session ends and the
 * referee says so. The live session is this browser's (device storage), never the campaign's: nothing
 * new is stored on the server. Pure where it can be: the steps, the decisions and the words run under Node.
 */
import { reactive } from 'vue';
import { storageGet, storageSet } from '../../platform/browser.ts';
import { clockText, HOUR, secondsOfDay, WEEK_DAYS } from '../../orbit/clock.ts';
import { stardate } from '../stardate.ts';

/** Device key for the live session. One browser, one session. */
export const LIVE_KEY = 'voyage.session.live';

export type LiveSession = {
    universeId: string;
    /** The session entry the board writes in. */
    entryId: string;
    /** When Start was pressed, ISO. */
    startedAt: string;
    /** The board's clock: the orbit clock's day count. Null follows the campaign date. */
    days: number | null;
};

export const live = reactive<{ now: LiveSession | null; read: boolean }>({ now: null, read: false });

/** The stored session, or null for nothing, nonsense, or a shape from another build. */
export function parseLive(raw: string | null): LiveSession | null {
    if (!raw) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.universeId !== 'string' || !row.universeId || typeof row.entryId !== 'string' || !row.entryId || typeof row.startedAt !== 'string') return null;
    const days = typeof row.days === 'number' && Number.isFinite(row.days) ? row.days : null;
    return { universeId: row.universeId, entryId: row.entryId, startedAt: row.startedAt, days };
}

/** Reads the device once; a raw string stands in for the device under Node. */
export function readLive(raw?: string | null): LiveSession | null {
    if (!live.read || raw !== undefined) {
        live.now = parseLive(raw === undefined ? storageGet(LIVE_KEY) : raw);
        live.read = true;
    }
    return live.now;
}

function keep(): void {
    storageSet(LIVE_KEY, live.now ? JSON.stringify(live.now) : '');
}

export function beginLive(universeId: string, entryId: string, startedAt: string, days: number | null): LiveSession {
    live.now = { universeId, entryId, startedAt, days };
    live.read = true;
    keep();
    return live.now;
}

export function setLiveDays(days: number | null): void {
    if (!live.now) return;
    live.now = { ...live.now, days };
    keep();
}

export function endLive(): void {
    live.now = null;
    live.read = true;
    keep();
}

/** The live session when it is this campaign's. */
export function liveFor(universeId: string | null): LiveSession | null {
    const now = live.now;
    return now && universeId && now.universeId === universeId ? now : null;
}

export type StepKind = 'hour' | 'day' | 'week';

/** The one-button row: the clock moves on, never back (Back to the campaign date is its own control). */
export const STEPS: readonly { kind: StepKind; label: string }[] = [
    { kind: 'hour', label: '+1 hour' },
    { kind: 'day', label: '+1 day' },
    { kind: 'week', label: '+1 week' },
];

/** The clock stepped: an hour, a day, or a week (seven days: orbit/clock.ts WEEK_DAYS) on. */
export function step(days: number, kind: StepKind): number {
    if (kind === 'hour') return days + HOUR;
    if (kind === 'day') return days + 1;
    return days + WEEK_DAYS;
}

/** "14:30": the time of day on the board's clock. */
export function timeWords(days: number): string {
    return clockText(secondsOfDay(days)).slice(0, 5);
}

/** The board's clock is not the campaign date, by a minute or more. */
export function clockMoved(sessionDays: number, campaignDays: number): boolean {
    return Math.abs(sessionDays - campaignDays) >= HOUR / 60;
}

/** The one question End asks when the clock moved. Escape keeps the date; the session ends either way. */
export function endAsk(sessionDays: number, campaignDays: number, label: string): { title: string; text: string; confirm: string; cancel: string } {
    const to = stardate(sessionDays);
    const from = stardate(campaignDays);
    return {
        title: 'Advance the campaign date?',
        text: 'The clock stands at ' + to.date + ', ' + to.weekday + ' ' + timeWords(sessionDays) + '. The campaign date is ' + from.date
            + '. Advance it to the clock, or keep it. ' + label + ' stays in the journal either way.',
        confirm: 'Advance to ' + to.date,
        cancel: 'Keep ' + from.date,
    };
}

/** "Session 3", or the entry's own title. */
export function sessionLabel(entry: { title: string; sequence: number | null }): string {
    if (entry.title.trim()) return entry.title.trim();
    return entry.sequence != null ? 'Session ' + entry.sequence : 'Session';
}

/** The real date the session was played, YYYY-MM-DD in the referee's own calendar (the journal's "played" date). */
export function playedDate(now: Date): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
}

/** "Since 14:05": when Start was pressed, in the referee's own clock. */
export function sinceWords(startedAt: string): string {
    const time = Date.parse(startedAt);
    if (Number.isNaN(time)) return '';
    const d = new Date(time);
    return 'Since ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** "Session 3 ended." */
export function endedWords(label: string, advanced: boolean, date: string): string {
    return advanced ? label + ' ended. The campaign date is ' + date + '.' : label + ' ended.';
}
