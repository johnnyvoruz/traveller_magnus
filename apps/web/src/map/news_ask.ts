/**
 * "Spread this news" (spec_xboat_ripples.md §4.2; streams/D.md XD3): a record or a journal entry
 * with a date and a place can be the news. It asks; the map view, which holds the ripple, hears.
 * Nothing is written to the record: the ripple is a view.
 */
import { totalDays } from '../orbit/clock.ts';

/** Where the news starts and on which day (the orbit clock's day count). */
export type NewsAsk = { hexKey: string; day0: number };

/** What the button does for one record or entry: spread it, say why it cannot, or not show. */
export type SpreadState = { ok: true; ask: NewsAsk } | { ok: false; why: string } | null;

/**
 * The date-and-place rule (decided 2026-10-17 23:10). Both: the news. A date and no place: the button
 * is shown unable, with one line saying the place is missing. No date: no button, as an undated
 * thing is rarely news. The kind of record does not matter.
 */
export function spreadState(when: { year: number; day: number } | null, hexKey: string | null): SpreadState {
    if (when && hexKey) return { ok: true, ask: { hexKey, day0: totalDays(when.year, when.day) } };
    if (when) return { ok: false, why: 'To spread this news, add a place.' };
    return null;
}

const listeners = new Set<(ask: NewsAsk) => void>();

/** The map view listens while it is mounted. */
export function onNewsAsk(hear: (ask: NewsAsk) => void): () => void {
    listeners.add(hear);
    return () => { listeners.delete(hear); };
}

/** Asks the map for the ripple; false when no map is listening. */
export function askNews(ask: NewsAsk): boolean {
    if (!listeners.size) return false;
    for (const hear of listeners) hear(ask);
    return true;
}
