/**
 * The store's filters (prompts/d_store_2.md item 2): Amazon's results-page patterns, never its
 * money. Each section is a list of choices with counts; within a section the choices combine with
 * OR, across sections with AND. A section's counts are taken over the cards every other section
 * lets through, so a count is what ticking that box would show. The filters live in the URL query,
 * so Back and a shared link restore them. Counts and filtering run in the browser over the loaded
 * cards (decision of 2026-10-15). Pure: it runs under Node.
 */
import type { PackageCard } from '../../marketplace/catalogue.ts';
import { FAMILIES, FAMILY_WORDS, kindFamily, type KindFamily } from '../../marketplace/covers.ts';
import { isFamily } from './storefront.ts';

export type Contents = 'hexes' | 'records';
export type UpdatedWithin = '' | '7' | '30';

export type StoreFilters = {
    kinds: KindFamily[];
    contents: Contents[];
    editions: string[];
    tags: string[];
    updated: UpdatedWithin;
    by: string[];
};

export type FilterKey = keyof StoreFilters;

/** The query key of each section. `kind` and `tag` are the store's keys from before the column. */
export const QUERY_KEYS: Readonly<Record<FilterKey, string>> = {
    kinds: 'kind',
    contents: 'contents',
    editions: 'edition',
    tags: 'tag',
    updated: 'updated',
    by: 'by',
};

export const CONTENTS_WORDS: Readonly<Record<Contents, string>> = {
    hexes: 'Has map hexes',
    records: 'Records only',
};

export const UPDATED_WORDS: Readonly<Record<UpdatedWithin, string>> = {
    '7': 'Last 7 days',
    '30': 'Last 30 days',
    '': 'Any time',
};

/** Cards a results page shows before "Show more". */
export const PAGE_SIZE = 24;
/** Tags listed before "See more". */
export const TAGS_SHOWN = 10;

const DAY = 86_400_000;

export const NO_FILTERS: StoreFilters = { kinds: [], contents: [], editions: [], tags: [], updated: '', by: [] };

/** A query value as a list: `?tag=a&tag=b` and `?tag=a` alike, blanks dropped, each once. */
function many(value: unknown): string[] {
    const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    const out: string[] = [];
    for (const item of list) {
        if (typeof item !== 'string') continue;
        const text = item.trim();
        if (text && !out.includes(text)) out.push(text);
    }
    return out;
}

/** The filters in a route's query. An old `?kind=` of any kind text reads as its family. */
export function readFilters(query: Readonly<Record<string, unknown>>): StoreFilters {
    const kinds = new Set<KindFamily>(many(query.kind).map((text) => (isFamily(text) ? text : kindFamily(text))));
    const contents = many(query.contents).filter((text): text is Contents => text === 'hexes' || text === 'records');
    const updated = many(query.updated)[0];
    return {
        kinds: FAMILIES.filter((family) => kinds.has(family)),
        contents: (['hexes', 'records'] as const).filter((item) => contents.includes(item)),
        editions: many(query.edition),
        tags: many(query.tag),
        updated: updated === '7' || updated === '30' ? updated : '',
        by: many(query.by),
    };
}

/** The filters as query keys: only the sections in use. One choice is a string, more are a list. */
export function filterQuery(filters: StoreFilters): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {};
    for (const key of ['kinds', 'contents', 'editions', 'tags', 'by'] as const) {
        const list = filters[key];
        if (list.length === 1) query[QUERY_KEYS[key]] = list[0];
        else if (list.length > 1) query[QUERY_KEYS[key]] = [...list];
    }
    if (filters.updated) query.updated = filters.updated;
    return query;
}

/** How many choices are on: the "Filters (2)" count. */
export function activeCount(filters: StoreFilters): number {
    return filters.kinds.length + filters.contents.length + filters.editions.length + filters.tags.length + (filters.updated ? 1 : 0) + filters.by.length;
}

function contentsOf(card: Pick<PackageCard, 'hexCount'>): Contents {
    return card.hexCount > 0 ? 'hexes' : 'records';
}

function within(card: Pick<PackageCard, 'updatedAt'>, days: UpdatedWithin, now: number): boolean {
    if (!days) return true;
    const at = Date.parse(card.updatedAt);
    return Number.isFinite(at) && now - at <= Number(days) * DAY;
}

/** Whether a card passes every section but `skip`. */
export function passes(card: PackageCard, filters: StoreFilters, now: number, skip: FilterKey | null = null): boolean {
    if (skip !== 'kinds' && filters.kinds.length && !filters.kinds.includes(kindFamily(card.kind))) return false;
    if (skip !== 'contents' && filters.contents.length && !filters.contents.includes(contentsOf(card))) return false;
    if (skip !== 'editions' && filters.editions.length && !filters.editions.includes(card.edition)) return false;
    if (skip !== 'tags' && filters.tags.length && !card.tags.some((tag) => filters.tags.includes(tag))) return false;
    if (skip !== 'updated' && !within(card, filters.updated, now)) return false;
    if (skip !== 'by' && filters.by.length && !filters.by.includes(card.authorHandle)) return false;
    return true;
}

