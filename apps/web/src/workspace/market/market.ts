/**
 * The marketplace stub's screens, size b (findings/marketplace_screens_design.md;
 * contracts/b_marketplace.md; findings/marketplace_client_ready.md). A signed-in referee
 * publishes what they have selected in Build, from a universe they own, and sees their own
 * packages. Nobody else browses and nobody installs. The screens call Lane A's
 * `MarketplaceStore` only; it is opened here, or a stand-in is given by `useMarketStore`.
 *
 * The pure parts run under Node.
 */
import { reactive, shallowRef } from 'vue';
import { session } from '../../account/session.ts';
import { campaign } from '../../campaign/store.ts';
import { recordsAtHex } from '../../campaign/index.ts';
import { apiFetch } from '../../platform/http.ts';
import { asMarketplaceStore, openMarketplace, type MarketplaceStore, type PackageListing, type PackageVersion, type PublishSource } from '../../marketplace/index.ts';
import { parseHexKey } from '../places.ts';

/** The contract's limits (contracts/b_marketplace.md, "Limits", approved by Johnny). */
export const MARKET_LIMITS = {
    hexes: 1280,
    records: 500,
    title: 80,
    description: 2000,
    kind: 40,
    tags: 32,
    tag: 40,
} as const;

/** The server's sentences the screens say before asking (contracts/b_marketplace.md). An own map publishes too (F1). */
export const SIGN_IN = 'Sign in to publish and to see your packages.';

// ---- the store ---------------------------------------------------------------------------------------

const current = shallowRef<MarketplaceStore | null>(null);

/** A stand-in store (tests, and the dev-only fake in fake_store.ts); null goes back to the real one. */
export function useMarketStore(store: MarketplaceStore | null): void {
    current.value = store;
}

/** The store, opened the first time a screen asks. */
export function marketStore(): MarketplaceStore {
    if (!current.value) {
        current.value = asMarketplaceStore(openMarketplace({
            fetch: (input, init) => apiFetch(fetch, typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init),
            account: () => (session.user ? { id: session.user.id, handle: session.user.profile && session.user.profile.handle ? session.user.profile.handle : null } : null),
        }));
    }
    return current.value;
}

export function signedIn(): boolean {
    return session.user !== null;
}

// ---- what goes in --------------------------------------------------------------------------------------

/** What a hex is on the map, as Build tells it: only a hex that holds something (or a chart system removed) goes in a package. */
export type HexHolds = 'empty' | 'truth' | 'override' | 'own' | 'removed';

export function publishKeys(keys: readonly string[], state: (hexKey: string) => HexHolds): string[] {
    return keys.filter((key) => state(key) !== 'empty');
}

/** Why an empty hex alone offers no Publish: said in the pane where the command would be. */
export const EMPTY_ALONE = 'An empty hex has nothing to publish.';

/** Publish is offered for one hex that holds a system (or was removed from the map), or for many with at least one. */
export function canPublish(keys: readonly string[], state: (hexKey: string) => HexHolds): boolean {
    return keys.length > 0 && publishKeys(keys, state).length > 0;
}

/**
 * The chart systems removed from the map go in as deleted hexes (Johnny, 2026-10-11): said under
 * the summary, so nobody is surprised. Empty when none of the hexes is removed.
 */
export function removedWords(keys: readonly string[], state: (hexKey: string) => HexHolds): string {
    const removed = keys.filter((key) => state(key) === 'removed').length;
    if (removed === 0) return '';
    if (keys.length === 1) return 'You removed this system from your map. It goes in as a deleted hex.';
    if (removed === 1) return '1 of these hexes is removed from your map. It goes in as a deleted hex.';
    return removed.toLocaleString('en-US') + ' of these hexes are removed from your map. They go in as deleted hexes.';
}

