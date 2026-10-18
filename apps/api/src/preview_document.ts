/**
 * Writes social tags into the HTML the asset server returned (Epic L, L5).
 * A response is left as the asset server sent it when Accept does not prefer HTML, or when it is not HTML.
 */
import { coverOf } from './routes/package_covers';
import type { Env } from './env';
import { applyTags, prefersHtml } from './preview_tags';

const SECTOR = /^\/s\/([A-Za-z0-9_]+)$/;
const HEX = /^\/s\/([A-Za-z0-9_]+)\/([0-9]{4})$/;
const PACKAGE = /^\/packages\/([A-Za-z0-9_-]+)$/;

type ChartIndex = {
    name: string;
    hexes: Record<string, { name: string; uwp: string }>;
};

const chartCache = new Map<string, ChartIndex | null>();

async function releasedVersion(env: Env): Promise<string | null> {
    const row = await env.DB.prepare(
        `SELECT version FROM truth_versions WHERE state = 'released' ORDER BY released_at DESC LIMIT 1`,
    ).first<{ version: string }>();
    return row?.version ?? null;
}

async function chartIndex(env: Env, version: string, sector: string): Promise<ChartIndex | null> {
    const key = `${version}/${sector}`;
    const cached = chartCache.get(key);
    if (cached !== undefined) return cached;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${sector}/index.json`);
    if (!object) {
        chartCache.set(key, null);
        return null;
    }
    let parsed: { name?: unknown; hexes?: Record<string, { name?: unknown; uwp?: unknown }> };
    try {
        parsed = JSON.parse(await object.text()) as typeof parsed;
    } catch {
        chartCache.set(key, null);
        return null;
    }
    const hexes: ChartIndex['hexes'] = {};
    for (const [hex, row] of Object.entries(parsed.hexes ?? {})) {
        if (row && typeof row.name === 'string') {
            hexes[hex] = { name: row.name, uwp: typeof row.uwp === 'string' ? row.uwp : '' };
        }
    }
    const index: ChartIndex = { name: typeof parsed.name === 'string' ? parsed.name : sector, hexes };
    chartCache.set(key, index);
    return index;
}

async function tagsFor(env: Env, pathname: string): Promise<{ title: string; description: string; image?: string } | null> {
    const hex = HEX.exec(pathname);
    const sector = hex ? null : SECTOR.exec(pathname);
    if (hex || sector) {
        const version = await releasedVersion(env);
        if (!version) return null;
        const slug = (hex ?? sector)![1]!;
        const index = await chartIndex(env, version, slug);
        if (!index) return null;
        if (sector) return { title: index.name, description: index.name };
        const row = index.hexes[hex![2]!];
        if (!row) return null;
        const description = row.uwp ? `${row.name} (${row.uwp}), ${index.name}` : `${row.name}, ${index.name}`;
        return { title: row.name, description };
    }
    const pack = PACKAGE.exec(pathname);
    if (!pack) return null;
    const row = await env.DB.prepare(
        `SELECT title, hidden, latest_version AS latestVersion, cover_hash AS coverHash, author_id AS authorId
         FROM packages WHERE id = ?`,
    ).bind(pack[1]).first<{ title: string; hidden: number; latestVersion: number; coverHash: string | null; authorId: string }>();
    if (!row || Number(row.hidden) === 1) return null;
    const profile = await env.DB.prepare(`SELECT handle FROM profile WHERE user_id = ?`).bind(row.authorId).first<{ handle: string }>();
    const handle = profile?.handle?.trim() ?? '';
    const cover = row.coverHash
        ? { hash: row.coverHash }
        : await coverOf(env, pack[1]!, Number(row.latestVersion) || 0, false, false);
    const image = cover?.hash && env.PUBLIC_CDN_BASE
        ? `${env.PUBLIC_CDN_BASE.replace(/\/$/, '')}/objects/${encodeURIComponent(cover.hash)}`
        : undefined;
    return {
        title: row.title,
        description: handle ? `${row.title} by ${handle}` : row.title,
        image,
    };
}

function documentResponse(asset: Response, html: string): Response {
    const headers = new Headers(asset.headers);
    headers.delete('content-length');
    return new Response(html, { status: asset.status, headers });
}

/** The asset response, with social tags written when this request wants HTML. */
export async function previewDocument(env: Env, request: Request, asset: Response): Promise<Response> {
    if (!prefersHtml(request.headers.get('accept'))) return asset;
    const type = asset.headers.get('content-type') ?? '';
    if (!type.toLowerCase().includes('text/html')) return asset;
    const html = await asset.text();
    const tags = await tagsFor(env, new URL(request.url).pathname);
    return documentResponse(asset, tags ? applyTags(html, tags) : html);
}
