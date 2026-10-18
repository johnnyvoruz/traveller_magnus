/**
 * The full marketplace on the wire (contracts/b_marketplace.md F2, F3, F4, F12, F14): the
 * public catalogue and package page, report and takedown, and a campaign's imports
 * (preview, install, update, remove). Plain calls; the screens hold the state. Every
 * refusal reaches the caller as the server's sentence.
 */
import type {
    InstallList,
    InstallPreview,
    InstallRemoved,
    InstallResult,
    InstallRow,
    CampaignImage,
    PackageCard,
    PackageCover,
    PackageCardPage,
    PackagePublicPage,
    PackageSort,
    Placement,
} from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';

export type { InstallPreview, InstallRemoved, InstallResult, InstallRow, PackageCard, PackageCover, PackagePublicPage, PackageSort, Placement };

export type FetchLike = typeof fetch;

export const READ_FAILED = 'The server sent a response the page could not read.';

export class MarketError extends Error {
    readonly status: number;
    readonly details: unknown;
    constructor(message: string, status = 0, details?: unknown) {
        super(message);
        this.name = 'MarketError';
        this.status = status;
        this.details = details;
    }
}

/** `family` (repeatable, OR) and `author` (one handle) are contract F2's server filters. */
export type CatalogueQuery = { q?: string; kind?: string; tag?: string; family?: readonly string[]; author?: string; sort?: PackageSort; mine?: boolean; hidden?: boolean; cursor?: string };

/** The catalogue address; every field is left out when empty. */
export function cataloguePath(query: CatalogueQuery): string {
    const params = new URLSearchParams();
    if (query.q && query.q.trim()) params.set('q', query.q.trim());
    if (query.kind && query.kind.trim()) params.set('kind', query.kind.trim());
    if (query.tag && query.tag.trim()) params.set('tag', query.tag.trim());
    for (const family of query.family ?? []) params.append('family', family);
    if (query.author && query.author.trim()) params.set('author', query.author.trim());
    params.set('sort', query.sort ?? 'updated');
    if (query.mine) params.set('mine', '1');
    if (query.hidden) params.set('hidden', '1');
    if (query.cursor) params.set('cursor', query.cursor);
    return '/api/packages?' + params.toString();
}

const pk = (packageId: string) => '/api/packages/' + encodeURIComponent(packageId);
const uni = (universeId: string) => '/api/universes/' + encodeURIComponent(universeId);

async function call<T>(fetchImpl: FetchLike, method: string, url: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
        res = body instanceof FormData
            // A form carries its own content type and boundary; apiFetch would name JSON.
            ? await fetchImpl(url, { method, body, credentials: 'same-origin' })
            : await apiFetch(fetchImpl, url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
        throw new MarketError(err instanceof Error && err.message ? err.message : READ_FAILED);
    }
    const payload = await res.json().catch(() => null) as { ok?: unknown; data?: unknown; error?: { message?: unknown; details?: unknown } } | null;
    if (!res.ok) {
        const message = payload && payload.error && typeof payload.error.message === 'string' ? payload.error.message : READ_FAILED;
        throw new MarketError(message, res.status, payload && payload.error ? payload.error.details : undefined);
    }
    if (!payload || payload.ok !== true || !('data' in payload)) throw new MarketError(READ_FAILED, res.status);
    return payload.data as T;
}

export type PreviewAsk = { packageId: string; version: number; placement?: Placement | null; installId?: string | null };

function previewPath(universeId: string, ask: PreviewAsk): string {
    const params = new URLSearchParams({ packageId: ask.packageId, version: String(ask.version) });
    if (ask.installId) params.set('installId', ask.installId);
    else if (ask.placement) {
        params.set('anchor', ask.placement.anchor);
        params.set('to', ask.placement.to);
    }
    return uni(universeId) + '/install/preview?' + params.toString();
}

export type InstallAsk = PreviewAsk & {
    resolutions: Record<string, 'theirs' | 'mine'>;
    recordResolutions: Record<string, 'theirs' | 'mine'>;
    conflicts: number;
};

export function installBody(ask: InstallAsk): Record<string, unknown> {
    const body: Record<string, unknown> = {
        packageId: ask.packageId,
        version: ask.version,
        resolutions: ask.resolutions,
        recordResolutions: ask.recordResolutions,
        expect: { conflicts: ask.conflicts },
    };
    if (ask.installId) body.installId = ask.installId;
    else if (ask.placement) body.placement = ask.placement;
    return body;
}

/** A cover ready to send (F17): the full WebP and its thumbnail, each named by its SHA-256. */
export type CoverUpload = { image: Uint8Array; thumb: Uint8Array; hash: string; thumbHash: string };

/** F17: one multipart form with `image`, `thumb`, `hash` and `thumbHash`. */
export function coverForm(upload: CoverUpload): FormData {
    const form = new FormData();
    form.set('image', new Blob([upload.image as BlobPart], { type: 'image/webp' }), 'cover.webp');
    form.set('thumb', new Blob([upload.thumb as BlobPart], { type: 'image/webp' }), 'cover_640.webp');
    form.set('hash', upload.hash);
    form.set('thumbHash', upload.thumbHash);
    return form;
}

