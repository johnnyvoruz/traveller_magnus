/**
 * CC2 amendment: System Comms and Fit sit at the lower left. The receiver, the
 * chips, the open View drawer, and the Layers key do not cover them.
 * CC4: the receiver's right edge is the stage's 18px inset, and its frame
 * stays the same through an ordinary line and every Beowulf fragment.
 */
import { BEOWULF_SEGMENTS } from '../../apps/web/src/living/comms/beowulf.ts';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire('D:/webstorm/traveller_magnus/.tmp/atlas-testing/package.json');
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');

function longestCorpusLine() {
    const found = [];
    const walk = (value) => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.text === 'string') found.push(value.text);
        for (const key of Object.keys(value)) walk(value[key]);
    };
    walk(JSON.parse(fs.readFileSync(path.join(webRoot, 'src/living/lines/corpus.json'), 'utf8')));
    return found.reduce((best, line) => (line.length > best.length ? line : best), '');
}

const LONGEST_LINE = longestCorpusLine();
const LONGEST_BEOWULF = BEOWULF_SEGMENTS.reduce((best, line) => (line.length > best.length ? line : best), '');
/** The same public chart scripts/dev.mjs points Vite at when it is not using a local truth. */
const CHART = 'https://traveller.voyage';
if (!process.env.VOYAGE_TRUTH_API) process.env.VOYAGE_TRUTH_API = CHART;

/** A short probe. A miss skips the test. It does not wait on the page. */
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

function overlap(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 1 && h > 1;
}

const WIDTHS = [
    { name: '1600', width: 1600, height: 900, closePanel: true },
    { name: '1366', width: 1366, height: 768, closePanel: false },
    { name: '1024', width: 1024, height: 768, closePanel: false },
    { name: '390', width: 390, height: 844, closePanel: false },
];

