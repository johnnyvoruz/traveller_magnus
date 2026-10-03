import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

async function up() {
    try {
        const response = await fetch(`${base}/api/health`);
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

export async function withDevServer(run) {
    mkdirSync(path.join(dir, 'tickets'), { recursive: true });
    const ticket = path.join(dir, 'tickets', `${process.pid}`);
    writeFileSync(ticket, '1');
    let owner = false;
    try {
        const ready = Date.now() + 90000;
        while (!(await up())) {
            if (Date.now() > ready) {
                const log = existsSync(path.join(dir, 'log')) ? readFileSync(path.join(dir, 'log'), 'utf8') : '';
                throw new Error(log || 'wrangler dev did not answer /api/health');
            }
            clearStaleOwner();
            if (!owner && !existsSync(path.join(dir, 'owner'))) {
                try {
                    mkdirSync(path.join(dir, 'owner'));
                    owner = true;
                } catch {
                    owner = false;
                }
            }
            if (owner && !existsSync(path.join(dir, 'pid'))) {
                const child = spawn(process.execPath, [wranglerBin, 'dev', '--port', '8799', '--ip', '127.0.0.1'], {
                    cwd: apiRoot,
                    env: { ...process.env, CI: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                let output = '';
                child.stdout.on('data', (chunk) => { output += chunk; });
                child.stderr.on('data', (chunk) => { output += chunk; });
                writeFileSync(path.join(dir, 'pid'), String(child.pid));
                writeFileSync(path.join(dir, 'log'), '');
                const logTimer = setInterval(() => writeFileSync(path.join(dir, 'log'), output), 500);
                child.on('exit', () => clearInterval(logTimer));
            }
            await sleep(500);
        }
        await run(base);
    } finally {
        rmSync(ticket, { force: true });
        const left = existsSync(path.join(dir, 'tickets')) ? readdirSync(path.join(dir, 'tickets')) : [];
        if (left.length === 0 && existsSync(path.join(dir, 'pid'))) {
            const pid = readFileSync(path.join(dir, 'pid'), 'utf8').trim();
            if (pid) spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
            rmSync(dir, { recursive: true, force: true });
        }
    }
}
