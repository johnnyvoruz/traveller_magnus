import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const wranglerBin = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
export const apiRoot = path.join(root, 'apps', 'api');
const port = process.env.VOYAGE_API_PORT || '8799';
const inspectorPort = process.env.VOYAGE_INSPECTOR_PORT || '9229';
export const base = `http://127.0.0.1:${port}`;
const dir = path.join(root, '.tmp', `api-dev-${port}`);

/** Local wrangler state. VOYAGE_PERSIST_TO keeps a run off the shared .wrangler/state directory. */
export function stateRoot() {
    const set = process.env.VOYAGE_PERSIST_TO;
    if (set) return path.resolve(set);
    return path.join(apiRoot, '.wrangler', 'state');
}

const homes = new Map();

/**
 * A wrangler config outside the repo. Wrangler writes `dev-*` and `bundle-*` under the
 * config's project root, and a killed `wrangler dev` does not remove them. Keeping that
 * root in the OS temp folder leaves `apps/api/.wrangler/tmp` untouched.
 */
export function isolatedConfig() {
    const home = mkdtempSync(path.join(tmpdir(), 'voyage-wrangler-'));
    const slash = (value) => value.replace(/\\/g, '/');
    const main = slash(path.join(apiRoot, 'src', 'index.ts'));
    const assets = slash(path.join(root, 'apps', 'web', 'dist'));
    const migrations = slash(path.join(apiRoot, 'src', 'db', 'migrations'));
    const source = readFileSync(path.join(apiRoot, 'wrangler.toml'), 'utf8');
    const rewritten = source
        .replace(/^main = "src\/index\.ts"$/m, `main = "${main}"`)
        .replace(/^directory = "\.\.\/web\/dist"$/m, `directory = "${assets}"`)
        .replace(/^migrations_dir = "src\/db\/migrations"$/m, `migrations_dir = "${migrations}"`);
    if (!rewritten.includes(main) || !rewritten.includes(assets) || !rewritten.includes(migrations)) {
        throw new Error('wrangler.toml relative paths were not rewritten');
    }
    writeFileSync(path.join(home, 'wrangler.toml'), rewritten);
    const vars = path.join(apiRoot, '.dev.vars');
    if (existsSync(vars)) copyFileSync(vars, path.join(home, '.dev.vars'));
    return home;
}

export function dropIsolatedConfig(home) {
    if (!home) return;
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            rmSync(home, { recursive: true, force: true });
            return;
        } catch {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        }
    }
}

export function wranglerLaunch(commandArgs) {
    const home = isolatedConfig();
    return {
        home,
        args: ['--config', path.join(home, 'wrangler.toml'), '--cwd', home, ...commandArgs],
    };
}

function rememberHome(pid, home) {
    if (pid) homes.set(pid, home);
}

export function homeRecord(persistTo) {
    const dir = path.join(tmpdir(), 'voyage-wrangler-runs');
    mkdirSync(dir, { recursive: true });
    const name = path.basename(persistTo).replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(dir, `${name}.txt`);
}

export function noteHome(persistTo, home) {
    appendFileSync(homeRecord(persistTo), `${home}\n`);
}

/** Removes every config directory recorded for this persist folder. A missing directory is fine. */
export function dropRecordedHomes(persistTo) {
    const file = homeRecord(persistTo);
    if (!existsSync(file)) return;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    rmSync(file, { force: true });
    for (const home of lines) dropIsolatedConfig(home);
}

