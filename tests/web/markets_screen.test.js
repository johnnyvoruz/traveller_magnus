/**
 * DT4a (backlog T4a, D's half): Markets nearby on the vessel and in the dossier. The chart around a world (the
 * sector and its eight neighbours), the worlds on it (a hex with a UWP), A's `marketsNearby` over them; each row
 * opens the world as the dossier and Locate draws the line. The section's states rendered.
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

const GRID = [
    { slug: 'Spinward_Marches', x: 0, y: 0, canonical: true },
    { slug: 'Deneb', x: 1, y: 0, canonical: true },
    { slug: 'Trojan_Reach', x: 0, y: 1, canonical: true },
    { slug: 'Far_Away', x: 5, y: 5, canonical: true },
    { slug: 'Spinward_Marches', x: 9, y: 9, canonical: false },
];
const hex = (name, uwp, tree = null, tradeCodes = []) => ({ name, uwp, tree, tradeCodes, bases: '', zone: '' });

describe('markets near a world', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let near = null;
    let markets = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-markets-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        near = await server.ssrLoadModule('/src/workspace/markets_near.ts');
        markets = await server.ssrLoadModule('/src/campaign/markets.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    test('a sector stands where the grid says; the canonical one wins a shared slug', () => {
        const at = near.sectorAtOf(GRID);
        assert.deepEqual(at('Spinward_Marches'), { sx: 0, sy: 0 });
        assert.deepEqual(at('Deneb'), { sx: 1, sy: 0 });
        assert.equal(at('Nowhere'), null);
    });

    test('the sector and its neighbours, the sector first; not one further, not an unknown sector', () => {
        assert.deepEqual(near.sectorsAround(GRID, 'Spinward_Marches'), ['Spinward_Marches', 'Deneb', 'Trojan_Reach']);
        assert.deepEqual(near.sectorsAround(GRID, 'Far_Away'), ['Far_Away']);
        assert.deepEqual(near.sectorsAround(GRID, 'Nowhere'), []);
    });

    test('the worlds are the hexes with a UWP; a WTN read is kept; each keeps its tree for the WTN', () => {
        const index = { hexes: { '1910': hex('Regina', 'A788899-C', 'tr1', ['Ri', 'Pa', 'Ph']), '2304': hex('', ''), '2204': hex("Beck's World", 'D8834D0-4', 'tr2') } };
        const { worlds, trees } = near.worldsOf([{ slug: 'Spinward_Marches', index }], { 'Spinward_Marches/1910': 10 });
        assert.deepEqual(worlds.map((w) => [w.hexKey, w.starport, w.population, w.wtn]), [
            ['Spinward_Marches/1910', 'A', '8', 10],
            ['Spinward_Marches/2204', 'D', '4', null],
        ]);
        assert.deepEqual(worlds[0].tradeCodes, ['Ri', 'Pa', 'Ph']);
        assert.deepEqual(trees, { 'Spinward_Marches/1910': 'tr1', 'Spinward_Marches/2204': 'tr2' });
    });

    test('with A\'s marketsNearby: nearest first, the origin at 0, nothing past the range, across a sector edge', () => {
        const spin = { hexes: { '3201': hex('Edge', 'B000000-0'), '3101': hex('Next', 'C000000-0'), '2801': hex('Far', 'C000000-0') } };
        const deneb = { hexes: { '0101': hex('Over', 'A000000-0'), '0601': hex('Gone', 'A000000-0') } };
        const { worlds } = near.worldsOf([{ slug: 'Spinward_Marches', index: spin }, { slug: 'Deneb', index: deneb }], {});
        const rows = markets.marketsNearby('Spinward_Marches/3201', worlds, 2, near.sectorAtOf(GRID));
        // A tie goes by hex key: Deneb/0101 before Spinward_Marches/3101. "Far" (3 pc) and "Gone" (6 pc) are past 2.
    assert.deepEqual(rows.map((r) => [r.name, r.parsecs]), [['Edge', 0], ['Over', 1], ['Next', 1]]);
    });

    async function render(props) {
        const view = (await server.ssrLoadModule('/src/workspace/MarketsNearby.vue')).default;
        const { createSSRApp } = await import('vue');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const { renderToString } = await import('vue/server-renderer');
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
        await router.push('/');
        const app = createSSRApp(view, props);
        app.use(router);
        return renderToString(app);
    }

    test('the vessel\'s section: the range picked from 2, 4 or 6, and what it says with no world', async () => {
        const html = await render({ hexKey: null, noPlace: 'Under way: the markets show when it is at a world.' });
        assert.match(html, /class="mkt ui-frame"/);
        assert.match(html, /Markets/);
        assert.match(html, /Under way: the markets show when it is at a world\./);
        assert.doesNotMatch(html, /data-markets-range/, 'no range to pick with no world');
    });

    test('a world given: the range buttons, 2 parsecs first, and the chart being read', async () => {
        const html = await render({ hexKey: 'Spinward_Marches/1910' });
        assert.deepEqual([...html.matchAll(/data-markets-range="(\d)"/g)].map((m) => m[1]), ['2', '4', '6']);
        assert.match(html, /aria-pressed="true" data-markets-range="2"/);
        assert.match(html, /Reading the chart…/);
    });

    test('the dossier\'s fold: closed, nothing read, its summary says the range', async () => {
        const html = await render({ hexKey: 'Spinward_Marches/1910', fold: true });
        assert.match(html, /Markets nearby/);
        assert.match(html, /aria-expanded="false"/);
        assert.match(html, /Worlds within 2 parsecs/);
        assert.doesNotMatch(html, /data-markets-rows/);
    });
});

test('the vessel shows it at the world it is at, and says so when under way', () => {
    const page = read('workspace/RecordPage.vue');
    assert.match(page, /<MarketsNearby v-if="record\.type === 'vessel'" :hex-key="marketsAt"/);
    assert.match(page, /if \(now\.underway \|\| !now\.anchor\) return null;\s+const at = resolveAnchor\(now\.anchor, campaign\.records\);/);
});

test('the dossier\'s system page has the fold, not a referee\'s own sector', () => {
    const panel = read('dossier/DossierPanel.vue');
    assert.match(panel, /<MarketsNearby v-if="!preview && !slug\.startsWith\('~'\)" fold :hex-key="hexKey" \/>/);
});

test('a row opens its world as the dossier; Locate is the system\'s line; no price, no pairing', () => {
    const rows = read('workspace/MarketsRows.vue');
    assert.match(rows, /router\.push\(atPane\(dossierPath\(place\.slug, place\.hex\), route\.query, \{ kind: 'dossier' \}\)\)/);
    assert.match(rows, /startLocate\(systemSubject\(row\.hexKey\), row\.hexKey,/);
    const template = rows.slice(rows.indexOf('<template>'), rows.indexOf('<style>'));
    assert.doesNotMatch(template, /Cr\d|price|pair/i);
});
