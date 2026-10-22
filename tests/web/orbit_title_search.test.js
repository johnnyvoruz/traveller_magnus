/**
 * CF1: the orbit title (name, hex, age) and the search field do not cover
 * each other. An open panel already clears the field. A shut panel used to
 * slide the title under the glass.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { edgeProfile, edgeSkipReason, launchEdge } from './harness/edge_launch.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const CHART = 'https://traveller.voyage';
if (!process.env.VOYAGE_TRUTH_API) process.env.VOYAGE_TRUTH_API = CHART;

async function chartReachable(origin) {
    const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
        const res = await fetch(base + '/api/truth/versions', { signal: ctrl.signal });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

function removeTree(dir) {
    if (!dir) return;
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
        const code = error && error.code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') throw error;
    }
}

function overlap(a, b) {
    if (!a || !b) return false;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 1 && h > 1;
}

const WIDTHS = [
    { name: '1600', width: 1600, height: 900 },
    { name: '1366', width: 1366, height: 768 },
    { name: '1024', width: 1024, height: 768 },
    { name: '390', width: 390, height: 844 },
];
const SPANS = ['Column', 'Half', 'Full'];

test('the orbit title and the search field do not cover each other', { timeout: 180000 }, async (t) => {
    const origin = process.env.VOYAGE_TRUTH_API;
    if (!(await chartReachable(origin))) {
        t.skip('the chart at ' + origin + ' cannot be reached');
        return;
    }
    const cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'c-title-'));
    const { createServer } = await import('vite');
    let server;
    let context;
    let profileDir;
    const hits = [];
    try {
        server = await createServer({
            root: webRoot,
            cacheDir,
            server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
            logLevel: 'silent',
        });
        await server.listen();
        const address = server.httpServer.address();
        const port = address && typeof address === 'object' ? address.port : 0;
        profileDir = edgeProfile('c-title-edge-');
        let launchTimer;
        try {
            context = await Promise.race([
                launchEdge(profileDir),
                new Promise((_, reject) => {
                    launchTimer = setTimeout(() => reject(new Error('Edge launch timed out')), 35000);
                }),
            ]);
        } catch (error) {
            t.skip(edgeSkipReason(error));
            return;
        } finally {
            clearTimeout(launchTimer);
        }
        await context.addInitScript(() => {
            localStorage.setItem('voyage_welcome_shown', '1');
            localStorage.setItem('voyage_first_hint_done', '1');
            localStorage.setItem('voyage_panel_span', 'column');
        });
        for (const size of WIDTHS) {
            const page = await context.newPage();
            await page.setViewportSize({ width: size.width, height: size.height });
            await page.goto('http://127.0.0.1:' + port + '/s/Spinward_Marches/1910/orbit', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('.orbit-stage[data-state="ready"]', { timeout: 60000 });
            const measure = () => page.evaluate(() => {
                function box(selector) {
                    const el = document.querySelector(selector);
                    if (!el) return null;
                    const style = getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') return null;
                    let r = el.getBoundingClientRect();
                    let node = el.parentElement;
                    while (node) {
                        const parent = getComputedStyle(node);
                        if (parent.overflow !== 'visible' || parent.overflowX !== 'visible' || parent.overflowY !== 'visible') {
                            const c = node.getBoundingClientRect();
                            const left = Math.max(r.left, c.left);
                            const top = Math.max(r.top, c.top);
                            const right = Math.min(r.right, c.right);
                            const bottom = Math.min(r.bottom, c.bottom);
                            r = { left, top, right, bottom, width: right - left, height: bottom - top };
                        }
                        node = node.parentElement;
                    }
                    if (r.width < 2 || r.height < 2) return null;
                    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
                }
                return {
                    omni: box('.omni-field'),
                    nav: box('.orbit-nav'),
                    identity: box('.orbit-identity'),
                    back: box('.orbit-back'),
                    title: box('.orbit-identity h1'),
                };
            });
            for (const span of SPANS) {
                await page.evaluate((label) => {
                    const btn = [...document.querySelectorAll('.panel-spans button')].find((node) => (node.textContent || '').trim() === label);
                    if (btn) btn.click();
                }, span);
                await page.waitForTimeout(700);
                const boxes = await measure();
                if (!boxes.omni) hits.push(size.name + ' ' + span + ' search missing');
                for (const key of ['nav', 'identity', 'back', 'title']) {
                    if (overlap(boxes.omni, boxes[key])) hits.push(size.name + ' ' + span + ' search covers ' + key);
                }
                // Full hides the orbit card. Column and Half keep the title on the chrome row, beside the field.
                if (span !== 'Full' && size.width >= 600) {
                    if (!boxes.identity) hits.push(size.name + ' ' + span + ' title missing');
                    else if (boxes.omni && boxes.identity.top >= boxes.omni.bottom) hits.push(size.name + ' ' + span + ' title dropped under search');
                }
            }
            await page.evaluate(() => {
                const btn = document.querySelector('[aria-label="Close panel"]');
                if (btn) btn.click();
            });
            // Closing from Full slides the card in from the right and down, over the rail's duration.
            let closed = await measure();
            const closedStart = Date.now();
            while (Date.now() - closedStart < 8000) {
                if (closed.omni && closed.nav && closed.identity && closed.nav.top >= closed.omni.bottom - 1) break;
                await page.waitForTimeout(150);
                closed = await measure();
            }
            if (!closed.omni) hits.push(size.name + ' closed search missing');
            if (!closed.identity) hits.push(size.name + ' closed title missing');
            for (const key of ['nav', 'identity', 'back', 'title']) {
                if (overlap(closed.omni, closed[key])) hits.push(size.name + ' closed search covers ' + key);
            }
            if (closed.omni && closed.nav && closed.nav.top < closed.omni.bottom - 1) {
                hits.push(size.name + ' closed title still on the search row');
            }
            await page.close();
        }
    } finally {
        if (context) await Promise.race([context.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
        if (server) await server.close();
        removeTree(cacheDir);
        removeTree(profileDir);
    }
    assert.deepEqual(hits, []);
});
