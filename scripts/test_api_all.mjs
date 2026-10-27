// Every tests/api suite that boots wrangler, three at a time.
// Three is enough to share the machine: each one is a Worker, a local D1, and a Durable Object.
// Each suite gets its own port, inspector port, and state folder. Hardcoded ports in a file
// stay as they are, and two files that name the same port wait for each other.
import { spawn, spawnSync } from 'node:child_process';
import { dropIsolatedConfig, dropRecordedHome, dropRecordedHomes, tmpBundleNames, wranglerLaunch } from '../tests/api/server.js';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'tests', 'api');
const apiRoot = path.join(root, 'apps', 'api');
const wranglerBin = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const AT_A_TIME = 3;
const SUITE_MS = 8 * 60 * 1000;
// Nothing is parked. truth_build.test.js runs with the rest (BQ1). Its own port keeps it off a neighbour.
const PARKED = new Map();
const children = new Set();

function killPid(pid) {
    if (!pid) return;
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

function shutdown() {
    for (const pid of children) killPid(pid);
}

process.on('SIGINT', () => {
    shutdown();
    process.exit(1);
});
process.on('exit', shutdown);

function freePort(blocked) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const found = server.address().port;
            server.close(() => {
                if (blocked.has(found)) freePort(blocked).then(resolve, reject);
                else {
                    blocked.add(found);
                    resolve(found);
                }
            });
        });
    });
}

function hardPorts(text) {
    const ports = new Set();
    for (const match of text.matchAll(/\b(?:port|inspectorPort)\s*[:=]\s*(\d{4,5})/g)) {
        ports.add(Number(match[1]));
    }
    return ports;
}

function suites() {
    return readdirSync(apiDir)
        .filter((name) => name.endsWith('.test.js'))
        .filter((name) => !PARKED.has(name))
        .filter((name) => readFileSync(path.join(apiDir, name), 'utf8').includes('RUN_API_TESTS'))
        .sort()
        .map((name) => {
            const text = readFileSync(path.join(apiDir, name), 'utf8');
            return { name, hardPorts: hardPorts(text), shared: text.includes('withDevServer') };
        });
}

function firstAssertion(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const infra = lines.find((line) => /SQLITE_IOERR|SQLITE_BUSY|EPERM|ECONNREFUSED|disk I\/O error|Workers runtime failed to start|Network connection lost/.test(line));
    if (infra) return infra.replace(/\s+/g, ' ').slice(0, 200);
    const index = lines.findIndex((line) => line.includes('AssertionError'));
    if (index !== -1) {
        const message = lines[index].replace(/^.*AssertionError(?:\s*\[[^\]]+\])?:\s*/, '');
        const compared = lines.slice(index, index + 12).find((line) => line.includes('!==') || line.includes('deep-equal'));
        const next = lines[index + 1];
        const extra = compared && compared !== lines[index]
            ? ` ${compared}`
            : next && !next.startsWith('at ') && !next.startsWith('+') && !next.startsWith('-') && next !== '^' ? ` ${next}` : '';
        const head = message.length > 120 ? `${message.slice(0, 80)} …` : message;
        return `${head}${extra}`.replace(/\s+/g, ' ').slice(0, 200);
    }
    const failed = lines.find((line) => line.includes('✖'));
    return failed ? failed.slice(0, 200) : 'failed';
}

function dropState(dir) {
    dropRecordedHomes(dir);
    removeTree(dir);
}

function removeTree(dir) {
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            rmSync(dir, { recursive: true, force: true });
            return;
        } catch {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
        }
    }
}

function stopShared(port) {
    const dir = path.join(root, '.tmp', `api-dev-${port}`);
    const pidFile = path.join(dir, 'pid');
    if (existsSync(pidFile)) killPid(readFileSync(pidFile, 'utf8').trim());
    dropRecordedHome(dir);
    removeTree(dir);
}

function applyMigrations(state) {
    const launch = wranglerLaunch(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', state]);
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [wranglerBin, ...launch.args], {
            cwd: apiRoot,
            env: { ...process.env, CI: '1' },
            windowsHide: true,
        });
        children.add(child.pid);
        let output = '';
        const keep = (chunk) => { output += chunk.toString(); };
        child.stdout.on('data', keep);
        child.stderr.on('data', keep);
        child.on('close', (code) => {
            children.delete(child.pid);
            dropIsolatedConfig(launch.home);
            resolve(code === 0 ? '' : output.slice(-2000));
        });
    });
}

