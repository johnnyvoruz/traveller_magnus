/**
 * Z6. The store's filter column counted over the whole catalogue for a query, with the browser's rules
 * (apps/web/src/workspace/market/filters.ts): within a section the choices are OR, across sections AND,
 * and a section's counts are taken over the packages every other section lets through. Pure apart from
 * `facetRows`, which reads the light columns once. Imports only `@voyage/shared`, so it runs under Node.
 */
import {
    PACKAGE_KIND_FAMILIES,
    type PackageContents,
    type PackageFacet,
    type PackageFacets,
    type PackageFacetsQuery,
    type PackageFamily,
} from '@voyage/shared';

/** The most packages one facets request counts; past it the answer says `capped`. */
export const FACET_SCAN = 5000;
const DAY = 86_400_000;
const FAMILIES: readonly PackageFamily[] = [...PACKAGE_KIND_FAMILIES.map((row) => row.family), 'other'];

export type FacetRow = {
    kind: string;
    edition: string;
    tags: readonly string[];
    updatedAt: string;
    hexCount: number;
    handle: string;
};

type Section = 'kinds' | 'contents' | 'editions' | 'tags' | 'updated' | 'by';

/** The store's first-match rule: the first family with a word anywhere in the kind; none is `other`. */
export function familyOfKind(kind: string): PackageFamily {
    const text = kind.toLowerCase();
    for (const row of PACKAGE_KIND_FAMILIES) if (row.words.some((word) => text.includes(word))) return row.family;
    return 'other';
}

const contentsOf = (row: FacetRow): PackageContents => (row.hexCount > 0 ? 'hexes' : 'records');

function within(row: FacetRow, days: '' | '7' | '30', now: number): boolean {
    if (!days) return true;
    const at = Date.parse(row.updatedAt);
    return Number.isFinite(at) && now - at <= Number(days) * DAY;
}

/** Whether a row passes every section but `skip`. */
function passes(row: FacetRow, f: PackageFacetsQuery, now: number, skip: Section | null): boolean {
    if (skip !== 'kinds' && f.family?.length && !f.family.includes(familyOfKind(row.kind))) return false;
    if (skip !== 'contents' && f.contents?.length && !f.contents.includes(contentsOf(row))) return false;
    if (skip !== 'editions' && f.edition?.length && !f.edition.includes(row.edition)) return false;
    if (skip !== 'tags' && f.tag?.length && !row.tags.some((tag) => f.tag!.includes(tag))) return false;
    if (skip !== 'updated' && !within(row, f.updated ?? '', now)) return false;
    if (skip !== 'by' && f.author?.length && !f.author.includes(row.handle)) return false;
    return true;
}

/** Values by how often they occur, then by name; blanks dropped. */
function ranked(values: readonly string[]): string[] {
    const seen = new Map<string, number>();
    for (const value of values) if (value !== '') seen.set(value, (seen.get(value) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
}

/** Every section's choices with counts, over `rows` (the packages that match `q`). */
export function facetCounts(rows: readonly FacetRow[], f: PackageFacetsQuery, now: number): Omit<PackageFacets, 'scanned' | 'capped'> {
    const pool = (skip: Section) => rows.filter((row) => passes(row, f, now, skip));
    const count = (skip: Section, values: readonly string[], valueOf: (row: FacetRow) => readonly string[]): PackageFacet[] => {
        const others = pool(skip);
        return values.map((value) => ({ value, count: others.filter((row) => valueOf(row).includes(value)).length }));
    };
    const kinds = FAMILIES.filter((family) => f.family?.includes(family) || rows.some((row) => familyOfKind(row.kind) === family));
    const contents = (['hexes', 'records'] as const).filter((item) => f.contents?.includes(item) || rows.some((row) => contentsOf(row) === item));
    const updatedPool = pool('updated');
    return {
        total: rows.filter((row) => passes(row, f, now, null)).length,
        kinds: count('kinds', kinds, (row) => [familyOfKind(row.kind)]) as PackageFacets['kinds'],
        contents: count('contents', contents, (row) => [contentsOf(row)]) as PackageFacets['contents'],
        editions: count('editions', ranked([...rows.map((row) => row.edition), ...(f.edition ?? [])]), (row) => [row.edition]),
        tags: count('tags', ranked([...rows.flatMap((row) => row.tags), ...(f.tag ?? [])]), (row) => row.tags),
        updated: (['7', '30', ''] as const).map((value) => ({ value, count: updatedPool.filter((row) => within(row, value, now)).length })),
        by: count('by', ranked([...rows.map((row) => row.handle), ...(f.author ?? [])]), (row) => [row.handle]),
    };
}

type Db = { prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results?: T[] }> } } };

type RawRow = { kind: string; edition: string | null; tags: string | null; updatedAt: string; hexCount: number | null; handle: string | null };

/**
 * The catalogue's light columns for a query: public packages only (not hidden, a published version),
 * `q` as the catalogue matches it, the latest version's hex count, the publisher's current handle.
 * Reads at most `limit + 1` rows so the caller can tell it was capped.
 */
export async function facetRows(db: Db, q: string | undefined, like: (text: string) => string, limit = FACET_SCAN): Promise<{ rows: FacetRow[]; capped: boolean }> {
    const where = ['p.hidden = 0', 'p.latest_version > 0'];
    const binds: unknown[] = [];
    if (q) {
        where.push(`(lower(p.title) LIKE ? ESCAPE '\\' OR lower(p.description) LIKE ? ESCAPE '\\' OR lower(p.tags) LIKE ? ESCAPE '\\')`);
        const pattern = like(q);
        binds.push(pattern, pattern, pattern);
    }
    const listed = await db.prepare(
        `SELECT p.kind AS kind, p.edition AS edition, p.tags AS tags, p.updated_at AS updatedAt,
                v.hex_count AS hexCount, pr.handle AS handle
           FROM packages p
           LEFT JOIN package_versions v ON v.package_id = p.id AND v.version = p.latest_version
           LEFT JOIN profile pr ON pr.user_id = p.author_id
          WHERE ${where.join(' AND ')}
          ORDER BY p.updated_at DESC, p.id DESC
          LIMIT ?`,
    ).bind(...binds, limit + 1).all<RawRow>();
    const raw = listed.results ?? [];
    const rows = raw.slice(0, limit).map((row) => {
        let tags: string[] = [];
        try {
            const parsed: unknown = JSON.parse(row.tags ?? '[]');
            if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string');
        } catch {
            tags = [];
        }
        return { kind: row.kind ?? '', edition: row.edition ?? '', tags, updatedAt: row.updatedAt, hexCount: Number(row.hexCount) || 0, handle: row.handle ?? '' };
    });
    return { rows, capped: raw.length > limit };
}