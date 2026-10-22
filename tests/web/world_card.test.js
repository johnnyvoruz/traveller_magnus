/**
 * DW1: the world hover card, the world counterpart of the record card. Its words (zone, bases), the card as
 * rendered (the hex in words, the campaign's records there, Open), one card at a time, and where it is used:
 * Markets nearby, the Where block and the Timeline's places. The record card's rules: the same delays, touch
 * never, Escape, a click or a scroll closes it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const stamp = '2026-10-18T00:00:00.000Z';
const record = (n, name, anchor) => ({
    id: rid(n), type: 'person', kind: '', name, summary: '', details: '', tags: [], anchor, when: null, visibility: 'referee',
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 1, createdAt: stamp, updatedAt: stamp, deleted: false,
});

describe('the world card', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let card = null;
    let store = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-world-card-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        card = await server.ssrLoadModule('/src/workspace/world_card.ts');
        store = await server.ssrLoadModule('/src/campaign/store.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    test('the zone and the bases in words', () => {
        assert.equal(card.zoneWords('A'), 'Amber zone');
        assert.equal(card.zoneWords('R'), 'Red zone');
        assert.equal(card.zoneWords(''), '');
        assert.equal(card.baseWords({ naval: true, scout: true, text: '' }), 'Naval base · Scout base');
        assert.equal(card.baseWords({ naval: false, scout: true, text: '' }), 'Scout base');
        assert.equal(card.baseWords({ naval: false, scout: false, text: '' }), '');
        assert.equal(card.baseWords({ naval: true, scout: false, text: 'NW' }), 'Bases NW');
    });

    async function render() {
        const view = (await server.ssrLoadModule('/src/workspace/WorldCard.vue')).default;
        const { createSSRApp } = await import('vue');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const { renderToString } = await import('vue/server-renderer');
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
        await router.push('/');
        const app = createSSRApp(view);
        app.use(router);
        const ctx = {};
        await renderToString(app, ctx);
        return (ctx.teleports && ctx.teleports.body) || '';
    }

    test('nothing shows until a link asks', async () => {
        card.closeWorldCard();
        assert.doesNotMatch(await render(), /data-world-card/);
    });

    test('a hex the chart has not read: its hex in words, the campaign\'s records there, Open', async () => {
        const { campaign } = store;
        for (const key of Object.keys(campaign.records)) delete campaign.records[key];
        const at = { kind: 'system', hexKey: 'Spinward_Marches/1719' };
        for (const row of [record(1, 'Idra Solm', at), record(2, 'Cal Derrow', at), record(3, 'Hob Tench', at), record(4, 'Mara Venn', at), record(5, 'Elsewhere', { kind: 'system', hexKey: 'Spinward_Marches/1910' })]) campaign.records[row.id] = row;
        campaign.status = 'ready';
        card.worldCard.hexKey = 'Spinward_Marches/1719';
        card.worldCard.rect = { left: 10, top: 10, right: 100, bottom: 30 };
        const html = await render();
        assert.match(html, /role="tooltip"/);
        assert.match(html, /id="world-card"/);
        assert.match(html, /<b>Spinward Marches 1719<\/b>/);
        assert.match(html, /Reading the chart…/);
        assert.match(html.replace(/<!--[^>]*-->/g, ''), /Here:<\/span> Cal Derrow, Hob Tench, Idra Solm, and one more/);
        assert.doesNotMatch(html, /Elsewhere/);
        assert.match(html, /Open/);
        card.worldCard.hexKey = null;
        card.worldCard.rect = null;
    });
});

test('the same rules as the record card: its delays, touch never, Escape, a click or a scroll closes it', () => {
    const src = read('workspace/world_card.ts');
    assert.match(src, /import \{ closeCard as closeRecordCard, HIDE_AFTER, SHOW_AFTER, type CardRect \} from '\.\/record_card\.ts';/);
    assert.match(src, /if \(event\.pointerType === 'touch' \|\| !state\.hexKey\) return;/);
    assert.match(src, /if \(event\.key !== 'Escape' \|\| !worldCard\.hexKey\) return;/);
    assert.match(src, /document\.addEventListener\('scroll', onScroll, true\);/);
    assert.match(src, /const click = \(\) => \{ closeWorldCard\(\); \};/);
    assert.match(src, /if \(state\.hexKey && el\.matches\(':focus-visible'\)\) show\(state\.hexKey, el\);/);
});

test('one card at a time: the world card closes the record card, and the record card opening closes it', () => {
    assert.match(read('workspace/world_card.ts'), /clearTimers\(\);\s+closeRecordCard\(\);/);
    assert.match(read('workspace/WorldCard.vue'), /watch\(\(\) => recordCard\.id, \(id\) => \{ if \(id\) closeWorldCard\(\); \}\);/);
});

test('mounted once beside the record card; used by Markets, the Where block and the Timeline\'s places', () => {
    assert.match(read('shell/PanelHost.vue'), /<RecordCard \/>\s+<WorldCard \/>/);
    assert.match(read('workspace/MarketsRows.vue'), /<button v-world-card="row\.hexKey" type="button" class="mkt-row"/);
    assert.match(read('workspace/WhereBlock.vue'), /<span v-world-card="place\.hexKey" class="where-place"[^>]*tabindex="0"/);
    assert.match(read('workspace/TimelineList.vue'), /<span v-world-card="row\.hexKey \|\| null" class="tl-place">\{\{ row\.place \}\}<\/span>/);
});

test('an empty hex says so; an unread one is asked for', () => {
    const near = read('workspace/markets_near.ts');
    assert.match(near, /client\(\)\.want\(marketsChart\.version, \[place\.slug\]\);/);
    assert.match(near, /return row && row\.uwp && row\.uwp\.trim\(\) \? row : 'empty';/);
    assert.match(read('workspace/WorldCard.vue'), /No world in this hex\./);
});
