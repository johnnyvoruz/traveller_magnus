/**
 * The marketplace stub, speaking contracts/b_marketplace.md.
 * The server is not built. A screen passes fetch, and tests pass a fake.
 * Nothing here reads another account's packages or installs one.
 */
import { reactive } from 'vue';
import { apiFetch } from '../platform/http.ts';
import type {
    MarketplaceAccount,
    PackageCreate,
    PackageListPage,
    PackageListQuery,
    PackageListing,
    PackagePage,
    PackagePublish,
    PackagePublishAccepted,
    PackageVersion,
    PackageVersionState,
    PublishHandle,
    PublishSource,
} from './types.ts';

type FetchLike = typeof fetch;
type Schedule = (fn: () => void, ms: number) => () => void;

const POLL_MS = 400;
const MAX_POLLS = 10_000;

const READ = 'The server sent a response the store could not read.';
const SIGN_IN = 'Sign in to publish and to see your packages.';
const OWN_UNIVERSE = 'You can publish only from a universe you own.';
const OWN_PACKAGE = 'You can open only a package you published.';
const CHART = 'This universe is not on a published chart.';
const STILL_RUNNING = 'This publish is still running.';

const STATES = new Set<PackageVersionState>(['queued', 'running', 'done', 'failed']);

export class MarketplaceError extends Error {
    readonly details: unknown;
    constructor(message: string, details?: unknown) {
        super(message);
        this.name = 'MarketplaceError';
        this.details = details;
    }
}

export type OpenMarketplaceOptions = {
    fetch: FetchLike;
    schedule?: Schedule;
    /** Read at each call, so a sign-in during the session is visible. */
    account: () => MarketplaceAccount | null;
};

export type Marketplace = {
    tick(): number;
    listings(): PackageListing[];
    page(packageId: string): PackagePage | null;
    nextCursor(): string | null;
    create(body: PackageCreate, source: PublishSource): Promise<PackageListing>;
    publish(
        packageId: string,
        body: PackagePublish,
        source: PublishSource,
        onProgress?: (version: PackageVersion) => void,
    ): PublishHandle;
    /** Poll one version. After a reload, pass the package id and the version number. */
    watch(packageId: string, version: number, onProgress?: (version: PackageVersion) => void): Promise<PackageVersion>;
    list(query?: PackageListQuery): Promise<PackageListPage>;
    read(packageId: string): Promise<PackagePage>;
};

function defaultSchedule(fn: () => void, ms: number): () => void {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function failRead(): never {
    throw new MarketplaceError(READ);
}

function needString(value: unknown): string {
    if (typeof value !== 'string') failRead();
    return value;
}

function needInt(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) failRead();
    return value;
}

function needNullableString(value: unknown): string | null {
    if (value === null) return null;
    return needString(value);
}

function needTags(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) failRead();
    return value.slice();
}

function parseListing(value: unknown): PackageListing {
    if (!isRecord(value)) failRead();
    const id = needString(value.id);
    if (id.length === 0) failRead();
    const truthVersion = value.truthVersion;
    if (truthVersion !== null && typeof truthVersion !== 'string') failRead();
    return {
        id,
        title: needString(value.title),
        authorHandle: needString(value.authorHandle),
        kind: needString(value.kind),
        truthVersion,
        edition: needString(value.edition),
        hexCount: needInt(value.hexCount),
        tags: needTags(value.tags),
        latestVersion: needInt(value.latestVersion),
    };
}

function parseVersion(value: unknown): PackageVersion {
    if (!isRecord(value)) failRead();
    const state = value.state;
    if (typeof state !== 'string' || !STATES.has(state as PackageVersionState)) failRead();
    return {
        version: needInt(value.version),
        state: state as PackageVersionState,
        hexCount: needInt(value.hexCount),
        recordCount: needInt(value.recordCount),
        manifestHash: needNullableString(value.manifestHash),
        error: needNullableString(value.error),
    };
}

function parsePage(value: unknown): PackagePage {
    const listing = parseListing(value);
    if (!isRecord(value)) failRead();
    if (!Array.isArray(value.versions)) failRead();
    return {
        ...listing,
        description: needString(value.description),
        versions: value.versions.map((item) => parseVersion(item)),
    };
}