/** "48 hexes in 2 sectors". */
export function hexWords(keys: readonly string[], sectorName: (slug: string) => string = (slug) => slug): string {
    const slugs = new Set<string>();
    for (const key of keys) {
        const place = parseHexKey(key);
        if (place) slugs.add(place.slug);
    }
    const hexes = plural(keys.length, 'hex', 'hexes');
    if (slugs.size === 1) return hexes + ' in ' + sectorName([...slugs][0]).replace(/_/g, ' ');
    return hexes + ' in ' + plural(slugs.size, 'sector', 'sectors');
}

export function plural(count: number, one: string, many: string): string {
    return count.toLocaleString('en-US') + ' ' + (count === 1 ? one : many);
}

export type RecordRow = { id: string; name: string; type: string };

/** The live campaign records on these hexes, each once, by name. */
export function recordsOn(keys: readonly string[], at: (hexKey: string) => readonly string[] = recordsAtHex, read: (id: string) => { name: string; type: string } | undefined = (id) => campaign.records[id]): RecordRow[] {
    const seen = new Set<string>();
    const out: RecordRow[] = [];
    for (const key of keys) {
        for (const id of at(key)) {
            if (seen.has(id)) continue;
            seen.add(id);
            const record = read(id);
            if (record) out.push({ id, name: record.name, type: record.type });
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Tags as typed: separated by commas, trimmed, each once, none empty. */
export function parseTags(text: string): string[] {
    const out: string[] = [];
    for (const part of text.split(',')) {
        const tag = part.trim().replace(/\s+/g, ' ');
        if (tag && !out.includes(tag)) out.push(tag);
    }
    return out;
}

/** The kind a selection suggests: one system, a whole sector, a whole subsector, or hexes. The contract has no list: this is only the box's first value. */
export function kindOfKeys(keys: readonly string[]): string {
    if (keys.length === 1) return 'system';
    const slugs = new Set(keys.map((key) => (parseHexKey(key) ?? { slug: '' }).slug));
    if (slugs.size !== 1) return 'hexes';
    if (keys.length === 1280) return 'sector';
    if (keys.length === 80) {
        const blocks = new Set(keys.map((key) => { const hex = key.slice(-4); return Math.floor((Number(hex.slice(0, 2)) - 1) / 8) + ':' + Math.floor((Number(hex.slice(2)) - 1) / 10); }));
        if (blocks.size === 1) return 'subsector';
    }
    return 'hexes';
}

export type FormProblem = { field: 'hexes' | 'records' | 'title' | 'kind' | 'description' | 'tags'; text: string };

/** What stops Publish, each in words, with what to do. Empty when the form can be sent. */
export function formProblems(input: { isNew: boolean; title: string; kind: string; description: string; tags: readonly string[]; hexes: number; records: number }): FormProblem[] {
    const out: FormProblem[] = [];
    if (input.hexes === 0) out.push({ field: 'hexes', text: 'No selected hex holds a system. To publish, select hexes that hold systems.' });
    if (input.hexes > MARKET_LIMITS.hexes) out.push({ field: 'hexes', text: 'A package holds at most 1,280 hexes. To publish, select ' + plural(input.hexes - MARKET_LIMITS.hexes, 'fewer hex', 'fewer hexes') + '.' });
    if (input.records > MARKET_LIMITS.records) out.push({ field: 'records', text: 'A package holds at most 500 records. To publish, clear ' + plural(input.records - MARKET_LIMITS.records, 'record', 'records') + '.' });
    if (!input.isNew) return out;
    const title = input.title.trim();
    const kind = input.kind.trim();
    if (!title) out.push({ field: 'title', text: 'Enter a title.' });
    else if (title.length > MARKET_LIMITS.title) out.push({ field: 'title', text: 'Shorten the title to 80 characters or fewer.' });
    if (!kind) out.push({ field: 'kind', text: 'Enter a kind, for example system or subsector.' });
    else if (kind.length > MARKET_LIMITS.kind) out.push({ field: 'kind', text: 'Shorten the kind to 40 characters or fewer.' });
    if (input.description.length > MARKET_LIMITS.description) out.push({ field: 'description', text: 'Shorten the description to 2,000 characters or fewer.' });
    if (input.tags.length > MARKET_LIMITS.tags) out.push({ field: 'tags', text: 'Use 32 tags or fewer.' });
    const long = input.tags.find((tag) => tag.length > MARKET_LIMITS.tag);
    if (long) out.push({ field: 'tags', text: 'Shorten the tag "' + long.slice(0, 20) + '…" to 40 characters or fewer.' });
    return out;
}

/** A version's state, as the screens say it. */
export function stateWords(state: PackageVersion['state']): string {
    if (state === 'done') return 'Published';
    if (state === 'failed') return 'Failed';
    if (state === 'running') return 'Publishing';
    return 'Waiting';
}

/** The eight fields of a listing, as one line under its title (decision 1). */
export function listingLine(item: PackageListing): string {
    const parts = ['by @' + item.authorHandle, item.kind, item.truthVersion ? 'chart ' + item.truthVersion : 'own map', item.edition, plural(item.hexCount, 'hex', 'hexes'), item.latestVersion ? 'version ' + item.latestVersion : 'not published yet'];
    return parts.join(' · ');
}

/** The address of a package page; `version` is the one being published, which the page watches. */
export function packagePath(packageId: string, version?: number): string {
    return '/packages/' + encodeURIComponent(packageId) + (version ? '?version=' + version : '');
}

// ---- the form ------------------------------------------------------------------------------------------

/** "new", or the id of one of the caller's packages for a new version. */
export const marketUi = reactive({
    /** The form is open in the Build pane. */
    open: false,
    target: 'new',
    title: '',
    kind: '',
    description: '',
    tags: '',
    /** Records the person cleared: everything on the hexes is in unless it is here. */
    left: [] as string[],
    busy: false,
    error: '',
});

export function openPublish(kind: string): void {
    if (!marketUi.open) {
        marketUi.error = '';
        if (!marketUi.kind) marketUi.kind = kind;
    }
    marketUi.open = true;
    void marketStore().list().catch(() => undefined);
}

export function closePublish(): void {
    marketUi.open = false;
    marketUi.error = '';
}

/** The form is emptied once a version is accepted; a failure leaves it as it was. */
function resetForm(): void {
    marketUi.open = false;
    marketUi.target = 'new';
    marketUi.title = '';
    marketUi.kind = '';
    marketUi.description = '';
    marketUi.tags = '';
    marketUi.left = [];
    marketUi.error = '';
}

/** The universe a publish comes from: its id, its owner, its chart. Null when none is open. */
export type MarketUniverse = { id: string; truthVersion: string | null };

export function sourceOf(universe: MarketUniverse): PublishSource {
    const row = campaign.universes.find((item) => item.id === universe.id);
    return { ownerId: row ? row.ownerId : (session.user ? session.user.id : ''), truthVersion: universe.truthVersion };
}

/**
 * Publish: a new package is created first (title, kind, description, tags), then the version
 * is sent. Resolves with where to go: the package page, which watches that version. A refusal
 * is shown in the server's words and the form stays filled.
 */
export async function publish(universe: MarketUniverse, hexKeys: readonly string[], recordIds: readonly string[]): Promise<string | null> {
    if (marketUi.busy) return null;
    const store = marketStore();
    const source = sourceOf(universe);
    marketUi.busy = true;
    marketUi.error = '';
    try {
        let packageId = marketUi.target;
        if (packageId === 'new') {
            const made = await store.create({
                title: marketUi.title.trim(),
                kind: marketUi.kind.trim(),
                description: marketUi.description,
                tags: parseTags(marketUi.tags),
                universeId: universe.id,
            }, source);
            packageId = made.id;
            // A second try after a failed version adds a version to this package, not another package.
            marketUi.target = packageId;
        }
        const handle = store.publish(packageId, { universeId: universe.id, hexKeys: [...hexKeys], recordIds: [...recordIds] }, source);
        handle.finished.catch(() => undefined);
        const accepted = await handle.accepted;
        resetForm();
        return packagePath(packageId, accepted.version);
    } catch (err) {
        marketUi.error = err instanceof Error && err.message ? err.message : 'The package could not be published. Try again.';
        return null;
    } finally {
        marketUi.busy = false;
    }
}
