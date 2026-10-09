/**
 * How a journal row reads (journal design §2). The order is the store's: this module does
 * not sort. Search is one pass over the stored title and body, plus the line a reader
 * would read. At 2,000 entries that is the strings already in memory, on each keystroke,
 * and it stays on the main thread. No index.
 */
import type { CampaignAnchor, CampaignEntry, CampaignEntryKind, CampaignRecord } from '@voyage/shared';
import { resolveAnchor } from '../party.ts';
import { hexWords } from '../places.ts';
import { weekdayName } from '../stardate.ts';

export const KIND_ORDER = ['session', 'note', 'handout', 'rumor'] as const;

const KIND_WORD: Record<CampaignEntryKind, string> = {
    session: 'Session',
    note: 'Note',
    handout: 'Handout',
    rumor: 'Rumour',
};

/** The filter's words are plural. A row's chip stays the singular kindWord. */
const FILTER_WORD: Record<CampaignEntryKind, string> = {
    session: 'Sessions',
    note: 'Notes',
    handout: 'Handouts',
    rumor: 'Rumours',
};

const KIND_ICON: Record<CampaignEntryKind, 'calendar-star' | 'note-sticky' | 'book-atlas' | 'radar'> = {
    session: 'calendar-star',
    note: 'note-sticky',
    handout: 'book-atlas',
    rumor: 'radar',
};

export type KindFilter = 'all' | CampaignEntryKind;

/**
 * Which rows a scrolling list draws. `top` is the distance from the start of the list
 * to the top of the scrollport, in px. The ends include a few rows past the port.
 */
export function visibleRange(count: number, top: number, height: number, row: number, overscan = 6): { start: number; end: number } {
    if (count <= 0 || !(row > 0) || !(height > 0)) return { start: 0, end: 0 };
    const into = Number.isFinite(top) ? top : 0;
    const start = Math.max(0, Math.floor(into / row) - overscan);
    const end = Math.min(count, Math.ceil((into + height) / row) + overscan);
    return { start, end: Math.max(start, end) };
}

export type RowFace = {
    id: string;
    kind: CampaignEntryKind;
    icon: 'calendar-star' | 'note-sticky' | 'book-atlas' | 'radar';
    chip: string;
    /** The session number beside the title. Null when the title is empty: the name carries it. */
    number: string | null;
    name: string;
    /** The name is the body's first line, not a title the referee wrote. */
    soft: boolean;
    /** The body's first line, left off when it would repeat the name. */
    summary: string | null;
    meta: string;
};

export function kindWord(kind: CampaignEntryKind): string {
    return KIND_WORD[kind];
}

export function filterWord(kind: CampaignEntryKind): string {
    return FILTER_WORD[kind];
}

function firstLine(body: string): string {
    for (const line of body.split('\n')) {
        const text = line.trim();
        if (text) return text;
    }
    return '';
}

/** Same token as body.ts. A row never draws the brackets or the id. */
const ROW_TOKEN = /\[\[(cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|hex:[^/\]|]+\/\d{4})(?:\|([^\]]*))?\]\]/gi;

export type NameOf = (target: string) => string | null;

/**
 * One line as a reader would read it. A written label wins. With none, `nameOf` supplies
 * the record's name or the system's name. Neither: the token is left out.
 */
export function readLine(line: string, nameOf: NameOf): string {
    let out = '';
    let at = 0;
    ROW_TOKEN.lastIndex = 0;
    for (const match of line.matchAll(ROW_TOKEN)) {
        const index = match.index ?? 0;
        out += line.slice(at, index);
        const written = match[2] ? match[2].trim() : '';
        const named = written || (nameOf(match[1] ?? '') ?? '').trim();
        if (named) out += named;
        at = index + match[0].length;
    }
    out += line.slice(at);
    return out.replace(/[ \t]{2,}/g, ' ').trim();
}

function readable(text: string, nameOf: NameOf): string {
    return text.split('\n').map((line) => readLine(line, nameOf)).join('\n');
}

/** The row's name. A session with no title is "Session 14". Anything else uses the body's first line, then "Untitled …". */
export function entryName(entry: CampaignEntry, nameOf: NameOf = () => null): string {
    const title = entry.title.trim();
    if (title) return title;
    if (entry.kind === 'session') {
        return entry.sequence != null ? 'Session ' + entry.sequence : 'Session';
    }
    const line = readLine(firstLine(entry.body), nameOf);
    if (line) return line;
    return 'Untitled ' + KIND_WORD[entry.kind].toLowerCase();
}

/** DDD-YYYY from a journal date. The weekday is separate. */
export function whenText(when: { year: number; day: number }): string {
    const year = when.year < 0 ? '-' + String(-when.year).padStart(4, '0') : String(when.year).padStart(4, '0');
    return String(when.day).padStart(3, '0') + '-' + year;
}