export function applyFilters(cards: readonly PackageCard[], filters: StoreFilters, now: number): PackageCard[] {
    return cards.filter((card) => passes(card, filters, now));
}

export type Facet = { value: string; words: string; count: number; on: boolean };

export type Facets = {
    kinds: Facet[];
    contents: Facet[];
    editions: Facet[];
    /** The ten most used first; "See more" shows the rest. */
    tags: Facet[];
    updated: Facet[];
    /** Empty while the loaded cards have one publisher. */
    by: Facet[];
};

/** Values by how often they occur in the loaded cards, then by name. */
function ranked(values: readonly string[]): string[] {
    const seen = new Map<string, number>();
    for (const value of values) seen.set(value, (seen.get(value) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
}

/**
 * Every section's choices with counts. A choice is listed while it has a count or is on, so a
 * box never vanishes under the pointer that ticked it. "Records only" is listed only while some
 * loaded package has no map hexes.
 */
export function facets(cards: readonly PackageCard[], filters: StoreFilters, now: number): Facets {
    const others = (key: FilterKey) => cards.filter((card) => passes(card, filters, now, key));
    const list = (key: FilterKey, values: readonly string[], valueOf: (card: PackageCard) => string[], words: (value: string) => string, on: readonly string[]): Facet[] => {
        const pool = others(key);
        return values
            .map((value) => ({ value, words: words(value), count: pool.filter((card) => valueOf(card).includes(value)).length, on: on.includes(value) }))
            .filter((facet) => facet.count > 0 || facet.on);
    };
    const anyRecordsOnly = cards.some((card) => contentsOf(card) === 'records');
    const handles = ranked(cards.map((card) => card.authorHandle));
    const updatedPool = others('updated');
    return {
        kinds: list('kinds', FAMILIES, (card) => [kindFamily(card.kind)], (value) => FAMILY_WORDS[value as KindFamily], filters.kinds),
        contents: list('contents', anyRecordsOnly || filters.contents.includes('records') ? ['hexes', 'records'] : ['hexes'], (card) => [contentsOf(card)], (value) => CONTENTS_WORDS[value as Contents], filters.contents),
        editions: list('editions', ranked([...cards.map((card) => card.edition), ...filters.editions]), (card) => [card.edition], (value) => value, filters.editions),
        tags: list('tags', ranked([...cards.flatMap((card) => card.tags), ...filters.tags]), (card) => card.tags, (value) => value, filters.tags),
        updated: (['7', '30', ''] as const).map((value) => ({
            value,
            words: UPDATED_WORDS[value],
            count: updatedPool.filter((card) => within(card, value, now)).length,
            on: filters.updated === value,
        })),
        by: handles.length > 1 || filters.by.length ? list('by', ranked([...handles, ...filters.by]), (card) => [card.authorHandle], (value) => '@' + value, filters.by) : [],
    };
}

/** One choice turned on or off; Updated is one choice of three. */
export function toggle(filters: StoreFilters, key: FilterKey, value: string): StoreFilters {
    if (key === 'updated') return { ...filters, updated: value === '7' || value === '30' ? value : '' };
    const list = filters[key] as string[];
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    if (key === 'kinds') return { ...filters, kinds: FAMILIES.filter((family) => next.includes(family)) };
    if (key === 'contents') return { ...filters, contents: (['hexes', 'records'] as const).filter((item) => next.includes(item)) };
    return { ...filters, [key]: next };
}

export type ActiveFilter = { key: FilterKey; value: string; words: string };

/** The choices that are on, as removable chips above the results, in the column's order. */
export function activeFilters(filters: StoreFilters): ActiveFilter[] {
    return [
        ...filters.kinds.map((value) => ({ key: 'kinds' as const, value, words: FAMILY_WORDS[value] })),
        ...filters.contents.map((value) => ({ key: 'contents' as const, value, words: CONTENTS_WORDS[value] })),
        ...filters.editions.map((value) => ({ key: 'editions' as const, value, words: 'Edition: ' + value })),
        ...filters.tags.map((value) => ({ key: 'tags' as const, value, words: 'Tag: ' + value })),
        ...(filters.updated ? [{ key: 'updated' as const, value: filters.updated, words: 'Updated: ' + UPDATED_WORDS[filters.updated] }] : []),
        ...filters.by.map((value) => ({ key: 'by' as const, value, words: 'By @' + value })),
    ];
}

/**
 * The results line: "1–24 of 31 results for “regina”". All on one page: "7 results". With more
 * on the server than is loaded, the total is a floor: "1–24 of at least 100 results".
 */
export function resultsWords(shown: number, total: number, more: boolean, q: string): string {
    const words = q.trim() ? ' for “' + q.trim() + '”' : '';
    if (total === 0) return 'No results' + words;
    const noun = total === 1 && !more ? 'result' : 'results';
    if (shown >= total && !more) return total.toLocaleString('en-US') + ' ' + noun + words;
    return '1–' + shown.toLocaleString('en-US') + ' of ' + (more ? 'at least ' : '') + total.toLocaleString('en-US') + ' ' + noun + words;
}
