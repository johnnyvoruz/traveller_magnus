import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const wranglerBin = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
export const apiRoot = path.join(root, 'apps', 'api');
export const base = 'http://127.0.0.1:8799';
const dir = path.join(root, '.tmp', 'api-dev-8799');

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
    rmSync(pidFile, { force: true });
    rmSync(path.join(dir, 'owner'), { recursive: true, force: true });
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
    const child = spawn(process.execPath, [
        wranglerBin, 'dev', '--port', '8799', '--ip', '127.0.0.1', '--inspector-port', '9229',
    ], {
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
export function startDev({ port, persistTo, inspectorPort }) {
    return spawn(process.execPath, [
        wranglerBin, 'dev',
        '--port', String(port),
        '--ip', '127.0.0.1',
        '--inspector-port', String(inspectorPort),
        '--persist-to', persistTo,
    ], {
        cwd: apiRoot,
        env: { ...process.env, CI: '1' },
        stdio: 'ignore',
        windowsHide: true,
    });
}

export function stopDev(pid) {
    if (!pid) return;
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
}