function parseAccepted(value: unknown): PackagePublishAccepted {
    if (!isRecord(value)) failRead();
    const jobId = needString(value.jobId);
    if (jobId.length === 0) failRead();
    return { jobId, version: needInt(value.version) };
}

function parseList(value: unknown): PackageListPage {
    if (!isRecord(value) || !Array.isArray(value.items)) failRead();
    if (value.nextCursor !== null && typeof value.nextCursor !== 'string') failRead();
    return {
        items: value.items.map((item) => parseListing(item)),
        nextCursor: value.nextCursor,
    };
}

function copyListing(row: PackageListing): PackageListing {
    return {
        id: row.id,
        title: row.title,
        authorHandle: row.authorHandle,
        kind: row.kind,
        truthVersion: row.truthVersion,
        edition: row.edition,
        hexCount: row.hexCount,
        tags: row.tags.slice(),
        latestVersion: row.latestVersion,
    };
}

function copyVersion(row: PackageVersion): PackageVersion {
    return { ...row };
}

function copyPage(row: PackagePage): PackagePage {
    return {
        ...copyListing(row),
        description: row.description,
        versions: row.versions.map((item) => copyVersion(item)),
    };
}

function packagePath(packageId: string): string {
    return `/api/packages/${encodeURIComponent(packageId)}`;
}

function listPath(query?: PackageListQuery): string {
    const params = new URLSearchParams();
    if (query && query.cursor !== undefined) params.set('cursor', query.cursor);
    if (query && query.limit !== undefined) params.set('limit', String(query.limit));
    const text = params.toString();
    return text ? `/api/packages?${text}` : '/api/packages';
}

