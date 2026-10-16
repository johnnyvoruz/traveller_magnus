// Shared helpers for the example-package tools. Local states only: every wrangler call here passes --local.
// The auth secret below signs sessions in these throwaway local states; it is not a real secret.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const EXAMPLE_HANDLE = process.env.EXAMPLE_HANDLE ?? 'traveller_voyage';
export const EXAMPLE_USER_ID = process.env.EXAMPLE_USER_ID ?? 'e2b2245a-5260-4b91-8f33-1e02997fd9d5';
export const TRUTH_VERSION = 'v10';
export const EDITION = 'MgT2E';
export const PACKS = path.join(HERE, 'packs');
export const OWN_PACKS = path.join(HERE, 'packs_z');
export const CACHE = path.join(ROOT, 'findings/examples/cache');
const SECRET = 'lane-z-examples-local-only-not-a-real-secret';
const WRANGLER = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');

export function arg(name, fallback = null) {
    const at = process.argv.indexOf(name);
    return at > 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
}
export const flag = (name) => process.argv.includes(name);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const q = (s) => (s === null || s === undefined ? 'NULL' : "'" + String(s).replaceAll("'", "''") + "'");

/** A local state: its folder, its own wrangler.toml, and its port. */
export function localState(dir, port) {
    mkdirSync(dir, { recursive: true });
    const config = path.join(dir, 'wrangler.toml');
    const root = ROOT.replaceAll('\\', '/');
    const text = readFileSync(path.join(ROOT, 'apps/api/wrangler.toml'), 'utf8')
        .replace('main = "src/index.ts"', `main = "${root}/apps/api/src/index.ts"`)
        .replace('directory = "../web/dist"', `directory = "${root}/apps/web/dist"`)
        .replace('migrations_dir = "src/db/migrations"', `migrations_dir = "${root}/apps/api/src/db/migrations"`)
        .replace('APP_ENV = "production"', 'APP_ENV = "development"')
        .replace('BETTER_AUTH_URL = "https://traveller.voyage"', `BETTER_AUTH_URL = "http://127.0.0.1:${port}"\nBETTER_AUTH_SECRET = "${SECRET}"`);
    writeFileSync(config, text);
    return { dir, config, persist: path.join(dir, 'state'), port, api: `http://127.0.0.1:${port}` };
}

export function wrangler(st, args, { input } = {}) {
    const r = spawnSync(process.execPath, [WRANGLER, ...args, '--local', '--config', st.config, '--persist-to', st.persist], {
        cwd: ROOT, encoding: input ? undefined : 'utf8', windowsHide: true, maxBuffer: 1 << 28,
        env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(st.dir, 'wrangler.log') },
    });
    if (r.status) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed\n${r.stdout}${r.stderr}`);
    return r.stdout;
}
export function sqlFile(st, sql) {
    const file = path.join(st.dir, 'run.sql');
    writeFileSync(file, sql);
    wrangler(st, ['d1', 'execute', 'voyage', '--file', file]);
}
export function select(st, sql) {
    const out = wrangler(st, ['d1', 'execute', 'voyage', '--json', '--command', sql]);
    return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}
export function r2Put(st, key, body) {
    const file = path.join(st.dir, 'obj.tmp');
    writeFileSync(file, body);
    wrangler(st, ['r2', 'object', 'put', 'voyage-public/' + key, '--file', file]);
}
export function r2Get(st, key) {
    const r = spawnSync(process.execPath, [WRANGLER, 'r2', 'object', 'get', 'voyage-public/' + key, '--pipe', '--local', '--config', st.config, '--persist-to', st.persist], {
        cwd: ROOT, windowsHide: true, maxBuffer: 1 << 28, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    });
    return r.status === 0 && r.stdout.length ? r.stdout : null;
}

/** Fetches a public truth file once (read-only GET) and keeps it under findings/examples/cache. */
export async function cached(url) {
    mkdirSync(CACHE, { recursive: true });
    const file = path.join(CACHE, sha256(url).slice(0, 24));
    if (existsSync(file)) return readFileSync(file);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const body = Buffer.from(await r.arrayBuffer());
    writeFileSync(file, body);
    return body;
}

/** Migrations, the chart version, the house account. `hexKeys` are the charted hexes whose trees get copied in. */
export async function prepare(st, hexKeys) {
    wrangler(st, ['d1', 'migrations', 'apply', 'voyage']);
    const versions = JSON.parse(await cached('https://traveller.voyage/api/truth/versions')).data;
    const v = versions.find((x) => x.version === TRUTH_VERSION);
    if (!v) throw new Error(`The public API has no truth version ${TRUTH_VERSION}.`);
    const now = new Date().toISOString();
    sqlFile(st, `INSERT OR REPLACE INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done, milieu, seed, settings, sectors)
