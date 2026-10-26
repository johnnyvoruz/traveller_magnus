import type { SectorIndex, TreeEnvelope, TruthManifest, TruthOverview, TruthPolities } from '@voyage/shared';
import { chartKeepVersion, chartMatch, chartPut } from '../platform/browser.ts';
import { rememberVersion } from './chart_version.ts';

type FetchLike = typeof fetch;

type ReleasedRow = { version?: string; releasedAt?: string | null };

/** Successful CDN responses, one jar per injected fetch, so a new client in this page does not load them again. */
const jars = new WeakMap<FetchLike, Map<string, Promise<unknown>>>();

function jarFor(fetchImpl: FetchLike): Map<string, Promise<unknown>> {
    let jar = jars.get(fetchImpl);
    if (!jar) {
        jar = new Map();
        jars.set(fetchImpl, jar);
    }
    return jar;
}

/**
 * Reads released truth. fetch is injected.
 * Indexes: at most maxIndexes parsed (least recently read dropped), at most maxInFlight fetches.
 * A failed fetch is not cached. The next want() may retry it. This class never retries on its own.
 * want() fetches missing slugs in the order given. The caller passes the most central first.
 * A successful immutable file (anything under cdnBase) is kept for the session and shared by
 * every client constructed with the same fetch. The versions list is not immutable, so it is not kept.
 */
export class TruthClient {
    private readonly fetch: FetchLike;
    private readonly injected: FetchLike;
    private readonly cdnBase: string;
    private readonly apiBase: string;
    private readonly maxIndexes: number;
    private readonly maxInFlight: number;
    private readonly urls = new Map<string, Promise<unknown>>();
    private readonly indexes = new Map<string, SectorIndex>();
    private readonly queue: string[] = [];
    private readonly queued = new Map<string, { version: string; slug: string }>();
    private readonly flying = new Set<string>();
    private readonly listeners = new Set<(slug: string) => void>();
    /** At most 16 parsed trees, least recently read first. A failed fetch is not stored. */
    private readonly trees = new Map<string, TreeEnvelope>();
    private readonly treeFlying = new Map<string, Promise<TreeEnvelope>>();

    constructor(opts: { cdnBase: string; apiBase: string; fetch: FetchLike; maxIndexes?: number; maxInFlight?: number }) {
        // The browser's fetch throws "Illegal invocation" when called as a method of another
        // object, so it is never stored and called as this.fetch(url).
        const injected = opts.fetch;
        this.injected = injected;
        this.fetch = (input, init) => injected(input, init);
        this.cdnBase = opts.cdnBase.replace(/\/+$/, '');
        this.apiBase = opts.apiBase.replace(/\/+$/, '');
        this.maxIndexes = opts.maxIndexes ?? 32;
        this.maxInFlight = opts.maxInFlight ?? 4;
    }

    /**
     * The newest released version. `fresh` asks the Worker past the browser's HTTP cache (the list is
     * sent with a short max-age), for a caller that boots from a remembered version and needs to know
     * whether it is still the current one. The answer is remembered for the next visit.
     */
    async currentVersion(opts: { fresh?: boolean } = {}): Promise<string> {
        const url = this.apiBase + '/api/truth/versions';
        const body = await (opts.fresh ? this.loadFresh(url) : this.load(url)) as { ok?: boolean; data?: ReleasedRow[] };
        if (!body || body.ok !== true || !Array.isArray(body.data)) {
            throw new Error('TruthClient: versions response is not an ok envelope');
        }
        let best: { version: string; releasedAt: string } | null = null;
        for (const row of body.data) {
            if (!row || typeof row.version !== 'string' || row.version.length === 0) continue;
            if (typeof row.releasedAt !== 'string' || row.releasedAt.length === 0) continue;
            if (!best || row.releasedAt > best.releasedAt) best = { version: row.version, releasedAt: row.releasedAt };
        }
        if (!best) throw new Error('TruthClient: no released truth version');
        rememberVersion(best.version);
        await chartKeepVersion(best.version);
        return best.version;
    }

    manifest(version: string): Promise<TruthManifest> {
        return this.load(this.cdnBase + '/truth/' + version + '/manifest.json') as Promise<TruthManifest>;
    }

    overview(version: string): Promise<TruthOverview> {
        return this.load(this.cdnBase + '/truth/' + version + '/overview.json') as Promise<TruthOverview>;
    }

    /**
     * One request per version however many callers ask. A 404 (v2 and v3 have no file)
     * resolves to an empty document and is cached. Any other failure is not cached.
     */
    polities(version: string): Promise<TruthPolities> {
        const url = this.cdnBase + '/truth/' + version + '/polities.json';
        const jar = jarFor(this.injected);
        const existing = jar.get(url);
        if (existing) return existing as Promise<TruthPolities>;
        const tracked = Promise.resolve(this.fetch(url)).then(async (res) => {
            if (res.status === 404) return { truthVersion: version, polities: [] };
            if (!res.ok) throw new Error('TruthClient: ' + res.status + ' ' + url);
            return await res.json() as TruthPolities;
        }).catch((err: unknown) => {
            if (jar.get(url) === tracked) jar.delete(url);
            throw err;
        });
        jar.set(url, tracked);
        return tracked;
    }