export function marketWire(fetchImpl: FetchLike = fetch) {
    return {
        catalogue: (query: CatalogueQuery) => call<PackageCardPage>(fetchImpl, 'GET', cataloguePath(query)),
        page: (packageId: string) => call<PackagePublicPage>(fetchImpl, 'GET', pk(packageId)),
        report: (packageId: string, reason: string) => call<unknown>(fetchImpl, 'POST', pk(packageId) + '/report', { reason }),
        takedown: (packageId: string, reason: string) => call<unknown>(fetchImpl, 'POST', '/api/admin/packages/' + encodeURIComponent(packageId) + '/takedown', { reason }),
        restore: (packageId: string) => call<unknown>(fetchImpl, 'POST', '/api/admin/packages/' + encodeURIComponent(packageId) + '/restore', {}),
        installs: async (universeId: string) => (await call<InstallList>(fetchImpl, 'GET', uni(universeId) + '/installs')).items,
        preview: (universeId: string, ask: PreviewAsk) => call<InstallPreview>(fetchImpl, 'GET', previewPath(universeId, ask)),
        install: (universeId: string, ask: InstallAsk) => call<InstallResult>(fetchImpl, 'POST', uni(universeId) + '/install', installBody(ask)),
        remove: (universeId: string, installId: string) => call<InstallRemoved>(fetchImpl, 'DELETE', uni(universeId) + '/installs/' + encodeURIComponent(installId)),
        /** F17. The author's own cover; answers what now shows. */
        putCover: async (packageId: string, upload: CoverUpload) => (await call<{ cover: PackageCover | null }>(fetchImpl, 'PUT', pk(packageId) + '/cover', coverForm(upload))).cover,
        /** F17. A plain delete; answers what now shows (record art, or null for the default). */
        dropCover: async (packageId: string) => (await call<{ cover: PackageCover | null }>(fetchImpl, 'DELETE', pk(packageId) + '/cover')).cover,
    };
}

export type MarketWire = ReturnType<typeof marketWire>;

/**
 * The hex keys of a published version, read from its public manifest on the CDN
 * (`packages/<id>/<version>/manifest.json`). Null when it cannot be read.
 */
export async function versionKeys(fetchImpl: FetchLike, cdnBase: string, packageId: string, version: number): Promise<string[] | null> {
    try {
        const res = await fetchImpl(cdnBase.replace(/\/$/, '') + '/packages/' + encodeURIComponent(packageId) + '/' + version + '/manifest.json');
        if (!res.ok) return null;
        const body = await res.json() as { hexes?: unknown };
        return body && body.hexes && typeof body.hexes === 'object' ? Object.keys(body.hexes as object).sort() : null;
    } catch {
        return null;
    }
}

/** A published record as the package page reads it from the CDN. */
export type PublicRecord = { id: string; name: string; type: string; images: CampaignImage[] };

/** What a published version holds, read from its manifest and records list on the CDN. */
export type VersionContents = {
    keys: string[];
    /** The sector ids that are own sectors of the piece (F15). */
    ownSectors: string[];
    /** Null when the records list could not be read. */
    records: PublicRecord[] | null;
};

function imagesOf(value: unknown): CampaignImage[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CampaignImage => !!item && typeof item === 'object'
        && typeof (item as CampaignImage).hash === 'string' && typeof (item as CampaignImage).thumbHash === 'string');
}

/** The records list's rows, kept loosely: a row with no id or name is left out. */
export function publicRecords(value: unknown): PublicRecord[] {
    if (!Array.isArray(value)) return [];
    const out: PublicRecord[] = [];
    for (const row of value) {
        if (!row || typeof row !== 'object') continue;
        const item = row as { id?: unknown; name?: unknown; type?: unknown; images?: unknown; deleted?: unknown };
        if (typeof item.id !== 'string' || typeof item.name !== 'string' || item.deleted === true) continue;
        out.push({ id: item.id, name: item.name, type: typeof item.type === 'string' ? item.type : 'note', images: imagesOf(item.images) });
    }
    return out;
}

/**
 * A published version's hexes and records (`packages/<id>/<version>/manifest.json`, then
 * `objects/<records.contentHash>`). Null when the manifest cannot be read.
 */
export async function versionContents(fetchImpl: FetchLike, cdnBase: string, packageId: string, version: number): Promise<VersionContents | null> {
    const base = cdnBase.replace(/\/$/, '');
    let manifest: { hexes?: unknown; ownSectors?: unknown; records?: { contentHash?: unknown } };
    try {
        const res = await fetchImpl(base + '/packages/' + encodeURIComponent(packageId) + '/' + version + '/manifest.json');
        if (!res.ok) return null;
        manifest = await res.json() as typeof manifest;
    } catch {
        return null;
    }
    if (!manifest || !manifest.hexes || typeof manifest.hexes !== 'object') return null;
    const keys = Object.keys(manifest.hexes as object).sort();
    const ownSectors = manifest.ownSectors && typeof manifest.ownSectors === 'object' ? Object.keys(manifest.ownSectors as object) : [];
    const hash = manifest.records && typeof manifest.records.contentHash === 'string' ? manifest.records.contentHash : '';
    let records: PublicRecord[] | null = null;
    if (hash) {
        try {
            const res = await fetchImpl(base + '/objects/' + encodeURIComponent(hash));
            if (res.ok) records = publicRecords(await res.json());
        } catch {
            records = null;
        }
    } else {
        records = [];
    }
    return { keys, ownSectors, records };
}
