/**
 * XD2 (spec_xboat_ripples.md §3.4, §3.5, §5 D2): the hover's sentence, the reverse, and where the
 * two buttons are. The sentences are pure over a ripple; the buttons run the map's commands, so
 * they show only where the map has registered them.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { frameFor, newsHoverWords, nodeAt, reverseFrame } from '../../apps/web/src/map/news_layer.ts';
import { hexCentre } from '../../apps/web/src/map/geometry.ts';

// Three systems in a row on X-boat lines and a fourth off them: A (the source), B a jump on, C past B, D alone.
const node = (key, q, r) => ({ key, slug: 'Fixture', hex: key, q, r, loaded: true });
const graph = {
    nodes: [node('A', 10, 10), node('B', 12, 10), node('C', 14, 10), node('D', 30, 30)],
    offsets: new Uint32Array([0, 1, 3, 4, 4]),
    targets: new Uint32Array([1, 0, 2, 1]),
    kinds: new Uint8Array([0, 0, 0, 0]),
    weights: new Float32Array([7, 7, 7, 7]),
    xboatEdges: 2,
    offEdges: 0,
};
const arrivals = new Map([
    ['A', { earliest: 0, likely: 0, latest: 0 }],
    ['B', { earliest: 16.4, likely: 18.2, latest: 21.9 }],
    ['C', { earliest: 32.8, likely: 36.4, latest: 43.8 }],
]);
// Day 123 of 1105 is 123-1105; 18 days on is 141-1105, the spec's own example.
const day0 = 1105 * 365 + 122;
const from = { source: 'A', mode: 'from', day0, horizonDays: 60, graph, arrivals };
const names = (here) => ({ source: 'Regina', here });

test('reached: the date it arrives, the days, and the earliest and latest', () => {
    assert.equal(newsHoverWords(from, 'B', names('Jenghe')), 'News from Regina arrives here on 141-1105, 18 days later. Earliest 16, latest 21.');
});

test('unreached within the horizon, and the source itself', () => {
    assert.equal(newsHoverWords(from, 'D', names('Mora')), 'News from Regina has not reached here by day 60.');
    assert.equal(newsHoverWords(from, 'A', names('Regina')), 'News starts at Regina on 123-1105.');
});

test('reverse: how long news from here takes to reach the party', () => {
    const to = { ...from, mode: 'to' };
    assert.equal(newsHoverWords(to, 'B', { source: 'Regina', here: 'Mora' }), 'News from Mora reaches Regina in 18 days.');
    assert.equal(newsHoverWords(to, 'D', { source: 'Regina', here: 'Lysen' }), 'News from Lysen has not reached Regina by day 60.');
    assert.equal(newsHoverWords(to, 'A', { source: 'Regina', here: 'Regina' }), 'The party is here, at Regina.');
    const single = new Map([['A', { earliest: 0, likely: 0, latest: 0 }], ['B', { earliest: 1, likely: 1.5, latest: 2 }]]);
    assert.equal(newsHoverWords({ ...to, arrivals: single }, 'B', { source: 'Regina', here: 'Mora' }), 'News from Mora reaches Regina in 1 day.');
});

test('reverse draws everything within the horizon at once: fresh bright, old faint, every line whole', () => {
    const to = { ...from, mode: 'to' };
    const frame = reverseFrame(to);
    assert.deepEqual(frame.discs.map((disc) => disc.key), ['A', 'B', 'C']);
    assert.ok(frame.discs[0].alpha > frame.discs[1].alpha && frame.discs[1].alpha > frame.discs[2].alpha);
    assert.equal(frame.lines.length, 2);
    assert.ok(frame.lines.every((line) => line.whole));
    assert.deepEqual(frameFor(to, 0), frame, 'the scrubbed day does not matter in reverse');
    assert.equal(frameFor(from, 0).discs.length, 1, 'forwards, it does');
});

test('the hover finds a system by its hex, and nothing on an empty one', () => {
    const hit = nodeAt(from, 12, 10);
    assert.equal(hit.key, 'B');
    assert.deepEqual({ x: hit.x, y: hit.y }, hexCentre(12, 10));
    assert.equal(nodeAt(from, 11, 10), null);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the buttons: News beside Orbits on a system, the reverse on the party block, both through the map', () => {
    const dossier = read('dossier/DossierPanel.vue');
    // In the actions shown only with a body of a system (profile), and only where the map registered the command.
    assert.match(dossier, /<template v-if="profile && !drafting && !orbit && !preview" #actions>\s+<button v-if="newsOffered"[^>]*data-command="news-from-here"[^>]*>\s+<Icon name="radar" :size="13" \/>News\s+<\/button>\s+<button[^>]*class="ui-btn doss-orbits"/);
    const where = read('workspace/WhereBlock.vue');
    assert.match(where, /v-if="place && locateId === 'party' && newsToOffered"/);
    assert.match(where, /How old is the news here/);
    const view = read('views/MapView.vue');
    assert.match(view, /id: 'news-to-party',\s+name: 'How old is the news here',\s+runnable: \(\) => partyNewsSource\(\) !== null,/);
    assert.match(view, /if \(ripple && pressKind === 'touch'\) \{\s+newsPinned = newsKeyAt/);
    const scrubber = read('map/NewsScrubber.vue');
    assert.match(scrubber, /<section v-if="reverse"[^>]*data-news-legend/);
    assert.match(scrubber, /Age of the news at/);
    assert.match(scrubber, /Arrived/);
    assert.match(scrubber, /\{\{ horizonDays \}\} days later/);
});
