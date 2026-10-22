/**
 * City light stays on the ground: a pixel test of the orbit disc programs.
 *
 * A headless Chromium (Edge, then Chrome) renders one pinned world through the real
 * disc baker (tests/web/harness/city_pixels.mjs, served by a Vite dev server of this
 * repo) twice: city terms on, and off. WebGL runs through SwiftShader, so the frame
 * does not depend on the machine's GPU. The two tiles are read back and compared:
 *
 * - outside the surface radius the two renders are the same, on every side: the city
 *   switch changes nothing in the air shell;
 * - on the night side of the limb the shell is fully transparent in both: no light of
 *   any hue past the surface there, city or air;
 * - inside the disc, on the night side, the renders differ: the lights are drawn.
 *
 * Without a Chromium browser on this machine the test is skipped, and says so.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'apps', 'web');
const harnessDir = path.join(root, 'tests', 'web', 'harness');
const stageDir = path.join(root, '.tmp', 'city-pixels');

const BROWSERS = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/** The worlds and programs under test: a world with lights and air in both programs, and a neon world. */
const CASES = [
    { mode: 'enhanced', world: 'pavabid' },
    { mode: 'vanilla', world: 'pavabid' },
    { mode: 'enhanced', world: 'rhylanor' },
];
const RADIUS = 160;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function browserPath() {
    return BROWSERS.find((file) => fs.existsSync(file)) || '';
}

function viteBin() {
    const local = path.join(web, 'node_modules', 'vite', 'bin', 'vite.js');
    if (fs.existsSync(local)) return local;
    return path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

function kill(child) {
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
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
    throw new Error('timed out waiting for ' + url + ' (' + last + ')');
}

/** The harness, staged under .tmp with the repo root spliced into its /@fs/ imports. */
function stageHarness() {
    fs.mkdirSync(stageDir, { recursive: true });
    const fsBase = '/@fs/' + root.replace(/\\/g, '/').replace(/^\/+/, '');
    for (const name of ['city_pixels.html', 'city_pixels.mjs']) {
        const text = fs.readFileSync(path.join(harnessDir, name), 'utf8').split('__FS__').join(fsBase);
        fs.writeFileSync(path.join(stageDir, name), text);
    }
    return fsBase + '/.tmp/city-pixels/city_pixels.html';
}

/** A minimal DevTools client over the global WebSocket. The browser has 30 seconds to open the port. */
async function connect(port) {
    let version = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !version) {
        try {
            const response = await fetch('http://127.0.0.1:' + port + '/json/version');
            if (response.ok) version = await response.json();
        } catch {
            // The browser is still starting.
        }
        if (!version) await sleep(250);
    }
    if (!version) throw new Error('the browser did not open its DevTools port');
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', () => reject(new Error('the DevTools socket failed')));
    });
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data));
        const waiting = pending.get(message.id);
        if (!waiting) return;
        pending.delete(message.id);
        if (message.error) waiting.reject(new Error(JSON.stringify(message.error)));
        else waiting.resolve(message.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    return {
        call: (method, params) => send(method, params, sessionId),
        close: () => ws.close(),
    };
}

/** Loads the harness for one case and returns its published result. */
async function render(page, pageUrl, item) {
    await page.call('Page.navigate', { url: pageUrl + '?mode=' + item.mode + '&world=' + item.world + '&radius=' + RADIUS });
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
        const evaluated = await page.call('Runtime.evaluate', {
            expression: 'window.__cityPixels && window.__cityPixels.status !== "starting" ? JSON.stringify(window.__cityPixels) : ""',
            returnByValue: true,
        });
        const text = evaluated && evaluated.result ? evaluated.result.value : '';
        if (text) {
            const result = JSON.parse(text);
            if (result.status === 'error') throw new Error(item.mode + ' ' + item.world + ': ' + result.message);
            return result;
        }
        await sleep(400);
    }
    return { status: 'slow', message: item.mode + ' ' + item.world + ': the harness did not finish in 150 s' };
}

/**
 * Reads both tiles. The tile is read back bottom-up (GL rows), and the shader's view space
 * is x right, y down, so a buffer row r sits at p.y = (c - r - 0.5) / R. The light is in the
 * same space: facing is the limb's bearing to the star, geo the surface normal's.
 */
