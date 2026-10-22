/**
 * DF16 (Johnny 2026-10-18 15:05): the news scrubber. (1) Play went day 0 to the horizon in 6 s and looped:
 * it now takes one `--t-news-day` per day (about 3 days a second) and stops at the horizon. (2) Today sat
 * on the Play button at day 0: it now stays inside the track's own box at every position.
 * The label's rectangle against the button's is measured in headless Edge (Playwright, as
 * orbit_stage_layout does), with the scrubber mounted alone: no chart, no network. Without Playwright
 * (it lives in the ignored `.tmp/atlas-testing`) that part skips with its reason.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { edgeProfile, edgeSkipReason, launchEdge, loadPlaywright, removeProfile } from './harness/edge_launch.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

test('Play takes one --t-news-day per day and stops at the horizon', () => {
    const tokens = read('design/tokens.css');
    const day = /--t-news-day: (\d+)ms;/.exec(tokens);
    assert.ok(day, 'the token');
    const perSecond = 1000 / Number(day[1]);
    assert.ok(perSecond >= 2.5 && perSecond <= 3.5, 'about 3 days a second, so a day can be read: ' + perSecond.toFixed(2));
    const view = read('views/MapView.vue');
    assert.match(view, /getPropertyValue\('--t-news-day'\)/);
    assert.doesNotMatch(view, /getPropertyValue\('--t-ripple'\)/);
    const play = view.slice(view.indexOf('function playNews(): void {'), view.indexOf('function stopPlay(): void {'));
    assert.match(play, /if \(state\.t >= horizon\) state\.t = 0;/, 'Play again from the horizon starts from day 0');
    assert.match(play, /const t = playFrom \+ \(now\(\) - playStart\) \/ newsDayMs;/);
    assert.match(play, /if \(t >= horizon\) \{\s+live\.t = horizon;\s+live\.playing = false;\s+markDirty\(\);\s+return;\s+\}/, 'it stops there');
    assert.doesNotMatch(play, /playFrom = 0;/, 'no loop');
});

test('Today is placed in proportion: its left edge at the start, its right edge at the end', () => {
    const scrubber = read('map/NewsScrubber.vue');
    assert.match(scrubber, /:style="\{ left: todayLeft \+ '%', translate: -todayLeft \+ '% 0' \}"/);
    assert.doesNotMatch(scrubber.slice(scrubber.indexOf('.news-scrub-today {')), /^\s+translate: -50% 0;/m);
});

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0"><div id="app" style="position:relative;width:100vw;height:100vh"></div>
<script type="module">
import { createApp, h, reactive } from 'vue';
import '/src/design/tokens.css';
import '/src/design/base.css';
import NewsScrubber from '/src/map/NewsScrubber.vue';
const props = reactive({ sourceName: 'Strouden', t: 0, horizonDays: 60, day0: 403424, playing: false, canPlay: true, todayAt: 0, capped: false });
globalThis.scrubberProps = props;
createApp({ render: () => h(NewsScrubber, props) }).mount('#app');
</script></body></html>`;

test('Today stays inside the track and clear of Play at the start, the middle and the end, at 1600 and 390', { timeout: 120000 }, async (t) => {
    const playwright = loadPlaywright();
    if (!playwright) {
        t.skip('Playwright is not installed in .tmp/atlas-testing');
        return;
    }
    const cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-news-today-'));
    const { createServer } = await import('vite');
    const vite = await createServer({
        root: webRoot,
        cacheDir,
        appType: 'custom',
        logLevel: 'silent',
        server: { middlewareMode: true, hmr: false, ws: false },
        plugins: [{
            name: 'df16-page',
            configureServer(server) {
                server.middlewares.use('/df16.html', async (req, res) => {
                    res.setHeader('content-type', 'text/html');
                    res.end(await server.transformIndexHtml('/df16.html', PAGE));
                });
            },
        }],
    });
    const httpServer = http.createServer(vite.middlewares);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + httpServer.address().port + '/df16.html';
    const profileDir = edgeProfile('d-news-edge-');
    let context = null;
    try {
        try {
            context = await launchEdge(profileDir);
        } catch (error) {
            t.skip(edgeSkipReason(error));
            return;
        }
        for (const size of [{ width: 1600, height: 900 }, { width: 390, height: 844 }]) {
            const page = await context.newPage();
            await page.setViewportSize(size);
            await page.goto(url, { waitUntil: 'load', timeout: 30000 });
            await page.waitForSelector('[data-news-today]', { timeout: 30000 });
            for (const at of [0, 30, 60]) {
                await page.evaluate((day) => { globalThis.scrubberProps.todayAt = day; }, at);
                await page.waitForTimeout(50);
                const r = await page.evaluate(() => {
                    const box = (sel) => {
                        const b = document.querySelector(sel).getBoundingClientRect();
                        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
                    };
                    return { today: box('[data-news-today]'), play: box('[data-news-play]'), track: box('.news-scrub-track') };
                });
                const said = `${size.width}px, Today on day ${at}: ${JSON.stringify(r)}`;
                assert.ok(r.today.left >= r.track.left - 0.5 && r.today.right <= r.track.right + 0.5, 'inside the track: ' + said);
                const across = Math.min(r.today.right, r.play.right) - Math.max(r.today.left, r.play.left);
                const down = Math.min(r.today.bottom, r.play.bottom) - Math.max(r.today.top, r.play.top);
                assert.ok(!(across > 0 && down > 0), 'clear of Play: ' + said);
                assert.ok(r.today.left >= r.play.right, 'right of Play: ' + said);
            }
            await page.close();
        }
    } finally {
        if (context) await Promise.race([context.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
        await new Promise((resolve) => httpServer.close(resolve));
        await vite.close();
        fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
        removeProfile(profileDir);
    }
});