export function openMarketplace(options: OpenMarketplaceOptions): Marketplace {
    const schedule = options.schedule ?? defaultSchedule;
    const state = reactive({
        tick: 0,
        listings: [] as PackageListing[],
        pages: {} as Record<string, PackagePage>,
        nextCursor: null as string | null,
    });

    function bump(): void {
        state.tick += 1;
    }

    function account(): MarketplaceAccount | null {
        return options.account();
    }

    function assertSignedIn(): MarketplaceAccount {
        const who = account();
        if (!who || who.id.length === 0) throw new MarketplaceError(SIGN_IN);
        return who;
    }

    function assertSource(source: PublishSource): void {
        const who = assertSignedIn();
        if (who.id !== source.ownerId) throw new MarketplaceError(OWN_UNIVERSE);
        if (source.truthVersion == null) throw new MarketplaceError(CHART);
    }

    function knownHandle(packageId: string): string | null {
        const listed = state.listings.find((item) => item.id === packageId);
        if (listed) return listed.authorHandle;
        const page = state.pages[packageId];
        return page ? page.authorHandle : null;
    }

    function assertOwnPackage(packageId: string): void {
        const who = assertSignedIn();
        const handle = knownHandle(packageId);
        if (who.handle != null && handle != null && who.handle !== handle) throw new MarketplaceError(OWN_PACKAGE);
    }

    function wait(ms: number): Promise<void> {
        return new Promise((resolve) => {
            schedule(resolve, ms);
        });
    }

    async function request(method: string, url: string, body?: unknown): Promise<unknown> {
        let res: Response;
        try {
            res = await apiFetch(options.fetch, url, {
                method,
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch (err) {
            throw new MarketplaceError(err instanceof Error ? err.message : READ);
        }
        const payload = await res.json().catch(() => null) as { ok?: unknown; data?: unknown; error?: { message?: unknown; details?: unknown } } | null;
        if (!res.ok) {
            const message = payload && payload.error && typeof payload.error.message === 'string' ? payload.error.message : '';
            if (!message) throw new MarketplaceError(READ);
            throw new MarketplaceError(message, payload && payload.error ? payload.error.details : undefined);
        }
        if (!payload || payload.ok !== true || !('data' in payload)) throw new MarketplaceError(READ);
        return payload.data;
    }

    function rememberListing(row: PackageListing, where: 'front' | 'replace'): void {
        const copy = copyListing(row);
        const index = state.listings.findIndex((item) => item.id === copy.id);
        if (index >= 0) state.listings.splice(index, 1, copy);
        else if (where === 'front') state.listings.unshift(copy);
        else state.listings.push(copy);
    }

    function adopt(packageId: string, row: PackageVersion): void {
        const page = state.pages[packageId];
        const index = state.listings.findIndex((item) => item.id === packageId);
        let latest = index >= 0 ? state.listings[index].latestVersion : page ? page.latestVersion : 0;
        let hexCount = index >= 0 ? state.listings[index].hexCount : page ? page.hexCount : 0;
        if (row.state === 'done' && row.version >= latest) {
            latest = row.version;
            hexCount = row.hexCount;
        }
        if (index >= 0) {
            const current = state.listings[index];
            if (current.latestVersion !== latest || current.hexCount !== hexCount) {
                state.listings.splice(index, 1, { ...current, latestVersion: latest, hexCount });
            }
        }
        if (page) {
            const versions = page.versions.map((item) => copyVersion(item));
            const at = versions.findIndex((item) => item.version === row.version);
            if (at >= 0) versions.splice(at, 1, copyVersion(row));
            else versions.push(copyVersion(row));
            versions.sort((left, right) => right.version - left.version);
            state.pages[packageId] = { ...page, latestVersion: latest, hexCount, versions };
        }
        bump();
    }

    async function watch(packageId: string, version: number, onProgress?: (row: PackageVersion) => void): Promise<PackageVersion> {
        assertOwnPackage(packageId);
        for (let poll = 0; poll < MAX_POLLS; poll += 1) {
            const row = parseVersion(await request('GET', `${packagePath(packageId)}/versions/${version}`));
            onProgress?.(copyVersion(row));
            adopt(packageId, row);
            if (row.state === 'done' || row.state === 'failed') return copyVersion(row);
            await wait(POLL_MS);
        }
        throw new MarketplaceError(STILL_RUNNING);
    }

    function publish(
        packageId: string,
        body: PackagePublish,
        source: PublishSource,
        onProgress?: (row: PackageVersion) => void,
    ): PublishHandle {
        assertSource(source);
        assertOwnPackage(packageId);
        let accept!: (value: PackagePublishAccepted) => void;
        let rejectAccept!: (err: unknown) => void;
        let finish!: (value: PackageVersion) => void;
        let rejectFinish!: (err: unknown) => void;
        const accepted = new Promise<PackagePublishAccepted>((resolve, reject) => {
            accept = resolve;
            rejectAccept = reject;
        });
        const finished = new Promise<PackageVersion>((resolve, reject) => {
            finish = resolve;
            rejectFinish = reject;
        });
        let opened = false;
        function fail(err: unknown): void {
            if (!opened) rejectAccept(err);
            rejectFinish(err);
        }
        void (async () => {
            try {
                const data = parseAccepted(await request('POST', `${packagePath(packageId)}/versions`, {
                    universeId: body.universeId,
                    hexKeys: [...body.hexKeys],
                    recordIds: [...body.recordIds],
                }));
                opened = true;
                accept(data);
                finish(await watch(packageId, data.version, onProgress));
            } catch (err) {
                fail(err);
            }
        })();
        return { accepted, finished };
    }

    return {
        tick: () => state.tick,
        listings(): PackageListing[] {
            return state.listings.map((item) => copyListing(item));
        },
        page(packageId: string): PackagePage | null {
            const row = state.pages[packageId];
            return row ? copyPage(row) : null;
        },
        nextCursor: () => state.nextCursor,
        async create(body: PackageCreate, source: PublishSource): Promise<PackageListing> {
            assertSource(source);
            const listing = parseListing(await request('POST', '/api/packages', {
                title: body.title,
                kind: body.kind,
                description: body.description,
                tags: [...body.tags],
                universeId: body.universeId,
            }));
            rememberListing(listing, 'front');
            bump();
            return copyListing(listing);
        },
        publish,
        watch,
        async list(query?: PackageListQuery): Promise<PackageListPage> {
            assertSignedIn();
            const page = parseList(await request('GET', listPath(query)));
            if (!query || query.cursor === undefined) state.listings = [];
            for (const item of page.items) rememberListing(item, 'replace');
            state.nextCursor = page.nextCursor;
            bump();
            return { items: page.items.map((item) => copyListing(item)), nextCursor: page.nextCursor };
        },
        async read(packageId: string): Promise<PackagePage> {
            assertOwnPackage(packageId);
            const row = parsePage(await request('GET', packagePath(packageId)));
            state.pages[packageId] = copyPage(row);
            rememberListing(row, 'front');
            bump();
            return copyPage(row);
        },
    };
}