export function whenWeekday(when: { year: number; day: number }): string {
    return weekdayName(when.day);
}

/** Where the row says the entry is. A record anchor is "Aboard …". A system is "Regina 1910" when it has a name. */
export function entryPlace(anchor: CampaignAnchor, records: Readonly<Record<string, CampaignRecord>>): string {
    if (!anchor) return 'Nowhere in particular';
    if (anchor.kind === 'record') {
        const host = records[anchor.id];
        return host && !host.deleted ? 'Aboard ' + host.name : 'With another record';
    }
    const hex = anchor.hexKey.split('/').pop() ?? '';
    const name = anchor.locationLabel ? anchor.locationLabel.trim() : '';
    if (name && hex) return name + ' ' + hex;
    if (name) return name;
    return hexWords(anchor.hexKey);
}

function metaLine(entry: CampaignEntry, place: string): string {
    const parts: string[] = [];
    if (entry.kind === 'handout' && entry.visibility === 'players') parts.push('Players');
    if (entry.when) parts.push(whenText(entry.when));
    if (entry.realDate) parts.push(entry.kind === 'session' ? 'played ' + entry.realDate : entry.realDate);
    parts.push(place);
    return parts.join(' · ');
}

function resolveName(target: string, records: Readonly<Record<string, CampaignRecord>>, nameOf: NameOf): string | null {
    const named = nameOf(target);
    if (named && named.trim()) return named.trim();
    if (target.startsWith('cr_')) {
        const host = records[target];
        if (host && !host.deleted && host.name.trim()) return host.name.trim();
    }
    return null;
}

export function rowFace(entry: CampaignEntry, records: Readonly<Record<string, CampaignRecord>>, nameOf: NameOf = () => null): RowFace {
    const resolve = (target: string) => resolveName(target, records, nameOf);
    const name = entryName(entry, resolve);
    const line = readLine(firstLine(entry.body), resolve);
    const titled = entry.title.trim().length > 0;
    return {
        id: entry.id,
        kind: entry.kind,
        icon: KIND_ICON[entry.kind],
        chip: KIND_WORD[entry.kind],
        number: entry.kind === 'session' && titled && entry.sequence != null ? String(entry.sequence) : null,
        name,
        soft: !titled && entry.kind !== 'session',
        summary: line && line !== name ? line : null,
        meta: metaLine(entry, entryPlace(anchorOf(entry), records)),
    };
}

function anchorOf(entry: CampaignEntry): CampaignAnchor {
    return entry.anchor;
}

/** Touches the anchor through resolveAnchor so a record aboard a vessel follows that vessel's hex in the caller's own filter. */
export function entryHex(entry: CampaignEntry, records: Readonly<Record<string, CampaignRecord>>): string | null {
    const place = resolveAnchor(entry.anchor, records);
    return place ? place.hexKey : null;
}

export type JournalFilter = {
    kind: KindFilter;
    query: string;
    /** Live entry ids at the chip's hex. Null keeps every place. */
    hexIds: ReadonlySet<string> | null;
    /** Resolves a token that has no written label. Omitted, only the stored text is read. */
    nameOf?: NameOf;
};

/**
 * Keeps the store's order. A kind, a place and the search narrow it. Each word of the
 * search must sit in the stored title or body, or in the line a reader would read.
 * At 2,000 entries this walks those strings once per keystroke. They are already in
 * memory, and the walk stays on the main thread.
 */
export function filterEntries(entries: readonly CampaignEntry[], filter: JournalFilter): CampaignEntry[] {
    const words = filter.query.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
    const nameOf = filter.nameOf ?? (() => null);
    return entries.filter((entry) => {
        if (filter.kind !== 'all' && entry.kind !== filter.kind) return false;
        if (filter.hexIds && !filter.hexIds.has(entry.id)) return false;
        if (words.length === 0) return true;
        const hay = (entry.title + '\n' + entry.body + '\n' + readable(entry.body, nameOf)).toLowerCase();
        return words.every((word) => hay.includes(word));
    });
}

export function kindCounts(entries: readonly CampaignEntry[]): Record<KindFilter, number> {
    const counts: Record<KindFilter, number> = { all: entries.length, session: 0, note: 0, handout: 0, rumor: 0 };
    for (const entry of entries) counts[entry.kind] += 1;
    return counts;
}

/** The empty line for a kind that has none, and the button that makes one. */
export function emptyKind(kind: KindFilter): { line: string; action: string; make: CampaignEntryKind } | null {
    if (kind === 'session') return { line: 'No sessions yet.', action: 'New session', make: 'session' };
    if (kind === 'note') return { line: 'No notes yet.', action: 'New note', make: 'note' };
    if (kind === 'handout') return { line: 'No handouts yet.', action: 'New handout', make: 'handout' };
    if (kind === 'rumor') return { line: 'No rumours yet.', action: 'New rumour', make: 'rumor' };
    return null;
}
