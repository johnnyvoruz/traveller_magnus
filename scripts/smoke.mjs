/**
 * Read-only smoke check of a deployed Traveller.voyage origin.
 * One line per check. Exit 1 when any line is a miss. Nothing is created.
 *
 *   node scripts/smoke.mjs [origin]
 *   npm run smoke [-- origin]
 *
 * origin defaults to https://traveller.voyage.
 * Truth files are read from SMOKE_CDN, or https://cdn.traveller.voyage, on the
 * paths truth_client.ts uses (/truth/<version>/overview.json and
 * /truth/<version>/sectors/Spinward_Marches/index.json).
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORIGIN = 'https://traveller.voyage';
const DEFAULT_CDN = 'https://cdn.traveller.voyage';
const ASSET_CACHE = 'public, max-age=31536000, immutable';
const CHANGELOG_MARK = 'Players can join your campaign with an invite link';

function appVersion() {
    const text = readFileSync(new URL('../apps/web/src/version.ts', import.meta.url), 'utf8');
    const match = text.match(/export const APP_VERSION = '([^']+)'/);
    if (!match) throw new Error('APP_VERSION is not in apps/web/src/version.ts');
    return match[1];
}

function rootOf(origin) {
    return origin.replace(/\/+$/, '');
}

export function indexHashes(html) {
    const found = new Set();
    for (const match of String(html).matchAll(/\/assets\/index-([A-Za-z0-9_-]+)\.js/g)) found.add(match[1]);
    return [...found];
}

export function carriesAssetCache(header) {
    const parts = String(header ?? '').split(',').map((part) => part.trim().toLowerCase());
    return parts.includes('public') && parts.includes('immutable') && parts.includes('max-age=31536000');
}

function localImports(text) {
    const specs = [];
    for (const match of String(text).matchAll(/["'](\.\/[^"']+\.js)["']/g)) specs.push(match[1]);
    for (const match of String(text).matchAll(/["']((?:\/)?assets\/[^"']+\.js)["']/g)) {
        specs.push(match[1].startsWith('/') ? match[1] : '/' + match[1]);
    }
    return specs;
}

function changelogVersion(text) {
    if (!String(text).includes(CHANGELOG_MARK)) return null;
    const match = String(text).match(/version:[`"'](\d+\.\d+\.\d+)[`"']/);
    return match ? match[1] : null;
}

async function get(url) {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text };
}

/**
 * @param {string} origin
 * @param {{ cdn?: string, fetchImpl?: typeof fetch, version?: string, log?: (line: string) => void }} [opts]
 * @returns {Promise<{ ok: boolean, lines: string[] }>}
 */