    /** The parsed index, or null when it has not arrived. Reading counts as a use. */
    index(version: string, slug: string): SectorIndex | null {
        const key = version + '\0' + slug;
        const found = this.indexes.get(key);
        if (!found) return null;
        this.indexes.delete(key);
        this.indexes.set(key, found);
        return found;
    }

    /**
     * Start fetches for slugs that are missing, in the given order.
     * A sector id that starts with ~ belongs to the referee, or it is an empty slot.
     * The chart has no index for it. The map, the orbit view, the dossier, and search
     * all ask through here, so no request under truth/ is made.
     */
    want(version: string, slugs: string[]): void {
        for (const slug of slugs) {
            if (slug.startsWith('~')) continue;
            const key = version + '\0' + slug;
            if (this.indexes.has(key)) {
                this.index(version, slug);
                continue;
            }
            if (this.queued.has(key) || this.flying.has(key)) continue;
            this.queued.set(key, { version, slug });
            this.queue.push(key);
        }
        this.pump();
    }

    /**
     * One request per hash however many callers ask. The 16 most recently read stay.
     * A failed fetch is not cached.
     */
    tree(hash: string): Promise<TreeEnvelope> {
        const cached = this.treeNow(hash);
        if (cached) return Promise.resolve(cached);
        const flying = this.treeFlying.get(hash);
        if (flying) return flying;
        const url = this.cdnBase + '/objects/' + encodeURIComponent(hash);
        const tracked = this.load(url).then((body) => {
            const doc = body as TreeEnvelope;
            this.rememberTree(hash, doc);
            return doc;
        }).finally(() => {
            if (this.treeFlying.get(hash) === tracked) this.treeFlying.delete(hash);
        });
        this.treeFlying.set(hash, tracked);
        return tracked;
    }

    /** The parsed tree, or null when it has not arrived. Reading counts as a use. */
    treeNow(hash: string): TreeEnvelope | null {
        const found = this.trees.get(hash);
        if (!found) return null;
        this.trees.delete(hash);
        this.trees.set(hash, found);
        return found;
    }

    onArrive(fn: (slug: string) => void): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    private loadFresh(url: string): Promise<unknown> {
        return Promise.resolve(this.fetch(url, { cache: 'no-cache' })).then((res) => {
            if (!res.ok) throw new Error('TruthClient: ' + res.status + ' ' + url);
            return res.json() as Promise<unknown>;
        });
    }

    private load(url: string): Promise<unknown> {
        // Truth files and object bytes are immutable. The versions list is not, and stays on `urls`.
        const keep = url.startsWith(this.cdnBase + '/');
        const bag = keep ? jarFor(this.injected) : this.urls;
        const existing = bag.get(url);
        if (existing) return existing;
        const read = (res: Awaited<ReturnType<FetchLike>>): Promise<unknown> => {
            if (!res.ok) throw new Error('TruthClient: ' + res.status + ' ' + url);
            if (keep && typeof res.clone === 'function') void chartPut(url, res.clone());
            return res.json() as Promise<unknown>;
        };
        // No cache: start the request now, so a burst still overlaps. A cache hit never starts one.
        const fromNetwork = (): Promise<unknown> => Promise.resolve(this.fetch(url)).then(read);
        const tracked = keep && typeof caches !== 'undefined'
            ? chartMatch(url).catch(() => null).then((hit) => {
                if (!hit) return fromNetwork();
                return (hit.json() as Promise<unknown>).catch(() => fromNetwork());
            })
            : fromNetwork();
        bag.set(url, tracked);
        if (keep) {
            tracked.catch(() => {
                if (bag.get(url) === tracked) bag.delete(url);
            });
        } else {
            tracked.finally(() => {
                if (bag.get(url) === tracked) bag.delete(url);
            });
        }
        return tracked;
    }

    private pump(): void {
        while (this.flying.size < this.maxInFlight && this.queue.length > 0) {
            const key = this.queue.shift();
            if (!key) break;
            const job = this.queued.get(key);
            this.queued.delete(key);
            if (!job || this.indexes.has(key) || this.flying.has(key)) continue;
            this.flying.add(key);
            const url = this.cdnBase + '/truth/' + job.version + '/sectors/' + job.slug + '/index.json';
            this.load(url).then((body) => {
                this.remember(key, body as SectorIndex);
                for (const fn of this.listeners) fn(job.slug);
            }).catch(() => {
                // Leave it uncached. The next want() is the retry.
            }).finally(() => {
                this.flying.delete(key);
                this.pump();
            });
        }
    }

    private rememberTree(hash: string, doc: TreeEnvelope): void {
        if (this.trees.has(hash)) this.trees.delete(hash);
        this.trees.set(hash, doc);
        while (this.trees.size > 16) {
            const oldest = this.trees.keys().next().value;
            if (oldest === undefined) break;
            this.trees.delete(oldest);
        }
    }

    private remember(key: string, index: SectorIndex): void {
        if (this.indexes.has(key)) this.indexes.delete(key);
        this.indexes.set(key, index);
        while (this.indexes.size > this.maxIndexes) {
            const oldest = this.indexes.keys().next().value;
            if (oldest === undefined) break;
            this.indexes.delete(oldest);
        }
    }
}
