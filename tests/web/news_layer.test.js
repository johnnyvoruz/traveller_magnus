/**
 * XD1 (spec_xboat_ripples.md §3.2, §3.3, §5 D1): how fast news travels, the layer and the scrubber.
 * The frame a scrubbed day shows is pure: which systems are lit and how brightly, which X-boat lines the
 * news has run along and how far. The map view runs Lane A's arrivals and draws the frame on its own canvas.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ageAlpha, edgeProgress, rippleFrame } from '../../apps/web/src/map/news_layer.ts';
import { hexCentre } from '../../apps/web/src/map/geometry.ts';

test('a line fills from the nearer system to the farther as the days pass', () => {
    assert.equal(edgeProgress(0, 7, -1), 0);
    assert.equal(edgeProgress(0, 7, 0), 0);
    assert.equal(edgeProgress(0, 7, 3.5), 0.5);
    assert.equal(edgeProgress(0, 7, 7), 1);
    assert.equal(edgeProgress(0, 7, 30), 1);
    assert.equal(edgeProgress(5, 5, 5), 1, 'no length: arrived at once');
});

test('fresh news is bright, old news faint', () => {
    assert.equal(ageAlpha(0, 60), 0.95);
    assert.ok(Math.abs(ageAlpha(30, 60) - 0.65) < 1e-9);
    assert.ok(Math.abs(ageAlpha(60, 60) - 0.35) < 1e-9);
    assert.ok(Math.abs(ageAlpha(600, 60) - 0.35) < 1e-9);
});

// Three systems in a row on X-boat lines: A (the source), B a jump on, C a jump past B.
const node = (key, q, r) => ({ key, slug: 'Fixture', hex: key, q, r, loaded: true });
const graph = {
    nodes: [node('A', 10, 10), node('B', 12, 10), node('C', 14, 10)],
    // CSR: A↔B, B↔C, both X-boat (kind 0).
    offsets: new Uint32Array([0, 1, 3, 4]),
    targets: new Uint32Array([1, 0, 2, 1]),
    kinds: new Uint8Array([0, 0, 0, 0]),
    weights: new Float32Array([7, 7, 7, 7]),
    xboatEdges: 2,
    offEdges: 0,
};
const arrivals = new Map([
    ['A', { earliest: 0, likely: 0, latest: 0 }],
    ['B', { earliest: 6.4, likely: 7, latest: 7.7 }],
    ['C', { earliest: 12.8, likely: 14, latest: 15.3 }],
]);
const ripple = { source: 'A', day0: 403000, horizonDays: 60, graph, arrivals };

test('day 0: the source alone, and nothing run along a line yet', () => {
    const frame = rippleFrame(ripple, 0);
    assert.deepEqual(frame.discs.map((disc) => disc.key), ['A']);
    assert.equal(frame.discs[0].alpha, 0.95);
    assert.deepEqual(frame.lines, []);
});

test('mid-way: a line part-run, a system it may have reached at half strength, a line run whole', () => {
    const half = rippleFrame(ripple, 3.5);
    assert.equal(half.lines.length, 1);
    const a = hexCentre(10, 10);
    const b = hexCentre(12, 10);
    assert.ok(Math.abs(half.lines[0].x2 - (a.x + (b.x - a.x) * 0.5)) < 1e-9, 'half way to B');
    assert.equal(half.lines[0].whole, false);
    const maybe = rippleFrame(ripple, 6.8);
    const atB = maybe.discs.find((disc) => disc.key === 'B');
    assert.ok(atB && atB.maybe, 'earliest has passed, latest has not');
    assert.ok(Math.abs(atB.alpha - 0.95 / 2) < 1e-9);
    const later = rippleFrame(ripple, 10);
    const ab = later.lines.find((line) => line.whole);
    assert.ok(ab, 'A to B is run whole');
    assert.equal(later.discs.find((disc) => disc.key === 'B').maybe, false);
    assert.equal(later.lines.length, 2, 'and B to C is under way');
    assert.equal(later.discs.some((disc) => disc.key === 'C'), false, 'C not yet');
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the map view: the command needs a system; the layer is its own canvas; play is off with reduced motion', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /id: 'news-from-here',\s+name: 'How fast does news travel from here',\s+runnable: \(\) => newsSource\(\) !== null,/);
    assert.match(view, /if \(!selected \|\| !chart \|\| !version\) return null;\s+return systemSource\(selected\.slug, selected\.hhhh\);/);
    assert.match(view, /if \(!row\) return null;\s+return \{ key: slug \+ '\/' \+ hhhh/);
    assert.match(view, /<canvas ref="newsEl" class="news-layer" aria-hidden="true"><\/canvas>/);
    assert.match(view, /if \(newsLayer\) newsLayer\.draw\(cam, viewport\(\), ripple && news\.value \? frameFor\(ripple, news\.value\.t\) : null, newsInk, newsHoverNow\(\)\);/);
    assert.match(view, /const canPlayNews = !prefersReducedMotion\(\);/);
    assert.match(view, /if \(newsSlugs\.length \+ more\.length >= NEWS_PARAMS\.sectorCap\)/);
    const scrubber = read('map/NewsScrubber.vue');
    assert.match(scrubber, /<button\s+v-if="canPlay"/);
    assert.match(scrubber, /The map shows this news as far as nine sectors\./);
    const tokens = read('design/tokens.css');
    assert.match(tokens, /--chart-news: #[0-9a-fA-F]{6};/);
    assert.match(tokens, /--t-ripple: \d+ms;/);
});
