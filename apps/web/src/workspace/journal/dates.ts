/**
 * The two dates on an entry (journal design §4). In fiction is DDD-YYYY, day 001 to 365.
 * Played is YYYY-MM-DD. An empty field clears the date.
 */
import { parseStardate } from '../stardate.ts';

export function parseWhen(text: string): { year: number; day: number } | null {
    const typed = parseStardate(text, 1105);
    if (!typed) return null;
    if (!text.includes('-') && !text.includes('/') && !text.includes(' ')) return null;
    return { year: typed.year, day: typed.day };
}

/** A real calendar day, or null when the text is empty or not a day. */
export function parsePlayed(text: string): string | null {
    if (text.trim() === '') return null;
    const found = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(text);
    if (!found) return null;
    const year = Number(found[1]);
    const month = Number(found[2]);
    const day = Number(found[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return found[1] + '-' + found[2] + '-' + found[3];
}
