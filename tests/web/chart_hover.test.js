/**
 * DF8 (Johnny 20:20): zoomed out, the mouse over something a click opens shows it, with a ring, a data
 * block and the pointer cursor. The world under the pointer is found by the click's own rule; tested per
 * tier with a fixture sector. The map view asks in the click's order and never fetches for a hover.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { toScreen } from '../../apps/web/src/map/camera.ts';
import { hexCentre, SECTOR_ROWS, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { RING_MIN, worldUnder, worldRing } from '../../apps/web/src/map/hover_hit.ts';

const vp = { width: 1000, height: 800 };
// One sector at (0, 0) of the grid, "Fixture Reach", with one world at 1910, named only when loaded.
const cells = (() => { const out = Array(32 * SECTOR_ROWS).fill('.'); out[(19 - 1) * SECTOR_ROWS + (10 - 1)] = 'x'; return out.join(''); })();
const sources = (named = false) => ({
    sectorAt: (sx, sy) => (sx === 0 && sy === 0 ? { slug: 'Fixture_Reach', name: 'Fixture Reach' } : null),
    cells: (slug) => (slug === 'Fixture_Reach' ? cells : null),
    name: (slug, hhhh) => (named && slug === 'Fixture_Reach' && hhhh === '1910' ? 'Regina' : null),
});
const g = toGlobal(0, 0, 19, 10);
const world = hexCentre(g.q, g.r);
const camAt = (ppp) => ({ x: world.x, y: world.y, ppp });

test('the galaxy tier: the hex under the mouse holds a world, so it is ringed and said', () => {
    const cam = camAt(2);
    const at = toScreen(cam, vp, world.x, world.y);
    const hit = worldUnder(at.sx, at.sy, cam, vp, sources());
    assert.ok(hit);
    assert.equal(hit.hhhh, '1910');
    assert.equal(hit.r, RING_MIN, 'a 1 px dot still gets a ring that can be seen');
    assert.equal(hit.title, 'Fixture Reach 1910', 'no name loaded: the sector and hex');
    assert.equal(hit.line, 'Select to open its system');
    assert.ok(Math.abs(hit.x - at.sx) < 0.01 && Math.abs(hit.y - at.sy) < 0.01, 'the ring is on the world');
});

test('the dots tier: the name where it is loaded, the place under it', () => {
    const cam = camAt(12);
    const at = toScreen(cam, vp, world.x, world.y);
    const hit = worldUnder(at.sx + 2, at.sy - 2, cam, vp, sources(true));
    assert.ok(hit);
    assert.equal(hit.title, 'Regina');
    assert.equal(hit.line, 'Fixture Reach 1910');
    assert.equal(hit.r, worldRing(12));
});

test('nothing to open: an empty hex, outside every sector, or the hex tier (it has its own marks)', () => {
    const cam = camAt(12);
    const at = toScreen(cam, vp, world.x, world.y);
    assert.equal(worldUnder(at.sx + 40, at.sy, cam, vp, sources()), null, 'the hex beside it is empty');
    assert.equal(worldUnder(at.sx, at.sy, cam, vp, { ...sources(), sectorAt: () => null }), null);
    assert.equal(worldUnder(at.sx, at.sy, camAt(40), vp, sources()), null);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const view = fs.readFileSync(path.join(root, 'apps/web/src/views/MapView.vue'), 'utf8');

test('the map view asks in the click\'s order, once a frame, on its own layer, never on touch', () => {
    const body = view.slice(view.indexOf('function chartHoverMark(): ChartHoverMark | null {'));
    const order = ['renderer.trackAt(at.x, at.y)', 'renderer.partyAt(at.x, at.y)', 'renderer.vesselAt(at.x, at.y)', 'return worldUnder('];
    let last = -1;
    for (const step of order) {
        const at = body.indexOf(step);
        assert.ok(at > last, step);
        last = at;
    }
    assert.match(view, /if \(!renderer \|\| !at \|\| chartPanning \|\| picking\.value \|\| buildReady\(\) \|\| tierFor\(cam\.ppp\) === 'hex'\) return null;/);
    assert.match(view, /if \(chartHoverFrame\) return;\s+chartHoverFrame = nextFrame\(paintChartHover\);/);
    assert.match(view, /<ChartHover ref="chartHoverEl" \/>/);
    // A finger gives no pointerAt (onPointerHover), so a tap behaves as before.
    assert.match(view, /const point = event\.pointerType === 'touch' \? null : canvasPoint\(event\);/);
    // The words are what is loaded: the index from the cache, the far labels; no fetch.
    const sources = view.slice(view.indexOf('const hoverSources: HoverSources = {'), view.indexOf('function placeAt('));
    assert.doesNotMatch(sources, /fetch|want\(|\.manifest\(/);
});
