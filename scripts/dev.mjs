// One local stack: migrate D1, then the Worker and Vite. Ctrl+C stops both.
// Ports stay fixed. Production values in wrangler.toml are not edited.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_PORT = 5173;
export const API_PORT = 8787;
export const INSPECTOR_PORT = 9239;
export const PAGE = `http://localhost:${WEB_PORT}`;
/** Wrangler state for this command only. Tests keep using their own folder. */
export const DEV_PERSIST = '.wrangler/dev';
const TRUTH = 'https://traveller.voyage';

export function localTruth(argv) {
    return argv.includes('--local-truth');
}

export function secretPresent(text) {
    return text.split(/\r?\n/).some((line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('BETTER_AUTH_SECRET=')) return false;
        const value = trimmed.slice('BETTER_AUTH_SECRET='.length).trim();
        return value !== '' && value !== '""' && value !== "''";
    });
}

export function apiArgs() {
    return [
        'dev',
        '--port', String(API_PORT),
        '--ip', '127.0.0.1',
        '--inspector-port', String(INSPECTOR_PORT),
        '--host', `localhost:${WEB_PORT}`,
        '--local-upstream', `localhost:${WEB_PORT}`,
        '--upstream-protocol', 'http',
        '--local-protocol', 'http',
        '--var', `BETTER_AUTH_URL:${PAGE}`,
        '--persist-to', DEV_PERSIST,
    ];
}

/** The production row the chart treats as current: the latest releasedAt. */
export function newestReleasedAt(rows) {
    let best = '';
    for (const row of rows ?? []) {
        if (!row || row.state !== 'released' || typeof row.releasedAt !== 'string') continue;
        if (!/^\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+$/.test(row.releasedAt)) continue;
        if (row.releasedAt > best) best = row.releasedAt;
    }
    return best;
}

/**
 * A local released row dated after production's newest is withdrawn, so it is
 * not the current chart. The row stays. It is not refused with an error.
 */
export function withdrawNewerStatement(newest) {
    if (!/^\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+$/.test(newest)) return null;
    return `UPDATE truth_versions SET state = 'withdrawn' WHERE state = 'released' AND released_at > '${newest}';`;
}

function withSystemCa(base) {
    const flag = '--use-system-ca';
    const current = base.NODE_OPTIONS || '';
    if (current.includes(flag)) return base;
    return { ...base, NODE_OPTIONS: `${current} ${flag}`.trim() };
}

export function pinStatements(rows) {
    const lines = [];
    for (const row of rows) {
        if (!row || row.state !== 'released' || typeof row.version !== 'string') continue;
        if (!/^[A-Za-z0-9._-]+$/.test(row.version)) continue;
        const engine = typeof row.engineVersion === 'string' && /^[0-9.]+$/.test(row.engineVersion) ? row.engineVersion : '1.2.0';
        const at = typeof row.releasedAt === 'string' && /^\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+$/.test(row.releasedAt)
            ? row.releasedAt
            : '';
        if (!at) continue;
        const total = Number.isFinite(row.sectorsTotal) ? row.sectorsTotal : 0;
        const done = Number.isFinite(row.sectorsDone) ? row.sectorsDone : 0;
        lines.push(
            `INSERT OR IGNORE INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done) VALUES ('${row.version}', '${engine}', 'released', '${at}', '${at}', ${total}, ${done});`,
        );
    }
    return lines;
}

export function webEnv(argv, base) {
    const env = {
        ...withSystemCa(base),
        VOYAGE_API: `http://127.0.0.1:${API_PORT}`,
        VOYAGE_KEEP_ORIGIN: '1',
        BROWSER: 'none',
    };
    if (!localTruth(argv)) env.VOYAGE_TRUTH_API = TRUTH;
    else delete env.VOYAGE_TRUTH_API;
    return env;
}

function wranglerBin() {
    return path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
}

function viteBin() {
    const local = path.join(root, 'apps', 'web', 'node_modules', 'vite', 'bin', 'vite.js');
    if (existsSync(local)) return local;
    return path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
}

function portFree(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
            server.close(() => resolve(true));
        });
    });
}

function prefix(child, tag) {
    const carry = { out: '', err: '' };
    const write = (chunk, which) => {
        const text = carry[which] + chunk.toString();
        const lines = text.split(/\r?\n/);
        carry[which] = lines.pop() ?? '';
        for (const line of lines) process.stdout.write(`[${tag}] ${line}\n`);
    };
    child.stdout?.on('data', (chunk) => write(chunk, 'out'));
    child.stderr?.on('data', (chunk) => write(chunk, 'err'));
    child.on('exit', () => {
        if (carry.out) process.stdout.write(`[${tag}] ${carry.out}\n`);
        if (carry.err) process.stdout.write(`[${tag}] ${carry.err}\n`);
    });
}