test('System Comms, Fit, the receiver and the chips do not overlap', { timeout: 180000 }, async (t) => {
    const origin = process.env.VOYAGE_TRUTH_API;
    if (!(await chartReachable(origin))) {
        t.skip('the chart at ' + origin + ' cannot be reached');
        return;
    }
    const cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'c-stage-'));
    const { createServer } = await import('vite');
    const server = await createServer({
        root: webRoot,
        cacheDir,
        server: { host: '127.0.0.1', port: 6227, strictPort: true, hmr: false },
        logLevel: 'silent',
    });
    await server.listen();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const hits = [];
    let oneRow = false;
    let twoRows = false;
    try {
        for (const size of WIDTHS) {
            const context = await browser.newContext({
                viewport: { width: size.width, height: size.height },
                deviceScaleFactor: 1,
            });
            await context.addInitScript(() => {
                localStorage.setItem('voyage_welcome_shown', '1');
                localStorage.setItem('voyage_first_hint_done', '1');
                localStorage.setItem('voyage_panel_span', 'column');
            });
            const page = await context.newPage();
            await page.goto('http://127.0.0.1:6227/s/Spinward_Marches/1910/orbit', { waitUntil: 'networkidle', timeout: 60000 });
            await page.waitForSelector('.orbit-stage[data-state="ready"]', { timeout: 60000 });
            if (size.closePanel) {
                const close = page.locator('[aria-label="Close panel"]');
                if (await close.count()) await close.first().click();
                await page.waitForTimeout(300);
            }
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
                    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, height: r.height };
                }
                return {
                    comms: box('[data-command="system-comms"]'),
                    fit: box('.orbit-stage-tools [data-command="orbit-fit"]'),
                    receiver: box('.orbit-comms'),
                    chips: box('.orbit-stage-chips'),
                    layouts: box('.orbit-layouts'),
                    picture: box('.orbit-picture-group'),
                    key: box('.orbit-key'),
                };
            });
            const closed = await measure();
            const inset = await page.evaluate(() => {
                const stage = document.querySelector('.orbit-stage');
                const slot = document.querySelector('.orbit-comms');
                if (!stage || !slot) return 99;
                return Math.abs(slot.getBoundingClientRect().right - (stage.getBoundingClientRect().right - 18));
            });
            if (inset > 1.5) hits.push(size.name + ' receiver inset ' + inset.toFixed(1));
            const frames = await page.evaluate((payload) => {
                const root = document.querySelector('.trx-receiver');
                const words = root && root.querySelector('[data-trx-words]');
                const source = root && root.querySelector('[data-trx-source]');
                const kind = root && root.querySelector('[data-trx-kind]');
                const copy = root && root.querySelector('[data-trx-copy]');
                if (!root || !words || !copy) return { samples: ['missing'], fit: [] };
                const read = () => {
                    const b = root.getBoundingClientRect();
                    return [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100) / 100).join(',');
                };
                const apply = (text, from, type, theme) => {
                    words.textContent = text;
                    if (source) source.textContent = from;
                    if (kind) kind.textContent = type;
                    root.setAttribute('data-comms-theme', theme);
                    return read();
                };
                const linesOf = (text) => {
                    words.textContent = text;
                    const range = document.createRange();
                    range.selectNodeContents(words);
                    const copyBox = copy.getBoundingClientRect();
                    const rects = [...range.getClientRects()];
                    const visible = rects.filter((rect) => rect.bottom <= copyBox.bottom + 1).length;
                    return { lines: rects.length, visible };
                };
                const ordinary = 'Welcome to Regina. Highport arrivals, contact approach on channel four. Surface-bound traffic use the published descent corridor and hold above the night side until the port clears the queue.';
                const samples = [read()];
                samples.push(apply(ordinary, 'REGINA APPROACH', 'LOCAL APPROACH', 'normal'));
                samples.push(apply(payload.corpus, 'MERCHANT', 'LOCAL APPROACH', 'normal'));
                for (const text of payload.segments) samples.push(apply(text, 'FREE TRADER BEOWULF', 'EMERGENCY', 'emergency'));
                const fit = [linesOf(payload.corpus), linesOf(payload.beowulf)];
                samples.push(apply('Awaiting transmission', 'PORT CONTROL', 'LOCAL APPROACH', 'normal'));
                return { samples, fit };
            }, { segments: BEOWULF_SEGMENTS, corpus: LONGEST_LINE, beowulf: LONGEST_BEOWULF });
            const distinct = [...new Set(frames.samples)];
            if (distinct.length !== 1) hits.push(size.name + ' frame ' + distinct.join(' -> '));
            if (size.name === '1600' || size.name === '390') {
                const [corpusFit, beowulfFit] = frames.fit;
                const corpusNeed = Math.min(3, corpusFit.lines);
                if (corpusFit.visible < corpusNeed) hits.push(size.name + ' corpus lines ' + corpusFit.visible + '/' + corpusFit.lines);
                if (beowulfFit.lines >= 3 && beowulfFit.visible < 3) hits.push(size.name + ' beowulf lines ' + beowulfFit.visible + '/' + beowulfFit.lines);
                if (beowulfFit.lines <= 3 && beowulfFit.visible < beowulfFit.lines) hits.push(size.name + ' beowulf clipped ' + beowulfFit.visible + '/' + beowulfFit.lines);
            }
            if (closed.chips) {
                if (closed.chips.height < 70) oneRow = true;
                if (closed.chips.height > 70) twoRows = true;
            }
            const names = Object.keys(closed);
            for (let i = 0; i < names.length; i += 1) {
                for (let j = i + 1; j < names.length; j += 1) {
                    const a = closed[names[i]];
                    const b = closed[names[j]];
                    if (a && b && overlap(a, b)) hits.push(size.name + ' ' + names[i] + '/' + names[j]);
                }
            }
            await page.click('[data-command="orbit-drawer-view"]');
            await page.waitForSelector('.orbit-layouts', { timeout: 5000 });
            const view = await measure();
            for (const pair of [['layouts', 'comms'], ['layouts', 'fit'], ['layouts', 'chips'], ['layouts', 'receiver'], ['picture', 'comms'], ['picture', 'fit'], ['picture', 'chips'], ['picture', 'receiver']]) {
                const a = view[pair[0]];
                const b = view[pair[1]];
                if (a && b && overlap(a, b)) hits.push(size.name + ' view ' + pair.join('/'));
            }
            await page.click('[data-command="orbit-drawer-layers"]');
            await page.waitForSelector('.orbit-key', { timeout: 5000 });
            const layers = await measure();
            for (const other of ['comms', 'fit', 'chips', 'receiver']) {
                if (layers.key && layers[other] && overlap(layers.key, layers[other])) hits.push(size.name + ' key/' + other);
            }
            if (size.name === '1600') {
                const before = await page.evaluate(() => {
                    const el = document.querySelector('.orbit-comms');
                    const b = el.getBoundingClientRect();
                    return b.width + 'x' + b.height;
                });
                await page.click('[data-command="system-comms"]');
                await page.waitForFunction(() => {
                    const el = document.querySelector('.orbit-comms');
                    return !!el && Number(getComputedStyle(el).opacity) < 1;
                }, { timeout: 1000 });
                const during = await page.evaluate(() => {
                    const el = document.querySelector('.orbit-comms');
                    const b = el.getBoundingClientRect();
                    return b.width + 'x' + b.height;
                });
                if (during !== before) hits.push('1600 fade moved ' + before + ' to ' + during);
                await page.waitForSelector('.orbit-comms', { state: 'detached', timeout: 2000 });
            }
            await context.close();
        }
    } finally {
        await browser.close();
        await server.close();
        fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    assert.deepEqual(hits, [], hits.join('; '));
    assert.equal(oneRow, true, 'chips on one row');
    assert.equal(twoRows, true, 'chips on two rows');
});