export function tmpBundleNames() {
    const dir = path.join(apiRoot, '.wrangler', 'tmp');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).sort();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function up(url) {
    try {
        const response = await fetch(`${url}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
}

function pidAlive(pid) {
    const n = Number(pid);
    if (!n) return false;
    try {
        process.kill(n, 0);
        return true;
    } catch {
        return false;
    }
}

function clearStaleOwner() {
    const owner = path.join(dir, 'owner');
    if (!existsSync(owner)) return;
    const pidFile = path.join(dir, 'pid');
    const pid = existsSync(pidFile) ? readFileSync(pidFile, 'utf8').trim() : '';
    const age = Date.now() - statSync(owner).mtimeMs;
    if (!pidAlive(pid) && age > 15000) {
        dropRecordedHome(dir);
        rmSync(owner, { recursive: true, force: true });
        rmSync(pidFile, { force: true });
    }
}

let held = false;

function releaseShared() {
    if (!held) return;
    held = false;
    rmSync(path.join(dir, 'tickets', String(process.pid)), { force: true });
    const tickets = path.join(dir, 'tickets');
    const left = existsSync(tickets) ? readdirSync(tickets) : [];
    if (left.length > 0) return;
    const pidFile = path.join(dir, 'pid');
    if (!existsSync(pidFile)) return;
    const pid = readFileSync(pidFile, 'utf8').trim();
    if (pid) spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
    dropRecordedHome(dir);
    rmSync(pidFile, { force: true });
    rmSync(path.join(dir, 'owner'), { recursive: true, force: true });
}

export function dropRecordedHome(folder) {
    const file = path.join(folder, 'home');
    if (!existsSync(file)) return;
    const home = readFileSync(file, 'utf8').trim();
    dropIsolatedConfig(home);
    if (!existsSync(home)) rmSync(file, { force: true });
}

function holdShared() {
    mkdirSync(path.join(dir, 'tickets'), { recursive: true });
    writeFileSync(path.join(dir, 'tickets', String(process.pid)), '1');
    if (held) return;
    held = true;
    process.on('exit', releaseShared);
}

function startShared() {
    const logPath = path.join(dir, 'log');
    writeFileSync(logPath, '');
    const logFd = openSync(logPath, 'a');
    const command = ['dev', '--port', port, '--ip', '127.0.0.1', '--inspector-port', inspectorPort];
    if (process.env.VOYAGE_PERSIST_TO) command.push('--persist-to', process.env.VOYAGE_PERSIST_TO);
    const launch = wranglerLaunch(command);
    writeFileSync(path.join(dir, 'home'), launch.home);
    const child = spawn(process.execPath, [wranglerBin, ...launch.args], {
        cwd: apiRoot,
        env: { ...process.env, CI: '1' },
        detached: true,
        stdio: ['ignore', logFd, logFd],
        windowsHide: true,
    });
    child.unref();
    writeFileSync(path.join(dir, 'pid'), String(child.pid));
}

/** One wrangler dev on port 8799 for every black-box file. The last process stops it. */
export async function withDevServer(run) {
    holdShared();
    const ready = Date.now() + 90000;
    while (!(await up(base))) {
        if (Date.now() > ready) {
            const log = existsSync(path.join(dir, 'log')) ? readFileSync(path.join(dir, 'log'), 'utf8') : '';
            throw new Error(log || 'wrangler dev did not answer /api/health');
        }
        clearStaleOwner();
        let owner = false;
        if (!existsSync(path.join(dir, 'owner'))) {
            try {
                mkdirSync(path.join(dir, 'owner'));
                owner = true;
            } catch {
                owner = false;
            }
        }
        if (owner && !existsSync(path.join(dir, 'pid'))) startShared();
        await sleep(500);
    }
    await run(base);
}

/** A private wrangler dev. The caller stops it. It does not use port 8799. */
export function startDev({ port, persistTo, inspectorPort, args = [] }) {
    const launch = wranglerLaunch([
        'dev',
        '--port', String(port),
        '--ip', '127.0.0.1',
        '--inspector-port', String(inspectorPort),
        '--persist-to', persistTo,
        ...args,
    ]);
    const child = spawn(process.execPath, [wranglerBin, ...launch.args], {
        cwd: apiRoot,
        env: { ...process.env, CI: '1' },
        stdio: 'ignore',
        windowsHide: true,
    });
    rememberHome(child.pid, launch.home);
    noteHome(persistTo, launch.home);
    return child;
}

export function stopDev(pid) {
    if (!pid) return;
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    const home = homes.get(pid);
    homes.delete(pid);
    dropIsolatedConfig(home);
}
