/**
 * A stand-in `MarketplaceStore` that keeps everything in memory and answers as the contract
 * says (contracts/b_marketplace.md), for the tests and for a browser pass before the server
 * exists. Nothing in the app imports this file: a test, or the dev server's console, hands it
 * to `useMarketStore`. It does not ship.
 */
import { reactive } from 'vue';
import type { MarketplaceStore, PackageCreate, PackageListing, PackagePage, PackagePublish, PackageVersion, PublishSource } from '../../marketplace/index.ts';

export type FakeOptions = {
    handle?: string;
    edition?: string;
    /** How long each state lasts, in milliseconds. */
    stepMs?: number;
    /** The next version fails with this server message (at running), once. */
    failNext?: string | null;
    /** The next create or publish request is refused with this server message, once. */
    refuseNext?: string | null;
    /** The first list answer waits this long, to show loading. */
    listDelayMs?: number;
    schedule?: (fn: () => void, ms: number) => void;
    /** Keeps the packages across a reload (the dev console passes the page's storage). A version still moving goes on moving. */
    storage?: { get(key: string): string | null; set(key: string, value: string): void };
};

const SAVED = 'voyage.dev.fakeMarket';

export type FakeStore = MarketplaceStore & { options: FakeOptions; seed(count: number, source?: PublishSource): void; sent: { create: PackageCreate[]; publish: { packageId: string; body: PackagePublish }[] } };

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function fakeMarketStore(options: FakeOptions = {}): FakeStore {
    const state = reactive({ tick: 0 });
    const pages = new Map<string, PackagePage>();
    let order: string[] = [];
    let serial = 0;
    const schedule = options.schedule ?? ((fn: () => void, ms: number) => { setTimeout(fn, ms); });
    const sent = { create: [] as PackageCreate[], publish: [] as { packageId: string; body: PackagePublish }[] };
    const bump = (): void => {
        state.tick += 1;
        if (options.storage) options.storage.set(SAVED, JSON.stringify({ serial, order, pages: [...pages.values()] }));
    };
    const id = (): string => { serial += 1; let out = 'pk_'; for (let i = 0; i < 26; i += 1) out += ALPHABET[(serial * 7 + i * 13) % 32]; return out; };
    const listing = (page: PackagePage): PackageListing => ({ id: page.id, title: page.title, authorHandle: page.authorHandle, kind: page.kind, truthVersion: page.truthVersion, edition: page.edition, hexCount: page.hexCount, tags: [...page.tags], latestVersion: page.latestVersion });
    const refuse = (): void => {
        const message = store.options.refuseNext;
        if (message) {
            store.options.refuseNext = null;
            throw new Error(message);
        }
    };
    const check = (source: PublishSource): void => {
        if (source.truthVersion === null) throw new Error('This universe is not on a published chart.');
    };
    const versionOf = (packageId: string, version: number): PackageVersion | null => {
        const page = pages.get(packageId);
        return page ? page.versions.find((item) => item.version === version) ?? null : null;
    };
    const watchers = new Map<string, ((version: PackageVersion) => void)[]>();
    const tell = (packageId: string, version: PackageVersion): void => {
        for (const fn of watchers.get(packageId + ':' + version.version) ?? []) fn({ ...version });
    };

    const store: FakeStore = {
        options,
        sent,
        tick: () => state.tick,
        listings: () => order.map((key) => pages.get(key)).filter((page): page is PackagePage => !!page).map(listing),
        page: (packageId) => { const page = pages.get(packageId); return page ? { ...page, versions: page.versions.map((item) => ({ ...item })) } : null; },
        nextCursor: () => null,
        async create(body, source) {
            if (!body.title.trim()) throw new Error('Invalid request.');
            refuse();
            check(source);
            sent.create.push(body);
            const page: PackagePage = {
                id: id(), title: body.title, authorHandle: options.handle ?? 'varn', kind: body.kind, truthVersion: source.truthVersion,
                edition: options.edition ?? 'MgT2E', hexCount: 0, tags: [...body.tags], latestVersion: 0, description: body.description, versions: [],
            };
            pages.set(page.id, page);
            order = [page.id, ...order];
            bump();
            return listing(page);
        },
        publish(packageId, body, source, onProgress) {
            const accepted = (async () => {
                const page = pages.get(packageId);
                if (!page) throw new Error('No such package.');
                refuse();
                check(source);
                if (body.hexKeys.length > 1280) throw new Error('A package holds at most 1280 hexes.');
                sent.publish.push({ packageId, body });
                const number = (page.versions[0] ? page.versions[0].version : 0) + 1;
                const version: PackageVersion = { version: number, state: 'queued', hexCount: body.hexKeys.length, recordCount: body.recordIds.length, manifestHash: null, error: null };
                page.versions = [version, ...page.versions];
                order = [packageId, ...order.filter((item) => item !== packageId)];
                bump();
                const fail = store.options.failNext ?? null;
                store.options.failNext = null;
                const step = options.stepMs ?? 600;
                schedule(() => { version.state = 'running'; bump(); tell(packageId, version); }, step);
                schedule(() => {
                    if (fail) { version.state = 'failed'; version.error = fail; }
                    else { version.state = 'done'; version.manifestHash = 'sha256-' + packageId.slice(3, 11) + number; page.latestVersion = number; page.hexCount = version.hexCount; }
                    bump();
                    tell(packageId, version);
                }, step * 2);
                return { jobId: packageId + ':' + number, version: number };
            })();
            const finished = accepted.then(({ version }) => store.watch(packageId, version, onProgress));
            finished.catch(() => undefined);
            return { accepted, finished };
        },
        watch(packageId, version, onProgress) {
            return new Promise((resolve, reject) => {
                const now = versionOf(packageId, version);
                if (!now) { reject(new Error('No such version.')); return; }
                onProgress?.({ ...now });
                if (now.state === 'done' || now.state === 'failed') { resolve({ ...now }); return; }
                const key = packageId + ':' + version;
                const list = watchers.get(key) ?? [];
                list.push((next) => {
                    onProgress?.(next);
                    if (next.state === 'done' || next.state === 'failed') resolve(next);
                });
                watchers.set(key, list);
            });
        },
        async list() {
            if (options.listDelayMs) {
                const wait = options.listDelayMs;
                options.listDelayMs = 0;
                await new Promise<void>((resolve) => { schedule(resolve, wait); });
            }
            return { items: store.listings(), nextCursor: null };
        },
        async read(packageId) {
            const page = store.page(packageId);
            if (!page) throw new Error('No such package.');
            return page;
        },
        seed(count, source = { ownerId: 'me', truthVersion: 'v5' }) {
            const kinds = ['subsector', 'sector', 'hexes'];
            for (let i = 0; i < count; i += 1) {
                const page: PackagePage = {
                    id: id(), title: ['Spinward Fringe survey', 'Hollow Reach starter', 'The Varn worlds', 'Regina run', 'Five Sisters', 'Trojan Reach notes', 'Deneb lanes'][i % 7],
                    authorHandle: options.handle ?? 'varn', kind: kinds[i % 3], truthVersion: source.truthVersion, edition: options.edition ?? 'MgT2E',
                    hexCount: 40 + i * 9, tags: i % 2 ? ['survey'] : ['frontier', 'starter'], latestVersion: 1 + (i % 3), description: 'Filler description ' + (i + 1) + '.',
                    versions: [],
                };
                for (let v = page.latestVersion; v >= 1; v -= 1) page.versions.push({ version: v, state: 'done', hexCount: page.hexCount, recordCount: v, manifestHash: 'sha256-' + v, error: null });
                pages.set(page.id, page);
                order.push(page.id);
            }
            bump();
        },
    };
    const saved = options.storage ? options.storage.get(SAVED) : null;
    if (saved) {
        const data = JSON.parse(saved) as { serial: number; order: string[]; pages: PackagePage[] };
        serial = data.serial;
        order = data.order;
        for (const page of data.pages) pages.set(page.id, page);
        // A version that was moving when the page went away finishes now, as the server's job would.
        for (const page of data.pages) {
            for (const version of page.versions) {
                if (version.state !== 'queued' && version.state !== 'running') continue;
                const step = options.stepMs ?? 600;
                schedule(() => { version.state = 'running'; bump(); tell(page.id, version); }, step);
                schedule(() => { version.state = 'done'; version.manifestHash = 'sha256-' + page.id.slice(3, 11) + version.version; page.latestVersion = version.version; page.hexCount = version.hexCount; bump(); tell(page.id, version); }, step * 2);
            }
        }
    }
    return store;
}
