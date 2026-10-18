/**
 * The store's catalogue, seen once (streams/D.md D2; manifesto, Graceful: "nothing seen before on this
 * device shows a loading state again"), and a package's page (D9). The last answer for each query and
 * each page is kept in memory for the session. A return shows it at once and asks the server behind
 * it; the fresh answer replaces it in place (PackagesView.vue, ProductPage.vue). Only the catalogue's
 * first page is kept: Show more asks again. Pure apart from the module's memory, so it runs under Node.
 */
import type { PackageCard, PackagePublicPage, VersionContents } from '../../marketplace/catalogue.ts';

/** What one catalogue answer was for. `user` is the signed-in account's id, or ''. */
export type CatalogueQuery = { q: string; sort: string; mine: boolean; hidden: boolean; user: string };
export type Remembered = { items: PackageCard[]; nextCursor: string | null };

/** Answers kept at most: a session's searches, not every one ever typed. */
export const KEPT = 24;

const answers = new Map<string, Remembered>();

/** The store has read the session once this visit: a return paints at once, without a placeholder. */
export const storeSeen = { session: false };

export function memoryKey(query: CatalogueQuery): string {
    return JSON.stringify([query.q.trim(), query.sort, query.mine, query.hidden, query.user]);
}

/** The answer kept for this query, or null. */
export function recall(query: CatalogueQuery): Remembered | null {
    return answers.get(memoryKey(query)) ?? null;
}

/** Keeps a first page; the oldest answer goes once there are more than KEPT. */
export function keep(query: CatalogueQuery, answer: Remembered): void {
    const key = memoryKey(query);
    answers.delete(key);
    answers.set(key, { items: [...answer.items], nextCursor: answer.nextCursor });
    while (answers.size > KEPT) {
        const oldest = answers.keys().next().value;
        if (oldest === undefined) break;
        answers.delete(oldest);
    }
}

/** Whether a fresh answer shows anything the kept one does not: then it replaces it. */
export function differs(kept: Remembered, fresh: Remembered): boolean {
    if (kept.nextCursor !== fresh.nextCursor || kept.items.length !== fresh.items.length) return true;
    return kept.items.some((card, i) => JSON.stringify(card) !== JSON.stringify(fresh.items[i]));
}

// ---- a package's page, seen once (streams/D.md D9) ---------------------------------------------------------

const pages = new Map<string, PackagePublicPage>();
const contentsKept = new Map<string, VersionContents>();

/** A package's page as last read this session, or null. */
export function recallPage(packageId: string): PackagePublicPage | null {
    return pages.get(packageId) ?? null;
}

export function keepPage(page: PackagePublicPage): void {
    pages.delete(page.id);
    pages.set(page.id, page);
    while (pages.size > KEPT) {
        const oldest = pages.keys().next().value;
        if (oldest === undefined) break;
        pages.delete(oldest);
    }
}

/** A version's hexes and records, as last read: immutable once published, so kept as they are. */
export function recallContents(packageId: string, version: number): VersionContents | null {
    return contentsKept.get(packageId + ':' + version) ?? null;
}

export function keepContents(packageId: string, version: number, contents: VersionContents): void {
    contentsKept.set(packageId + ':' + version, contents);
    while (contentsKept.size > KEPT) {
        const oldest = contentsKept.keys().next().value;
        if (oldest === undefined) break;
        contentsKept.delete(oldest);
    }
}

export type KeptPackage = { id: string; title: string };

/** Catalogue cards and package pages already read this session. An opened page wins on the same id. */
export function keptPackages(): KeptPackage[] {
    const byId = new Map<string, KeptPackage>();
    for (const answer of answers.values()) {
        for (const card of answer.items) byId.set(card.id, { id: card.id, title: card.title });
    }
    for (const page of pages.values()) byId.set(page.id, { id: page.id, title: page.title });
    return [...byId.values()];
}

/** Signing out, or a test: nothing kept. */
export function forgetCatalogue(): void {
    answers.clear();
    pages.clear();
    contentsKept.clear();
    storeSeen.session = false;
}