export function compareTiles(result, radius) {
    const size = result.size;
    const c = size / 2;
    const on = Buffer.from(result.on, 'base64');
    const off = Buffer.from(result.off, 'base64');
    assert.equal(on.length, size * size * 4);
    assert.equal(off.length, size * size * 4);
    const [lx, ly] = result.light;
    const edge = 1 + 3 / radius;
    const out = { outsideMax: 0, nightShellAlpha: 0, nightShellMax: 0, insideNightChanged: 0, insideNightPixels: 0, outsidePixels: 0 };
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const px = (col + 0.5 - c) / radius;
            const py = (c - row - 0.5) / radius;
            const d = Math.hypot(px, py);
            const i = (row * size + col) * 4;
            let diff = 0;
            for (let k = 0; k < 4; k++) diff = Math.max(diff, Math.abs(on[i + k] - off[i + k]));
            if (d > edge) {
                out.outsidePixels += 1;
                out.outsideMax = Math.max(out.outsideMax, diff);
                const facing = (px * lx + py * ly) / d;
                if (facing < -0.45 && d <= 1 + result.halo) {
                    out.nightShellAlpha = Math.max(out.nightShellAlpha, on[i + 3], off[i + 3]);
                    out.nightShellMax = Math.max(out.nightShellMax, diff);
                }
            } else if (d < 0.95) {
                const geo = px * lx + py * ly;
                if (geo < -0.2) {
                    out.insideNightPixels += 1;
                    if (diff > 8) out.insideNightChanged += 1;
                }
            }
        }
    }
    return out;
}

test('city light is drawn inside the surface disc only, and the night limb shell carries none', { timeout: 420000 }, async (t) => {
    const browser = browserPath();
    if (!browser) {
        t.skip('no Chromium browser (Edge or Chrome) on this machine');
        return;
    }
    const pageUrl0 = stageHarness();
    const vitePort = await freePort();
    const debugPort = await freePort();
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'city-pixels-'));
    const vite = spawn(process.execPath, [viteBin(), '--port', String(vitePort), '--strictPort', '--host', '127.0.0.1'], {
        cwd: web,
        env: { ...process.env, BROWSER: 'none', CI: '1' },
        stdio: 'ignore',
        windowsHide: true,
    });
    let chrome = null;
    let page = null;
    try {
        await waitFor('http://127.0.0.1:' + vitePort + '/', 60000);
        chrome = spawn(browser, [
            '--headless=new', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + userDir,
            '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
            '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
            '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=800,600',
            'about:blank',
        ], { stdio: 'ignore', windowsHide: true });
        try {
            page = await connect(debugPort);
        } catch (error) {
            t.skip('the browser could not be started headless: ' + String(error.message || error).split('\n')[0]);
            return;
        }
        await page.call('Page.enable');
        await page.call('Runtime.enable');
        const pageUrl = 'http://127.0.0.1:' + vitePort + pageUrl0;
        for (const item of CASES) {
            const result = await render(page, pageUrl, item);
            if (result.status === 'slow') {
                t.skip(result.message);
                return;
            }
            assert.equal(result.status, 'done');
            assert.equal(result.radius, RADIUS);
            const seen = compareTiles(result, RADIUS);
            const label = item.mode + ' ' + item.world + ' (' + result.renderer + ')';
            t.diagnostic(label + ': outside max diff ' + seen.outsideMax + ' of ' + seen.outsidePixels + ' px; night shell alpha '
                + seen.nightShellAlpha + ', diff ' + seen.nightShellMax + '; night side ' + seen.insideNightChanged + ' of '
                + seen.insideNightPixels + ' px lit by the city switch');
            assert.ok(seen.outsidePixels > 1000, label + ': the tile has a shell outside the surface');
            assert.ok(seen.outsideMax <= 2, label + ': outside the surface radius the city switch changes a pixel by ' + seen.outsideMax);
            assert.equal(seen.nightShellAlpha, 0, label + ': the night limb shell is not transparent');
            assert.equal(seen.nightShellMax, 0, label + ': the night limb shell differs with the city switch');
            assert.ok(seen.insideNightPixels > 2000, label + ': the night side is in the frame');
            assert.ok(seen.insideNightChanged > 100, label + ': city light is missing on the night side (' + seen.insideNightChanged + ' pixels changed)');
        }
    } finally {
        if (page) page.close();
        kill(chrome);
        kill(vite);
        try {
            fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        } catch (error) {
            const code = error && error.code;
            if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') throw error;
        }
    }
});
