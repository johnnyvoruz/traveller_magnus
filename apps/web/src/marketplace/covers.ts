/**
 * A package's cover as the store shows it (contracts/b_marketplace.md F17; prompts/d_storefront.md):
 * the server's `cover` (an upload or record art) when there is one, else Lane A's default for the
 * package's kind family (`apps/web/public/covers/<family>.webp` and `<family>_640.webp`). The
 * server never names a default. Pure: it runs under Node.
 */
import { PACKAGE_KIND_FAMILIES, type PackageCover, type PackageFamily } from '@voyage/shared';

export type KindFamily = PackageFamily;

/**
 * Kind to family, first match, case-insensitive, by keyword anywhere in the kind
 * (reports/done/a_store_art.md). A kind that matches none is `other`. The table is the server's
 * (`PACKAGE_KIND_FAMILIES`, contract F2), so the store's families and its `family=` query agree.
 */
export const KIND_FAMILIES: readonly { family: Exclude<KindFamily, 'other'>; words: readonly string[] }[] = PACKAGE_KIND_FAMILIES;

/** Every family, in the order the store's chips list them. */
export const FAMILIES: readonly KindFamily[] = [...KIND_FAMILIES.map((row) => row.family), 'other'];

/** The chip's words for a family. */
export const FAMILY_WORDS: Readonly<Record<KindFamily, string>> = {
    map: 'Maps',
    system: 'Systems',
    ship: 'Ships',
    people: 'People',
    patrons: 'Patrons',
    organization: 'Organizations',
    adventure: 'Adventures',
    other: 'Other',
};

export function kindFamily(kind: string): KindFamily {
    const text = kind.toLowerCase();
    for (const row of KIND_FAMILIES) {
        if (row.words.some((word) => text.includes(word))) return row.family;
    }
    return 'other';
}

/** Where a public object is served: `<cdn>/objects/<hash>`. */
export function objectUrl(cdnBase: string, hash: string): string {
    return cdnBase.replace(/\/$/, '') + '/objects/' + encodeURIComponent(hash);
}

/** A default cover's address, from the app's own files. */
export function defaultCoverUrl(family: KindFamily, thumb: boolean): string {
    return '/covers/' + family + (thumb ? '_640' : '') + '.webp';
}

export type CoverSource = 'upload' | 'record' | 'default';

export type ShownCover = {
    /** The 640 px file, for cards. */
    thumb: string;
    /** The full file, for the page. */
    full: string;
    source: CoverSource;
    family: KindFamily;
};

/** The cover to show for a card or a page. */
export function shownCover(item: { kind: string; cover?: PackageCover | null }, cdnBase: string): ShownCover {
    const family = kindFamily(item.kind);
    const cover = item.cover;
    if (cover) return { thumb: objectUrl(cdnBase, cover.thumbHash), full: objectUrl(cdnBase, cover.hash), source: cover.source, family };
    return { thumb: defaultCoverUrl(family, true), full: defaultCoverUrl(family, false), source: 'default', family };
}

/** The cover's source, as its author reads it. */
export function sourceWords(source: CoverSource): string {
    if (source === 'upload') return 'Your upload';
    if (source === 'record') return 'From your records';
    return 'Default for its kind';
}
