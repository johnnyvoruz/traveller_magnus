import type { TruthManifest } from '@voyage/shared';

/** The matching word, split out of its line so the palette can mark it. */
export type TextMark = { before: string; word: string; after: string };

export type OmniResult =
    | { kind: 'system'; name: string; detail: string; sector: string; hex: string }
    | { kind: 'sector'; name: string; detail: string; sector: string }
    | { kind: 'command'; name: string; detail: string; id: string }
    /** A campaign record (the signed-in user's own), and the row that opens the list with every match. */
    | { kind: 'record'; name: string; detail: string; id: string; thumb: string | null; mark?: TextMark }
    | { kind: 'more'; name: string; detail: string; query: string }
    /** A journal entry in the open campaign. */
    | { kind: 'entry'; name: string; detail: string; id: string; mark?: TextMark }
    /** A package already seen in this session. The palette does not fetch the catalogue. */
    | { kind: 'package'; name: string; detail: string; id: string }
    /** An empty-field example. Choosing it runs that search. It is not a place. */
    | { kind: 'example'; name: string; detail: string };

export type SearchItem = {
    sectorSlug: string;
    hex: string;
    name: string;
    uwp: string;
};

const RESULT_CAP = 40;

/** Trim, lower-case, strip accents. Same as the legacy omnibox. */
export function normalizeQuery(value: string): string {
    return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

/**
 * Within one rank, a system in the Spinward Marches leads, then the name.
 * "Regina" then comes before "Regiimaa" for a shared prefix (finding 4).
 */
function marchBias(result: OmniResult): number {
    return result.kind === 'system' && result.sector === 'Spinward_Marches' ? 0 : 1;
}

/** Every character of `needle` appears in `haystack`, in order, not necessarily together. */
function isSubsequence(haystack: string, needle: string): boolean {
    let at = 0;
    for (let i = 0; i < needle.length; i += 1) {
        const found = haystack.indexOf(needle.charAt(i), at);
        if (found < 0) return false;
        at = found + 1;
    }
    return true;
}

/**
 * Every word of the query must appear, either inside the name and detail or as a
 * subsequence of them. Rank 0 exact name, 1 name starts with the query, 2 the words
 * are contained, 3 subsequence only. Within a rank, the Spinward Marches, then the name.
 * At most 40.
 */
export function rankResults(query: string, results: OmniResult[]): OmniResult[] {
    const normalized = normalizeQuery(query);
    const words = normalized.split(/\s+/).filter((word) => word.length > 0);
    if (!words.length) return [];
    const ranked: { result: OmniResult; rank: number }[] = [];
    for (const result of results) {
        const haystack = normalizeQuery(result.name + ' ' + result.detail);
        const included = words.every((word) => haystack.includes(word));
        const fuzzy = !included && words.every((word) => isSubsequence(haystack, word));
        if (!included && !fuzzy) continue;
        const name = normalizeQuery(result.name);
        const rank = name === normalized ? 0 : name.startsWith(normalized) ? 1 : included ? 2 : 3;
        ranked.push({ result, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank || marchBias(a.result) - marchBias(b.result) || a.result.name.localeCompare(b.result.name));
    return ranked.slice(0, RESULT_CAP).map((item) => item.result);
}

/** The palette group for one row. Recent rows are labelled by the caller, ahead of these. */
export function groupOf(result: OmniResult): 'Worlds' | 'Records' | 'Entries' | 'Commands' | 'Packages' | 'Try' {
    switch (result.kind) {
        case 'system':
        case 'sector':
            return 'Worlds';
        case 'record':
        case 'more':
            return 'Records';
        case 'entry':
            return 'Entries';
        case 'command':
            return 'Commands';
        case 'package':
            return 'Packages';
        case 'example':
            return 'Try';
    }
}

/**
 * The first line that contains `word`, with that word split out. Matching is the palette's
 * own folding: trim, lower case, accents dropped. A line longer than 160 characters is cut
 * around the word.
 */
export function markedLine(text: string, word: string): TextMark | null {
    const needle = normalizeQuery(word);
    if (!needle) return null;
    for (const line of text.split(/\r?\n/)) {
        const folded = normalizeQuery(line);
        const at = folded.indexOf(needle);
        if (at < 0) continue;
        const same = folded.length === line.length;
        const start = same ? at : line.toLocaleLowerCase().indexOf(needle);
        if (start < 0) continue;
        const mark = {
            before: line.slice(0, start),
            word: line.slice(start, start + needle.length),
            after: line.slice(start + needle.length),
        };
        return clampMark(mark);
    }
    return null;
}

function clampMark(mark: TextMark): TextMark {
    const all = mark.before + mark.word + mark.after;
    const limit = 160;
    if (all.length <= limit) return mark;
    const wordAt = mark.before.length;
    let start = Math.max(0, wordAt - 60);
    let end = Math.min(all.length, start + limit);
    start = Math.max(0, end - limit);
    const cut = all.slice(start, end);
    const local = wordAt - start;
    return {
        before: (start > 0 ? '…' : '') + cut.slice(0, local),
        word: cut.slice(local, local + mark.word.length),
        after: cut.slice(local + mark.word.length) + (end < all.length ? '…' : ''),
    };
}

/** Journal titles, and a body line when `query` names a word in that body. A deleted entry is left out. */
export function entryResults(
    entries: readonly { id: string; title: string; body?: string; deleted?: boolean }[],
    query = '',
): OmniResult[] {
    const words = normalizeQuery(query).split(/\s+/).filter((word) => word.length > 0);
    const needle = words.length ? words[words.length - 1] : '';
    const out: OmniResult[] = [];
    for (const entry of entries) {
        if (entry.deleted) continue;
        const name = entry.title.trim();
        const mark = needle ? markedLine(entry.body ?? '', needle) : null;
        const row: Extract<OmniResult, { kind: 'entry' }> = {
            kind: 'entry',
            name: name || 'Untitled',
            detail: mark ? mark.before + mark.word + mark.after : 'Journal entry',
            id: entry.id,
            ...(mark ? { mark } : {}),
        };
        out.push(row);
    }
    return out;
}

/** Package cards already on hand. Ranking is the caller's. */
export function packageResults(cards: readonly { id: string; title: string }[]): OmniResult[] {
    return cards.map((card) => ({ kind: 'package', name: card.title, detail: 'Package', id: card.id }));
}

export function sectorMatches(query: string, manifest: TruthManifest, layer: 'canonical' | 'all'): OmniResult[] {
    const results: OmniResult[] = [];
    for (const sector of manifest.sectors) {
        if (layer === 'canonical' && !sector.canonical) continue;
        results.push({ kind: 'sector', name: sector.name, detail: 'Sector', sector: sector.slug });
    }
    return rankResults(query, results);
}

export function systemResults(items: SearchItem[], manifest: TruthManifest, layer: 'canonical' | 'all'): OmniResult[] {
    const sectors = new Map<string, { name: string; canonical: boolean }>();
    for (const sector of manifest.sectors) sectors.set(sector.slug, { name: sector.name, canonical: sector.canonical });
    const visible = layer === 'canonical'
        ? items.filter((item) => {
            const sector = sectors.get(item.sectorSlug);
            return sector !== undefined && sector.canonical;
        })
        : items;
    return visible.map((item) => {
        const sector = sectors.get(item.sectorSlug);
        const sectorName = sector ? sector.name : item.sectorSlug;
        return {
            kind: 'system' as const,
            name: item.name,
            detail: sectorName + ' ' + item.hex + ' · ' + item.uwp,
            sector: item.sectorSlug,
            hex: item.hex,
        };
    });
}
