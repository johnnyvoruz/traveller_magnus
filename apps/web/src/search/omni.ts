import type { TruthManifest } from '@voyage/shared';

export type OmniResult =
    | { kind: 'system'; name: string; detail: string; sector: string; hex: string }
    | { kind: 'sector'; name: string; detail: string; sector: string }
    | { kind: 'command'; name: string; detail: string; id: string }
    /** A campaign record (the signed-in user's own), and the row that opens the list with every match. */
    | { kind: 'record'; name: string; detail: string; id: string }
    | { kind: 'more'; name: string; detail: string; query: string };

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
 * Every word of the query must appear. Rank 0 exact name, 1 name starts with
 * the query, 2 otherwise, then by name. At most 40.
 */
export function rankResults(query: string, results: OmniResult[]): OmniResult[] {
    const normalized = normalizeQuery(query);
    const words = normalized.split(/\s+/).filter((word) => word.length > 0);
    if (!words.length) return [];
    const ranked: { result: OmniResult; rank: number }[] = [];
    for (const result of results) {
        const haystack = normalizeQuery(result.name + ' ' + result.detail);
        if (!words.every((word) => haystack.includes(word))) continue;
        const name = normalizeQuery(result.name);
        const rank = name === normalized ? 0 : name.startsWith(normalized) ? 1 : 2;
        ranked.push({ result, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank || a.result.name.localeCompare(b.result.name));
    return ranked.slice(0, RESULT_CAP).map((item) => item.result);
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