function killTree(pid) {
    if (!pid) return;
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

const children = new Set();
let stopping = false;

function stopAll() {
    if (stopping) return;
    stopping = true;
    for (const child of children) killTree(child.pid);
}

async function productionVersions() {
    const url = `${TRUTH}/api/truth/versions`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        return await response.json();
    } catch {
        const child = spawnSync(process.execPath, ['-e', `fetch(${JSON.stringify(url)}).then((response) => response.text()).then((text) => process.stdout.write(text)).catch((error) => { console.error(String(error)); process.exit(1); })`], {
            env: withSystemCa(process.env),
            encoding: 'utf8',
        });
        if (child.status !== 0) {
            console.log('[db] The production chart list could not be read. A new campaign cannot pin until it can.');
            return null;
        }
        return JSON.parse(child.stdout);
    }
}

function runD1(command) {
    const applied = spawnSync(process.execPath, [
        wranglerBin(), 'd1', 'execute', 'voyage', '--local', '--persist-to', DEV_PERSIST, '--command', command,
    ], {
        cwd: path.join(root, 'apps', 'api'),
        encoding: 'utf8',
        env: { ...withSystemCa(process.env), CI: '1' },
    });
    const text = `${applied.stdout || ''}${applied.stderr || ''}`;
    for (const line of text.split(/\r?\n/)) {
        if (line) console.log(`[db] ${line}`);
    }
    if (applied.status !== 0) process.exit(applied.status ?? 1);
}

async function pinReleased() {
    const body = await productionVersions();
    const rows = body?.data || [];
    const lines = pinStatements(rows);
    if (lines.length > 0) runD1(lines.join(' '));
    const withdraw = withdrawNewerStatement(newestReleasedAt(rows));
    if (withdraw) runD1(withdraw);
}

async function main() {
    const varsPath = path.join(root, 'apps', 'api', '.dev.vars');
    const varsText = existsSync(varsPath) ? readFileSync(varsPath, 'utf8') : '';
    if (!secretPresent(varsText)) {
        console.log('apps/api/.dev.vars has no BETTER_AUTH_SECRET. Add BETTER_AUTH_SECRET="..." to that file. Do not commit it.');
    }
    if (!(await portFree(API_PORT)) || !(await portFree(WEB_PORT))) {
        console.log(`Port ${API_PORT} or ${WEB_PORT} is already in use. Stop that process, then run npm run dev again.`);
        process.exit(1);
    }
    const migrate = spawnSync(process.execPath, [
        wranglerBin(), 'd1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', DEV_PERSIST,
    ], {
        cwd: path.join(root, 'apps', 'api'),
        encoding: 'utf8',
        env: { ...process.env, CI: '1' },
    });
    const migrated = `${migrate.stdout || ''}${migrate.stderr || ''}`;
    for (const line of migrated.split(/\r?\n/)) {
        if (line) console.log(`[db] ${line}`);
    }
    if (migrate.status !== 0) process.exit(migrate.status ?? 1);
    if (!localTruth(process.argv)) await pinReleased();

    const api = spawn(process.execPath, [wranglerBin(), ...apiArgs()], {
        cwd: path.join(root, 'apps', 'api'),
        env: { ...process.env, CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    const web = spawn(process.execPath, [
        viteBin(), '--host', 'localhost', '--port', String(WEB_PORT), '--strictPort',
    ], {
        cwd: path.join(root, 'apps', 'web'),
        env: webEnv(process.argv, process.env),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    children.add(api);
    children.add(web);
    prefix(api, 'api');
    prefix(web, 'web');
    console.log(PAGE);
    const onStop = () => {
        stopAll();
        process.exit(0);
    };
    process.on('SIGINT', onStop);
    process.on('SIGTERM', onStop);
    process.on('SIGHUP', onStop);
    api.on('exit', (code) => {
        if (stopping) return;
        console.log(`[api] exited ${code ?? 0}`);
        stopAll();
        process.exit(code ?? 1);
    });
    web.on('exit', (code) => {
        if (stopping) return;
        console.log(`[web] exited ${code ?? 0}`);
        stopAll();
        process.exit(code ?? 1);
    });
}

const called = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (called === fileURLToPath(import.meta.url)) main();
