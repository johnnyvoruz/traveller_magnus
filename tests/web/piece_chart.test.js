/**
 * "What's inside" draws the chart piece with the map's own renderer (streams/D.md D4). The pure part:
 * a published manifest becomes the renderer's sectors, one index per sector holding only the piece's
 * rows, the box the piece fills, and the camera that fits it at a zoom where names are written.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { hexCentre, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { PPP_GRID, PPP_NAMES } from '../../apps/web/src/map/tiers.ts';
import { pieceFrom, pieceIndex, pieceManifest, pieceRow, pieceView } from '../../apps/web/src/workspace/market/piece_chart.ts';

const OWN = '~BSQFZ0YRBXPW2MCRHA142TXGHX';
const ENTRY = { allegiance: '', bases: 'MS', ix: 0, name: 'Santiago Atitlan', partial: null, pbg: '', tradeCodes: ['Ni'], tree: 'abc', type: 'SYSTEM_PRESENT', uwp: 'C775411-7', zone: '' };
const CHART = { allegiance: 'ImDd', bases: 'NW', ix: 5, name: 'Efate', partial: null, pbg: '800', stars: 'F8 V', tradeCodes: ['Hi'], tree: 'def', type: 'SYSTEM_PRESENT', uwp: 'A646930-D', zone: '' };

test('a Build row (the summary\'s entry) and a chart row read as the same row', () => {
    const own = pieceRow({ baseHash: null, engineVersion: '1.2.0', entry: ENTRY, roll: 0 });
    assert.equal(own.name, 'Santiago Atitlan');
    assert.equal(own.uwp, 'C775411-7');
    assert.deepEqual(own.tradeCodes, ['Ni']);
    assert.equal(own.stars, undefined);
    const chart = pieceRow(CHART);
    assert.equal(chart.name, 'Efate');
    assert.equal(chart.stars, 'F8 V');
    assert.equal(pieceRow({ name: 'no type' }), null);
    assert.equal(pieceRow(null), null);
});

test('own sectors sit at their recorded slot, chart sectors at the truth\'s; a deleted hex is left out', () => {
    const manifest = {
        ownSectors: { [OWN]: { x: -8, y: -5 } },
        hexes: {
            [OWN + '/0101']: { summary: { entry: ENTRY } },
            [OWN + '/0102']: { deleted: true },
            'Spinward_Marches/1705': { summary: CHART },
            'Nowhere/0101': { summary: CHART },
        },
    };
    const piece = pieceFrom(manifest, (slug) => (slug === 'Spinward_Marches' ? { x: -4, y: -1, name: 'Spinward Marches' } : null));
    assert.equal(piece.count, 2, 'the deleted hex and the unplaced sector are left out');
    assert.deepEqual(piece.sectors.map((s) => [s.slug, s.x, s.y, s.canonical]), [[OWN, -8, -5, false], ['Spinward_Marches', -4, -1, true]]);
    assert.deepEqual(Object.keys(piece.rows.get(OWN)), ['0101']);
    // The box holds the two hexes' centres, at the map's places.
    const own = hexCentre(toGlobal(-8, -5, 1, 1).q, toGlobal(-8, -5, 1, 1).r);
    assert.ok(piece.box.x0 < own.x && piece.box.x1 > own.x && piece.box.y0 < own.y && piece.box.y1 > own.y);
});

test('the renderer\'s chart and indexes hold only the piece', () => {
    const piece = pieceFrom({ ownSectors: { [OWN]: { x: -8, y: -5 } }, hexes: { [OWN + '/0101']: { summary: { entry: ENTRY } } } }, () => null);
    const chart = pieceManifest(piece, 'v10');
    assert.deepEqual(chart.sectors.map((s) => [s.slug, s.x, s.y, s.canonical]), [[OWN, -8, -5, false]]);
    const index = pieceIndex(piece, OWN, 'v10');
    assert.deepEqual(Object.keys(index.hexes), ['0101']);
    assert.equal(index.hexes['0101'].name, 'Santiago Atitlan');
    assert.equal(pieceIndex(piece, 'Spinward_Marches', 'v10'), null);
});

test('the view fits the piece at the names zoom, comes down to fit, and never below the hex tier', () => {
    const small = { x0: 0, y0: 0, x1: 3, y1: 3 };
    const at = pieceView(small, 84, PPP_GRID, 400, 480, 14);
    assert.equal(at.cam.ppp, 84);
    assert.equal(at.width, 3 * 84 + 28);
    assert.equal(at.height, 3 * 84 + 28);
    assert.ok(at.cam.ppp >= PPP_NAMES, 'names are written');
    const tall = pieceView({ x0: 0, y0: 0, x1: 3, y1: 20 }, 84, PPP_GRID, 400, 480, 14);
    assert.equal(tall.height, 480);
    assert.ok(tall.cam.ppp < 84 && tall.cam.ppp >= PPP_GRID);
    const huge = pieceView({ x0: 0, y0: 0, x1: 300, y1: 300 }, 84, PPP_GRID, 400, 480, 14);
    assert.equal(huge.cam.ppp, PPP_GRID, 'cropped round its middle rather than drawn below the hex tier');
    assert.equal(huge.width, 400);
});

test('the product page draws the piece and keeps the outline for a manifest without rows', () => {
    const page = readFileSync(new URL('../../apps/web/src/workspace/market/ProductPage.vue', import.meta.url), 'utf8');
    assert.match(page, /<PieceChart\s+v-if="!pieceEmpty"/);
    assert.match(page, /<figure v-else-if="outline && outline\.points\.length" class="mk-shape">/);
    const chart = readFileSync(new URL('../../apps/web/src/workspace/market/PieceChart.vue', import.meta.url), 'utf8');
    assert.match(chart, /new MapRenderer\(el, readTheme\(el\)\)/);
    assert.match(chart, /<ul v-if="piece && !namesDrawn" class="mk-piece-list" aria-label="Systems">/);
});