VALUES (${[v.version, v.engineVersion, 'released', v.startedAt, v.releasedAt].map(q).join(',')}, ${v.sectorsTotal}, ${v.sectorsDone}, ${[v.milieu, v.seed, JSON.stringify(v.settings), JSON.stringify(v.sectors)].map(q).join(',')});
INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at, role, banned) VALUES (${q(EXAMPLE_USER_ID)}, ${q(EXAMPLE_HANDLE)}, 'examples@localhost', 1, ${Date.now()}, ${Date.now()}, 'user', 0);
INSERT OR IGNORE INTO profile (user_id, handle, display_name, avatar_url, created_at, last_seen_at) VALUES (${q(EXAMPLE_USER_ID)}, ${q(EXAMPLE_HANDLE)}, ${q(EXAMPLE_HANDLE)}, NULL, ${q(now)}, NULL);
`);
    const cdn = 'https://cdn.traveller.voyage/';
    const manifest = JSON.parse(await cached(`${cdn}truth/${TRUTH_VERSION}/manifest.json`));
    r2Put(st, `truth/${TRUTH_VERSION}/manifest.json`, JSON.stringify(manifest));
    r2Put(st, `truth/${TRUTH_VERSION}/overview.json`, await cached(`${cdn}truth/${TRUTH_VERSION}/overview.json`));
    const sectors = [...new Set(hexKeys.map((k) => k.slice(0, k.lastIndexOf('/'))))];
    for (const sector of sectors) {
        const index = JSON.parse(await cached(`${cdn}truth/${TRUTH_VERSION}/sectors/${sector}/index.json`));
        r2Put(st, `truth/${TRUTH_VERSION}/sectors/${sector}/index.json`, JSON.stringify(index));
        for (const key of hexKeys.filter((k) => k.startsWith(sector + '/'))) {
            const entry = index.hexes[key.slice(sector.length + 1)];
            if (!entry?.tree) throw new Error(`${key} is not a charted system on ${TRUTH_VERSION}.`);
            r2Put(st, `objects/${entry.tree}`, await cached(cdn + 'objects/' + entry.tree));
        }
    }
    return v;
}

/** A local account with a session. Returns its cookie header. */
export function account(st, id, name, role = 'user') {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    sqlFile(st, `INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at, role, banned) VALUES (${q(id)}, ${q(name)}, ${q(name.toLowerCase() + '@localhost')}, 1, ${now}, ${now}, ${q(role)}, 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (${q(id + '-' + randomBytes(6).toString('hex'))}, ${now + 7 * 864e5}, ${q(token)}, ${now}, ${now}, ${q(id)});
`);
    return 'better-auth.session_token=' + encodeURIComponent(token + '.' + createHmac('sha256', SECRET).update(token).digest('base64'));
}

export function startApi(st) {
    const child = spawn(process.execPath, [WRANGLER, 'dev', '--config', st.config, '--port', String(st.port), '--persist-to', st.persist, '--ip', '127.0.0.1', '--inspector-port', String(st.port + 1000)], {
        cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
        env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(st.dir, 'wrangler.log') },
    });
    return child;
}
export function stopApi(child) {
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
}
export async function up(st) {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
        try { if ((await fetch(st.api + '/api/health')).ok) return; } catch { /* starting */ }
        await sleep(500);
    }
    throw new Error('The local API did not answer /api/health.');
}

export function client(st, cookie) {
    return async (method, url, body) => {
        const headers = cookie ? { cookie } : {};
        if (body !== undefined) { headers['content-type'] = 'application/json'; headers.origin = st.api; }
        const r = await fetch(st.api + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const json = await r.json().catch(() => null);
        return { status: r.status, body: json };
    };
}
export function must(r, what) {
    if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body?.data;
}
export async function settle(call, packageId, version) {
    for (let i = 0; i < 180; i++) {
        const r = await call('GET', `/api/packages/${packageId}/versions/${version}`);
        const state = r.body?.data?.state;
        if (state === 'done') return r.body.data;
        if (state === 'failed') throw new Error(`Publishing ${packageId} v${version} failed: ${r.body.data.error}`);
        await sleep(1000);
    }
    throw new Error(`Publishing ${packageId} v${version} did not finish.`);
}

/** Every pack folder, C's and E's first (read only), then Lane Z's. */
export function packFolders() {
    const list = (root) => (existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name)).sort() : []);
    return [...list(PACKS), ...list(OWN_PACKS)];
}

/** Every 64-hex string in a manifest that names an object (tree, records, lists, images). */
export function objectHashes(manifest) {
    const out = new Set();
    const walk = (value, key) => {
        if (typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && key !== 'baseHash') out.add(value);
        else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
    };
    walk(manifest, '');
    return [...out].sort();
}