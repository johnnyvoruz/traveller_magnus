/**
 * Fresh-context GL parity repeats. Edge, GPU on. Writes a JSON summary.
 * Usage: node scripts/surface_gl_char.js [repeat] [port|legacy|both]
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const viteBin = [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(web, 'node_modules', 'vite', 'bin', 'vite.js'),
].find((file) => existsSync(file)) ?? '';
const probe = process.argv[2] === 'probe';
const cold = process.argv[2] === 'cold';
const parity = process.argv[2] === 'parity';
const stall = process.argv[2] === 'stall';
const repeat = String(Math.max(1, Math.min(30, Number(process.argv[2] || 30))));
const pair = process.argv[3] === 'port' || process.argv[3] === 'legacy' ? process.argv[3] : 'both';
const pagePort = 5223;
const debugPort = 9341;
const pageUrl = probe
    ? `http://127.0.0.1:${pagePort}/dev/surface-parity/gl?probe=1`
    : cold
        ? `http://127.0.0.1:${pagePort}/dev/surface-parity/gl?cold=1`
        : stall
            ? `http://127.0.0.1:${pagePort}/dev/surface-parity/gl?stall=${process.argv[3] === 'warm' || process.argv[3] === 'skip' ? process.argv[3] : 'both'}`
        : parity
            ? `http://127.0.0.1:${pagePort}/dev/surface-parity/gl`
            : `http://127.0.0.1:${pagePort}/dev/surface-parity/gl?repeat=${repeat}&pair=${pair}`;
const outFile = path.join(root, '.tmp', 'surface-gl-char.json');

const browsers = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function browserPath() {
    for (const file of browsers) if (existsSync(file)) return file;
    return '';
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, ms) {
    const deadline = Date.now() + ms;
    let last = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
            last = String(response.status);
        } catch (err) {
            last = err instanceof Error ? err.message : String(err);
        }
        await sleep(250);
    }
    throw new Error('Timed out waiting for ' + url + ' (' + last + ')');
}

function killPid(pid) {
    if (!pid) return;
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

function killBrowsersUsing(dir) {
    const safe = dir.replace(/'/g, "''");
    const command = [
        `$dir = '${safe}'`,
        'Get-CimInstance Win32_Process | Where-Object {',
        "  $_.Name -eq 'msedge.exe' -and $_.CommandLine -and $_.CommandLine.Contains($dir)",
        '} | ForEach-Object { & taskkill /pid $_.ProcessId /T /F | Out-Null }',
    ].join('\n');
    spawnSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'ignore' });
}

async function readChar(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', () => reject(new Error('DevTools socket failed.')));
    });
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', (event) => {
        const data = JSON.parse(String(event.data));
        const wait = pending.get(data.id);
        if (!wait) return;
        pending.delete(data.id);
        if (data.error) wait.reject(new Error(JSON.stringify(data.error)));
        else wait.resolve(data.result);
    });
    function send(method, params) {
        const id = ++nextId;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }
    const resultKey = probe ? '__surfaceGlProbe' : cold ? '__surfaceGlCold' : stall ? '__surfaceGlStall' : parity ? '__surfaceGlParity' : '__surfaceGlChar';
    const expression = `window.${resultKey} ? JSON.stringify(window.${resultKey}) : ""`;
    const deadline = Date.now() + 45 * 60 * 1000;
    let last = '';
    let result = null;
    while (Date.now() < deadline) {
        const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true });
        const text = evaluated?.result?.value;
        if (text && text !== last) {
            last = text;
            const parsed = JSON.parse(text);
            const line = parsed.status + ' ' + (parsed.pair || '') + ' ' + (parsed.run || '') + '/' + (parsed.runs || '');
            console.log(line);
            if (parsed.status === 'done' || parsed.status === 'error') {
                result = parsed;
                break;
            }
        }
        await sleep(2000);
    }
    ws.close();
    if (!result) throw new Error('__surfaceGlChar did not finish.');
    return result;
}

const executable = browserPath();
if (!executable) throw new Error('Edge is not installed.');
if (!viteBin) throw new Error('Vite was not found.');

const vite = spawn(process.execPath, [viteBin, '--port', String(pagePort), '--strictPort', '--host', '127.0.0.1'], {
    cwd: web,
    stdio: 'ignore',
});
const profileDir = mkdtempSync(path.join(tmpdir(), 'voyage-surface-gl-char-'));
let edge = null;
try {
    await waitFor(`http://127.0.0.1:${pagePort}/dev/surface-parity/gl`, 30000);
    edge = spawn(executable, [
        '--headless=new',
        '--use-angle=d3d11',
        '--use-gl=angle',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
        '--enable-gpu',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--disable-extensions',
        '--remote-allow-origins=*',
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-port=${debugPort}`,
        'about:blank',
    ], { stdio: 'ignore' });
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`, 30000);
    const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    const opened = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
    if (!opened.ok) throw new Error('DevTools did not open the page (' + opened.status + ').');
    const target = await opened.json();
    const result = await readChar(target.webSocketDebuggerUrl);
    result.browser = version.Browser || '';
    result.launch = pageUrl;
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(result));
    console.log('CHAR_FILE ' + outFile);
    console.log('CHAR_STATUS ' + result.status + ' browser ' + result.browser);
    if (result.status === 'error') {
        console.log('CHAR_ERROR ' + result.message);
        process.exitCode = 1;
    }
} finally {
    if (edge) killPid(edge.pid);
    killBrowsersUsing(profileDir);
    killPid(vite.pid);
}
console.log('CHAR_DONE');
