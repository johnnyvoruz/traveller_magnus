/**
 * Headless cold paint of the Regina vanilla sheet.
 * Prefers Edge, then Chrome. Prints worker start, sheet time, longest task, overlay time.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const viteBin = [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(web, 'node_modules', 'vite', 'bin', 'vite.js'),
].find((file) => existsSync(file)) ?? '';
const pagePort = 5211;
const debugPort = 9347;
const pageUrl = `http://127.0.0.1:${pagePort}/dev/surface-sheet`;
const deadlineMs = 120000;

const browsers = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
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
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${url} (${last})`);
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
        "  ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -and $_.CommandLine.Contains($dir)",
        '} | ForEach-Object { & taskkill /pid $_.ProcessId /T /F | Out-Null }',
    ].join('\n');
    spawnSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'ignore' });
}

async function readResult(wsUrl) {
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
    const expression = 'window.__surfaceSheet ? JSON.stringify(window.__surfaceSheet) : ""';
    const deadline = Date.now() + deadlineMs;
    let result = null;
    while (Date.now() < deadline) {
        const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true });
        const text = evaluated?.result?.value;
        if (text) {
            const parsed = JSON.parse(text);
            if (parsed.status === 'done' || parsed.status === 'error') {
                result = parsed;
                break;
            }
        }
        await sleep(200);
    }
    ws.close();
    if (!result) throw new Error('Surface sheet did not finish.');
    return result;
}

const executable = browserPath();
if (!executable) {
    console.error('No Edge or Chrome executable was found. Install one, or say if a browser-automation package should be added. Nothing was installed.');
    process.exit(2);
}
if (!existsSync(viteBin)) {
    console.error('Vite is not installed in apps/web. Nothing was installed.');
    process.exit(2);
}

const profile = mkdtempSync(path.join(tmpdir(), 'voyage-surface-sheet-'));
let vite;
let browser;
try {
    vite = spawn(process.execPath, [viteBin, '--port', String(pagePort), '--strictPort', '--host', '127.0.0.1'], {
        cwd: web,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let viteLog = '';
    vite.stdout.on('data', (chunk) => { viteLog += chunk; });
    vite.stderr.on('data', (chunk) => { viteLog += chunk; });
    await waitFor(pageUrl, 60000);
    if (!viteLog.includes('Local:') && vite.exitCode) throw new Error(viteLog || 'Vite did not start.');
    browser = spawn(executable, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--remote-allow-origins=*',
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${debugPort}`,
        'about:blank',
    ], { stdio: 'ignore' });
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`, 30000);
    const opened = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
    if (!opened.ok) throw new Error(`DevTools did not open the page (${opened.status}).`);
    const target = await opened.json();
    if (!target.webSocketDebuggerUrl) throw new Error('DevTools target has no socket.');
    const result = await readResult(target.webSocketDebuggerUrl);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok || result.fromCache !== false || typeof result.workerStartMs !== 'number' || typeof result.sheetMs !== 'number' || typeof result.overlayMs !== 'number') {
        process.exitCode = 1;
    }
} catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
} finally {
    killPid(browser?.pid);
    killBrowsersUsing(profile);
    killPid(vite?.pid);
}
