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
    PackageCard,
    PackageCardPage,
    PackagePublicPage,
    PackageSort,
    Placement,
} from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';

export type { InstallPreview, InstallRemoved, InstallResult, InstallRow, PackageCard, PackagePublicPage, PackageSort, Placement };

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

export type CatalogueQuery = { q?: string; kind?: string; tag?: string; sort?: PackageSort; mine?: boolean; hidden?: boolean; cursor?: string };

/** The catalogue address; every field is left out when empty. */
export function cataloguePath(query: CatalogueQuery): string {
    const params = new URLSearchParams();
    if (query.q && query.q.trim()) params.set('q', query.q.trim());
    if (query.kind && query.kind.trim()) params.set('kind', query.kind.trim());
    if (query.tag && query.tag.trim()) params.set('tag', query.tag.trim());
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
        res = await apiFetch(fetchImpl, url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
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