export async function smoke(origin, opts = {}) {
    const site = rootOf(origin || DEFAULT_ORIGIN);
    const cdn = rootOf(opts.cdn || process.env.SMOKE_CDN || DEFAULT_CDN);
    const version = opts.version || appVersion();
    const lines = [];
    let ok = true;
    const say = (pass, name, detail = '') => {
        const line = (pass ? 'ok' : 'miss') + ' ' + name + (detail ? ' ' + detail : '');
        lines.push(line);
        if (!pass) ok = false;
        (opts.log || console.log)(line);
    };
    const hit = async (url) => {
        try {
            return await get(url);
        } catch (error) {
            return { status: 0, headers: new Headers(), text: '', error };
        }
    };

    const home = await hit(site + '/');
    const hashes = home.status === 200 ? indexHashes(home.text) : [];
    say(home.status === 200 && hashes.length === 1, 'home', home.status === 200
        ? (hashes.length === 1 ? '200 index-' + hashes[0] + '.js' : '200 ' + hashes.length + ' index scripts')
        : String(home.status));
    const indexPath = hashes.length === 1 ? '/assets/index-' + hashes[0] + '.js' : '';

    const versions = await hit(site + '/api/truth/versions');
    let released = '';
    let versionsDetail = String(versions.status);
    if (versions.status === 200) {
        try {
            const body = JSON.parse(versions.text);
            const rows = body && body.ok === true && Array.isArray(body.data) ? body.data : null;
            const releasedRows = rows
                ? rows.filter((item) => item && item.state === 'released' && typeof item.version === 'string' && item.version)
                : [];
            releasedRows.sort((a, b) => String(a.releasedAt ?? '').localeCompare(String(b.releasedAt ?? '')));
            const row = releasedRows[releasedRows.length - 1];
            if (row) {
                released = row.version;
                versionsDetail = '200 released ' + released;
            } else versionsDetail = '200 no released version';
        } catch {
            versionsDetail = '200 not json';
        }
    }
    say(Boolean(released), 'versions', versionsDetail);

    const overview = released ? await hit(cdn + '/truth/' + encodeURIComponent(released) + '/overview.json') : null;
    let overviewOk = false;
    let overviewDetail = released ? '' : 'no released version';
    if (overview) {
        overviewDetail = String(overview.status);
        if (overview.status === 200) {
            try {
                const parsed = JSON.parse(overview.text);
                overviewOk = parsed !== null && typeof parsed === 'object';
                if (!overviewOk) overviewDetail = '200 not an object';
            } catch {
                overviewDetail = '200 not json';
            }
        }
    }
    say(overviewOk, 'overview', overviewDetail);

    const sector = released
        ? await hit(cdn + '/truth/' + encodeURIComponent(released) + '/sectors/Spinward_Marches/index.json')
        : null;
    let sectorOk = false;
    let sectorDetail = released ? '' : 'no released version';
    if (sector) {
        sectorDetail = String(sector.status);
        if (sector.status === 200) {
            try {
                const parsed = JSON.parse(sector.text);
                sectorOk = parsed !== null && typeof parsed === 'object';
                if (!sectorOk) sectorDetail = '200 not an object';
            } catch {
                sectorDetail = '200 not json';
            }
        }
    }
    say(sectorOk, 'sector-index', sectorDetail);

    for (const path of ['/s/Spinward_Marches/1910', '/packages', '/join/nosuchtoken']) {
        const page = await hit(site + path);
        const name = path === '/s/Spinward_Marches/1910' ? 'system-page' : path === '/packages' ? 'packages' : 'join';
        say(page.status === 200, name, String(page.status));
    }

    const campaign = await hit(site + '/api/universes/nosuch/campaign');
    let campaignOk = false;
    let campaignDetail = String(campaign.status);
    if (campaign.status === 401) {
        try {
            const body = JSON.parse(campaign.text);
            campaignOk = body && body.ok === false && body.error && body.error.code === 'unauthenticated';
            campaignDetail = campaignOk ? '401 unauthenticated' : '401 ' + (body && body.error ? body.error.code : 'not the contract');
        } catch {
            campaignDetail = '401 not json';
        }
    }
    say(campaignOk, 'campaign', campaignDetail);

    const entry = indexPath ? await hit(site + indexPath) : null;
    const changesUrl = entry && entry.status === 200
        ? (entry.text.match(/\/?assets\/ChangesView-[A-Za-z0-9_-]+\.js/) || [])[0]
        : '';
    const assets = [];
    if (indexPath) assets.push(site + indexPath);
    if (changesUrl) assets.push(new URL(changesUrl.startsWith('/') ? changesUrl : '/' + changesUrl, site + '/').href);
    const seen = new Set(assets);
    let changes = null;
    for (let i = 0; i < assets.length && i < 12; i++) {
        const url = assets[i];
        const file = i === 0 && entry ? entry : await hit(url);
        const cached = file.status === 200 && carriesAssetCache(file.headers.get('cache-control'));
        if (!cached) say(false, 'asset-cache', (file.headers.get('cache-control') || String(file.status)) + ' ' + url.slice(site.length));
        if (file.status === 200 && url !== site + indexPath) {
            if (!changes) changes = changelogVersion(file.text);
            for (const spec of localImports(file.text)) {
                if (!/Change/i.test(spec)) continue;
                const next = new URL(spec, url).href;
                if (!seen.has(next) && next.startsWith(site + '/assets/')) {
                    seen.add(next);
                    assets.push(next);
                }
            }
        }
    }
    if (assets.length > 0 && !lines.some((line) => line.startsWith('miss asset-cache'))) {
        say(true, 'asset-cache', ASSET_CACHE);
    } else if (assets.length === 0) say(false, 'asset-cache', 'no asset');

    say(changes === version, 'changes-version', changes ? changes + ' expected ' + version : 'chunk missing, expected ' + version);
    return { ok, lines };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invoked) {
    const origin = process.argv[2] || DEFAULT_ORIGIN;
    const result = await smoke(origin);
    process.exit(result.ok ? 0 : 1);
}