function runOne(suite, envPorts) {
    const once = () => {
    const state = mkdtempSync(path.join(tmpdir(), 'voyage-api-all-'));
    const started = Date.now();
    const env = {
        ...process.env,
        RUN_API_TESTS: '1',
        VOYAGE_API_PORT: String(envPorts.api),
        VOYAGE_INSPECTOR_PORT: String(envPorts.inspector),
        VOYAGE_PERSIST_TO: state,
    };
    delete env.NODE_TEST_CONTEXT;
    return new Promise((resolve) => {
        const begin = () => {
            const child = spawn(process.execPath, ['--test', path.join('tests', 'api', suite.name)], {
                cwd: root,
                env,
                windowsHide: true,
            });
            children.add(child.pid);
            let output = '';
            const keep = (chunk) => {
                output += chunk.toString();
                if (output.length > 200000) output = output.slice(-150000);
            };
            child.stdout.on('data', keep);
            child.stderr.on('data', keep);
            const timer = setTimeout(() => {
                killPid(child.pid);
            }, SUITE_MS);
            child.on('close', (code) => {
                clearTimeout(timer);
                children.delete(child.pid);
                killPid(child.pid);
                stopShared(envPorts.api);
                dropState(state);
                const seconds = (Date.now() - started) / 1000;
                const timedOut = seconds >= SUITE_MS / 1000 - 1 && code !== 0;
                resolve({
                    name: suite.name,
                    result: code === 0 ? 'pass' : timedOut ? 'timeout' : 'fail',
                    seconds,
                    assertion: code === 0 ? '' : timedOut ? 'timed out' : firstAssertion(output),
                });
            });
        };
        if (!suite.shared) {
            begin();
            return;
        }
        applyMigrations(state).then((error) => {
            if (!error) {
                begin();
                return;
            }
            dropState(state);
            resolve({
                name: suite.name,
                result: 'fail',
                seconds: (Date.now() - started) / 1000,
                assertion: error.trim().slice(0, 200),
            });
        });
    });
    };
    // One more try when the failure is Windows still holding the local D1 file. An assertion is left as it is.
    return once().then((result) => {
        const flake = result.result !== 'pass' && /SQLITE_IOERR|SQLITE_BUSY|EPERM|ECONNREFUSED|disk I\/O error|Workers runtime failed to start|Network connection lost/.test(result.assertion);
        if (!flake) return result;
        return once().then((again) => ({ ...again, seconds: result.seconds + again.seconds }));
    });
}

function sharesPort(suite, active) {
    for (const other of active.values()) {
        for (const port of suite.hardPorts) {
            if (other.hardPorts.has(port)) return true;
        }
    }
    return false;
}

function printTable(rows) {
    const body = rows.map((row) => [
        row.name,
        row.result,
        row.seconds.toFixed(1),
        row.assertion,
    ]);
    const head = ['suite', 'result', 'seconds', 'assertion'];
    const widths = head.map((cell, index) => Math.max(cell.length, ...body.map((row) => row[index].length)));
    const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
    console.log(line(head));
    for (const row of body) console.log(line(row));
}

for (const [name, note] of PARKED) console.log(`${name}  ${note}`);

const tmpBefore = tmpBundleNames();

const pending = suites();
const blocked = new Set();
for (const suite of pending) for (const port of suite.hardPorts) blocked.add(port);
const active = new Map();
const results = [];

while (pending.length > 0 || active.size > 0) {
    while (active.size < AT_A_TIME) {
        const index = pending.findIndex((suite) => !sharesPort(suite, active));
        if (index === -1) break;
        const suite = pending.splice(index, 1)[0];
        const api = await freePort(blocked);
        const inspector = await freePort(blocked);
        process.stderr.write(`start ${suite.name}\n`);
        const job = runOne(suite, { api, inspector });
        active.set(suite.name, { hardPorts: suite.hardPorts, job });
        job.then((result) => {
            active.delete(suite.name);
            blocked.delete(api);
            blocked.delete(inspector);
            results.push(result);
            process.stderr.write(`done ${suite.name} ${result.result} ${result.seconds.toFixed(1)}s\n`);
        });
    }
    if (active.size === 0) break;
    await Promise.race([...active.values()].map((item) => item.job));
}

results.sort((a, b) => a.name.localeCompare(b.name));
printTable(results);
const failed = results.filter((row) => row.result !== 'pass');
console.log(`${results.length - failed.length} pass, ${failed.length} fail, ${results.length} suites`);
const tmpAfter = tmpBundleNames();
const tmpSame = tmpBefore.length === tmpAfter.length && tmpBefore.every((name, index) => name === tmpAfter[index]);
if (!tmpSame) {
    console.log('apps/api/.wrangler/tmp changed during this run');
    process.exit(1);
}
process.exit(failed.length === 0 ? 0 : 1);
