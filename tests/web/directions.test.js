/**
 * DN1 (streams/D.md): Directions on the chart, on A's planner (AN1). The boxes read against the loaded
 * sectors, the leg lines, the total with the time in jump from the rules file, the party ship's jump,
 * no route, the layer's points, the panel rendered and where MapView mounts it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { blankForm, directions, endWords, findEnd, fuelWords, jumpForBox, legLine, meanJumpHours, placeName, totalWords } from '../../apps/web/src/map/directions.ts';
import { stopPoints } from '../../apps/web/src/map/directions_layer.ts';
import { hexCentre, toGlobal } from '../../apps/web/src/map/geometry.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const rulesFile = JSON.parse(fs.readFileSync(path.join(root, 'rules', 'mgt2e_space_travel.json'), 'utf8'));

function sector(slug, name, x, y, rows) {
    const hexes = {};
    for (const row of rows) hexes[row.hex] = { name: row.name ?? '', uwp: row.uwp, zone: row.zone ?? '', pbg: row.pbg ?? '000' };
    return { slug, name, x, y, hexes };
}

// A Jump-1 chain across a sector edge: Alpha (0205) to Beta (0105, Amber) to Gamma, 3205 of the sector to the west.
const west = sector('West_Reach', 'West Reach', 0, 0, [
    { hex: '0205', name: 'Alpha', uwp: 'B555555-8' },
    { hex: '0105', name: 'Beta', uwp: 'B555555-8', zone: 'A' },
    { hex: '0305', name: 'Alpine', uwp: 'X000000-0' },
    { hex: '0307', uwp: 'C555555-8' },
]);
const east = sector('East_Reach', 'Sunward Reach', -1, 0, [
    { hex: '3205', name: 'Gamma', uwp: 'A555555-8' },
]);

test('the boxes: a whole name, a start shared or unique, sector and hex both ways, and the misses', () => {
    const indexes = [west, east];
    assert.deepEqual(findEnd(indexes, 'beta', 'From'), { ok: true, end: { sector: 'West_Reach', hex: '0105' }, label: 'Beta' });
    assert.deepEqual(findEnd(indexes, '  Gam ', 'To'), { ok: true, end: { sector: 'East_Reach', hex: '3205' }, label: 'Gamma' });
    assert.deepEqual(findEnd(indexes, 'Alp', 'From'), { ok: false, message: '2 systems start with “Alp”. Type more of the name.' });
    assert.deepEqual(findEnd(indexes, 'Alpha', 'From').end, { sector: 'West_Reach', hex: '0205' }, 'a whole name wins over a shared start');
    assert.deepEqual(findEnd(indexes, 'West Reach 0307', 'To'), { ok: true, end: { sector: 'West_Reach', hex: '0307' }, label: 'West Reach 0307' });
    assert.deepEqual(findEnd(indexes, 'West_Reach/0205', 'To').end, { sector: 'West_Reach', hex: '0205' });
    assert.deepEqual(findEnd(indexes, 'West Reach 0909', 'To'), { ok: false, message: 'There is no system at West Reach 0909.' });
    assert.deepEqual(findEnd(indexes, 'Regina', 'To'), { ok: false, message: 'No system called “Regina” in the loaded sectors.' });
    assert.deepEqual(findEnd(indexes, ' ', 'From'), { ok: false, message: 'Type a system in From.' });
    assert.equal(endWords(indexes, { sector: 'West_Reach', hex: '0105' }), 'Beta');
    assert.equal(endWords(indexes, { sector: 'West_Reach', hex: '0307' }), 'West Reach 0307', 'no name: the sector and hex');
    assert.equal(placeName(indexes, { sector: 'East_Reach', hex: '3205' }), 'Gamma');
});

test('a route: the stops, one line per leg with the fuel and the notes, the total', () => {
    const result = directions([west, east], { ...blankForm(), from: 'Alpha', to: 'Gamma', jump: 1 });
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(result.stops, [{ sector: 'West_Reach', hex: '0205' }, { sector: 'West_Reach', hex: '0105' }, { sector: 'East_Reach', hex: '3205' }]);
    assert.equal(result.lines.length, 2);
    assert.match(result.lines[0], /^1\. Alpha → Beta, 1 parsec · Starport B, refined · Amber zone$/);
    assert.match(result.lines[1], /^2\. Beta → Gamma, 1 parsec/);
    // The same legs as the list's rows: the start, then a row a jump with the notes apart.
    assert.deepEqual(result.origin, { end: { sector: 'West_Reach', hex: '0205' }, name: 'Alpha' });
    assert.deepEqual(result.legs[0], { end: { sector: 'West_Reach', hex: '0105' }, name: 'Beta', parsecs: '1 parsec', fuel: 'Starport B, refined', notes: ['Amber zone'] });
    assert.equal(result.legs.length, result.lines.length);
    assert.equal(result.total, '2 jumps, 2 parsecs, about 2 weeks in jump');
});

test('the words: fuel by source, plural parsecs, the time in jump from the rules file', () => {
    const indexes = [west];
    const leg = (over) => ({ from: { sector: 'West_Reach', hex: '0205' }, to: { sector: 'West_Reach', hex: '0307' }, parsecs: 2, source: 'starport', grade: 'unrefined', notes: [], ...over });
    assert.equal(fuelWords(indexes, leg({})), 'Starport C, unrefined');
    assert.equal(fuelWords(indexes, leg({ source: 'gas-giant' })), 'Gas giant, unrefined');
    assert.equal(fuelWords(indexes, leg({ source: 'water', grade: 'refined' })), 'Water, refined');
    assert.equal(fuelWords(indexes, leg({ source: 'none', grade: 'none' })), '');
    assert.equal(legLine(indexes, leg({ source: 'none', grade: 'none', notes: ['Amber zone'] }), 3), '3. Alpha → West Reach 0307, 2 parsecs · Amber zone');
    const hours = rulesFile.jump.durationHours;
    assert.equal(meanJumpHours(), hours.base + hours.dice * 3.5, 'the base plus the dice\'s mean');
    const four = Array.from({ length: 4 }, () => leg({ parsecs: 2 }));
    assert.equal(totalWords(four), '4 jumps, 8 parsecs, about ' + Math.round((4 * meanJumpHours()) / 168) + ' weeks in jump');
    assert.equal(totalWords([leg({ parsecs: 1 })]), '1 jump, 1 parsec, about 1 week in jump');
});

test('no route says A\'s reason; the same system says so; the party ship\'s jump is 1 to 6', () => {
    const far = sector('Far', 'Far', 0, 0, [{ hex: '0101', name: 'Lonely', uwp: 'A555555-8' }, { hex: '0901', name: 'Distant', uwp: 'A555555-8' }]);
    const none = directions([far], { ...blankForm(), from: 'Lonely', to: 'Distant', jump: 2 });
    assert.deepEqual(none, { ok: false, message: 'No route with Jump-2 between these systems.' });
    assert.deepEqual(directions([far], { ...blankForm(), from: 'Lonely', to: 'Lonely' }), { ok: false, message: 'From and To are the same system.' });
    assert.deepEqual(directions([far], { ...blankForm(), from: 'Nowhere', to: 'Lonely' }), { ok: false, message: 'No system called “Nowhere” in the loaded sectors.' });
    assert.deepEqual([null, 0, 1, 6, 7].map(jumpForBox), [null, null, 1, 6, null]);
    assert.deepEqual(blankForm(), { from: '', to: '', jump: 2, fuel: 'any', scoops: false, processors: false, allowRed: false });
});

test('the layer: the stops as hex centres, a sector the chart does not place left out', () => {
    const at = (slug) => (slug === 'West_Reach' ? { x: 0, y: 0 } : null);
    const points = stopPoints([{ sector: 'West_Reach', hex: '0105' }, { sector: 'Gone', hex: '0101' }, { sector: 'West_Reach', hex: '0205' }], at);
    const g = toGlobal(0, 0, 1, 5);
    assert.deepEqual(points[0], hexCentre(g.q, g.r));
    assert.equal(points.length, 2);
});

test('pins: MapView mounts the panel and its layer, the command, Escape, the style', () => {
    const view = fs.readFileSync(path.join(webRoot, 'src/views/MapView.vue'), 'utf8');
    assert.match(view, /<canvas ref="directionsEl" class="directions-layer" aria-hidden="true"><\/canvas>/);
    assert.match(view, /<DirectionsPanel\s+v-if="directionsOpen"/);
    assert.match(view, /@route="showDirections"\s+@fit="fitDirections"/, 'the chart shows the whole route when the panel asks');
    assert.match(view, /function fitDirections\(\): void \{[\s\S]*?const free = area\(true\);[\s\S]*?querySelector\('\[data-directions\]'\)[\s\S]*?flyTo\(centreIn\(/, 'fitted into the chart beside the pane and Directions');
    assert.match(view, /id: 'directions',\s+name: 'Directions',\s+keys: \['d'\],/);
    assert.match(view, /if \(directionsOpen\.value\) \{\s+closeDirections\(\);\s+return;\s+\}/, 'Escape closes it');
    assert.match(view, /directionsPoints = null;\s+markDirty\(\);/, 'closing clears the route');
    assert.match(view, /if \(directionsLayer\) directionsLayer\.draw\(cam, viewport\(\), directionsPoints, directionsInk\);/);
    assert.match(view, /directionsInk = \{ line: style\.getPropertyValue\('--signal'\)\.trim\(\), casing: style\.getPropertyValue\('--bg-0'\)\.trim\(\) \};/);
    for (const rel of ['src/map/DirectionsPanel.vue', 'src/map/directions.ts', 'src/map/directions_layer.ts']) {
        const text = fs.readFileSync(path.join(webRoot, rel), 'utf8');
        assert.doesNotMatch(text, /#[0-9a-f]{3,6}\b/i, rel + ': tokens only');
        assert.doesNotMatch(text, /\bwindow\.|\bdocument\.|alert\(|confirm\(/, rel);
    }
    const panel = fs.readFileSync(path.join(webRoot, 'src/map/DirectionsPanel.vue'), 'utf8');
    const phone = panel.slice(panel.indexOf('@media (max-width: 599px)'));
    assert.match(phone, /left: calc\(var\(--rail-width\) \+ var\(--chrome-inset\)\);/, 'DF42: past the rail on a phone');
    assert.match(phone, /max-height: calc\(100% - var\(--chrome-top\) - 2 \* \(var\(--chrome-height\) \+ 8px\) - var\(--chrome-inset\) - max\(var\(--sheet-cover, 0px\), env\(safe-area-inset-bottom, 0px\)\)\);/, 'DF42, DN2: above the world sheet (the corner buttons went to the top bar, CU49)');
});

describe('the panel renders', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-directions-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    async function render(over) {
        const view = (await server.ssrLoadModule('/src/map/DirectionsPanel.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] });
        await router.push('/');
        await router.isReady();
        const props = { indexes: () => [west, east], ...over };
        return (await renderToString(createSSRApp(view, props).use(router))).replace(/<!--[\s\S]*?-->/g, '');
    }

    test('the boxes, the choices, Any fuel first; the party ship\'s button only with a jump', async () => {
        const html = await render({});
        for (const sel of ['data-directions-from', 'data-directions-to', 'data-directions-swap', 'data-directions-scoops', 'data-directions-processors', 'data-directions-red', 'data-directions-go']) {
            assert.match(html, new RegExp(sel), sel);
        }
        assert.match(html, />Jump-1<\/option>[\s\S]*>Jump-6<\/option>/);
        assert.match(html, /<option value="any"[^>]*>Any fuel<\/option><option value="starport"[^>]*>Starport only<\/option><option value="refined"[^>]*>Refined only<\/option>/);
        assert.match(html, /aria-label="Swap From and To"[^>]*data-directions-swap/, 'the swap is one control beside the two boxes');
        assert.match(html, />Get directions</);
        assert.doesNotMatch(html, /data-directions-ship-jump/);
        const ship = await render({ partyJump: 2, partyShip: 'Kestrel Dawn' });
        assert.match(ship, /data-directions-ship-jump>Jump-2 is Kestrel Dawn’s jump\.</, 'the choice starts at the ship’s jump and says so');
        const fast = await render({ partyJump: 4, partyShip: 'Kestrel Dawn' });
        assert.match(fast, /<option value="4" selected>Jump-4<\/option>/, 'the ship’s jump is chosen when the panel opens');
    });
});
