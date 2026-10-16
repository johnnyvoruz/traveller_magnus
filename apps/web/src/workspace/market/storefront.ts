/**
 * The marketplace as a storefront (prompts/d_storefront.md): the featured row, the kind chips,
 * a card's facts, relative dates, and what a package page lists inside. Everything is free:
 * Import is the buy button, and no money word appears anywhere. Pure: it runs under Node.
 */
import type { CampaignImage } from '@voyage/shared';
import type { PackageCard, PublicRecord } from '../../marketplace/catalogue.ts';
import { FAMILIES, kindFamily, type KindFamily } from '../../marketplace/covers.ts';
import { parseHexKey } from '../places.ts';
import { plural } from './market.ts';

/** The featured row shows only while the catalogue has at least this many packages. */
export const FEATURED_MIN = 6;
export const FEATURED_COUNT = 3;

/** The three most-imported packages; none while the catalogue is thin. Ties go to the latest update. */
export function featured(cards: readonly PackageCard[]): PackageCard[] {
    if (cards.length < FEATURED_MIN) return [];
    return [...cards]
        .sort((a, b) => b.installs - a.installs || b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title))
        .slice(0, FEATURED_COUNT);
}

/** The families present among these cards, in chip order. */
export function familiesIn(cards: readonly { kind: string }[]): KindFamily[] {
    const present = new Set(cards.map((card) => kindFamily(card.kind)));
    return FAMILIES.filter((family) => present.has(family));
}

/** The cards of one family; every card for "" (All). */
export function ofFamily<T extends { kind: string }>(cards: readonly T[], family: KindFamily | ''): T[] {
    return family ? cards.filter((card) => kindFamily(card.kind) === family) : [...cards];
}

export function isFamily(text: string): text is KindFamily {
    return (FAMILIES as readonly string[]).includes(text);
}

/** The first letter up: "sector piece" reads "Sector piece". */
export function kindWords(kind: string): string {
    const text = kind.trim();
    return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** A card's one line of facts, in priority order: kind, hexes, imports. */
export function cardFacts(card: Pick<PackageCard, 'kind' | 'hexCount' | 'installs'>): string {
    return [kindWords(card.kind), plural(card.hexCount, 'hex', 'hexes'), plural(card.installs, 'import', 'imports')].join(' · ');
}

const DAY = 86_400_000;

/** "Updated today", "Updated 3 days ago", "Updated 2 months ago". */
export function updatedWords(iso: string, now: number = Date.now()): string {
    const at = Date.parse(iso);
    if (!Number.isFinite(at)) return '';
    const days = Math.max(0, Math.floor((now - at) / DAY));
    if (days === 0) return 'Updated today';
    if (days === 1) return 'Updated yesterday';
    if (days < 14) return 'Updated ' + days + ' days ago';
    if (days < 60) return 'Updated ' + Math.floor(days / 7) + ' weeks ago';
    if (days < 365) return 'Updated ' + Math.floor(days / 30) + ' months ago';
    const years = Math.floor(days / 365);
    return 'Updated ' + (years === 1 ? '1 year' : years + ' years') + ' ago';
}

// ---- what's inside ------------------------------------------------------------------------------------

/** "Spinward Marches", or the own sectors counted, in the order first met. */
export function sectorNames(keys: readonly string[], ownSectors: readonly string[]): string[] {
    const own = new Set(ownSectors);
    const named: string[] = [];
    let owned = 0;
    const seen = new Set<string>();
    for (const key of keys) {
        const place = parseHexKey(key);
        if (!place || seen.has(place.slug)) continue;
        seen.add(place.slug);
        if (own.has(place.slug)) owned += 1;
        else named.push(place.slug.replace(/_/g, ' '));
    }
    if (owned) named.push(owned === 1 ? 'an own sector' : owned + ' own sectors');
    return named;
}

/** "6 hexes in Spinward Marches", "40 hexes in Spinward Marches and Deneb". */
export function hexesInside(keys: readonly string[], ownSectors: readonly string[]): string {
    const names = sectorNames(keys, ownSectors);
    const hexes = plural(keys.length, 'hex', 'hexes');
    if (!names.length) return hexes;
    if (names.length > 3) return hexes + ' in ' + plural(names.length, 'sector', 'sectors');
    const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    return hexes + ' in ' + list;
}

/** A record type's heading on the page. */
export const RECORD_GROUP_WORDS: Readonly<Record<string, string>> = {
    person: 'People',
    place: 'Places',
    business: 'Businesses',
    organization: 'Organizations',
    job: 'Jobs',
    event: 'Events',
    item: 'Items',
    note: 'Notes',
    vessel: 'Ships',
};

export type RecordGroup = { type: string; words: string; items: { id: string; name: string; thumbHash: string | null }[] };

/** The records by type, in the order of RECORD_GROUP_WORDS, each group by name. */
export function recordGroups(records: readonly PublicRecord[]): RecordGroup[] {
    const order = Object.keys(RECORD_GROUP_WORDS);
    const groups = new Map<string, RecordGroup>();
    for (const record of records) {
        const group = groups.get(record.type) ?? { type: record.type, words: RECORD_GROUP_WORDS[record.type] ?? kindWords(record.type), items: [] };
        group.items.push({ id: record.id, name: record.name, thumbHash: record.images[0] ? record.images[0].thumbHash : null });
        groups.set(record.type, group);
    }
    const rank = (type: string) => { const at = order.indexOf(type); return at < 0 ? order.length : at; };
    return [...groups.values()]
        .map((group) => ({ ...group, items: group.items.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type));
}

/** Every record image once, in record order; a picture with no caption carries its record's name. */
export function galleryImages(records: readonly PublicRecord[]): CampaignImage[] {
    const seen = new Set<string>();
    const out: CampaignImage[] = [];
    for (const record of records) {
        for (const image of record.images) {
            if (seen.has(image.hash)) continue;
            seen.add(image.hash);
            out.push(image.caption ? image : { ...image, caption: record.name });
        }
    }
    return out;
}

/** Up to four other packages by the same author, most imported first. */
export function moreBy(cards: readonly PackageCard[], handle: string, except: string): PackageCard[] {
    return cards
        .filter((card) => card.authorHandle === handle && card.id !== except && !card.hidden)
        .sort((a, b) => b.installs - a.installs || a.title.localeCompare(b.title))
        .slice(0, 4);
}
