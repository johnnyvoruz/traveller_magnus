// Hover hit-test for the surface map. Geometry only: the sheet painters are not involved.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SHEET_LAYOUT, sheetPoint } from '../../apps/web/src/surface/hybrid/field.ts';
import { gridOf } from '../../apps/web/src/surface/hybrid/grid.ts';
import { hybridHit, hybridOutline, insideDiamond, queueHover, vanillaHit } from '../../apps/web/src/surface/hover_hex.ts';

function contains(ring, x, y) {
    let crossings = 0;
    for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if ((a[1] > y) !== (b[1] > y)) {
            const xAt = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
            if (x < xAt) crossings += 1;
        }
    }
    return crossings % 2 === 1;
}

describe('surface hex hover', () => {
    test('an interior hybrid hex hits its centre and outlines six corners', () => {
        const grid = gridOf(4);
        const layout = SHEET_LAYOUT;
        let id = -1;
        for (let i = 0; i < grid.count; i += 1) {
            if (grid.nb[i].length === 6 && grid.row[i] > 2 && grid.row[i] < 10) {
                id = i;
                break;
            }
        }
        assert.ok(id >= 0);
        const [x, y] = sheetPoint(layout, grid.P[id]);
        assert.equal(hybridHit(grid, layout, x, y), id);
        const step = layout.side / grid.n;
        assert.equal(hybridHit(grid, layout, x + step * 0.3, y), id);
        assert.notEqual(hybridHit(grid, layout, x + step * 0.9, y), id);
        const ring = hybridOutline(grid, layout, id);
        assert.equal(ring.length, 6);
        assert.equal(contains(ring, x, y), true);
        const reach = step / Math.sqrt(3) * 1.4;
        for (const p of ring) assert.ok(Math.hypot(p[0] - x, p[1] - y) < reach);
    });

    test('a pentagon corner still closes', () => {
        const grid = gridOf(4);
        let id = -1;
        for (let i = 0; i < grid.count; i += 1) {
            if (grid.nb[i].length === 5) {
                id = i;
                break;
            }
        }
        const ring = hybridOutline(grid, SHEET_LAYOUT, id);
        assert.equal(ring.length, 5);
        const [x, y] = sheetPoint(SHEET_LAYOUT, grid.P[id]);
        assert.equal(contains(ring, x, y), true);
    });

    test('a point off the sheet hits nothing', () => {
        assert.equal(hybridHit(gridOf(2), SHEET_LAYOUT, -40, -40), null);
        assert.equal(hybridOutline(gridOf(2), SHEET_LAYOUT, -1).length, 0);
    });

    test('a vanilla hex hits its own centre and misses the sheet corner', () => {
        const W = 800;
        const H = 400;
        const size = 8;
        const lobes = 5;
        const mid = vanillaHit(W / 2, H / 2, W, H, size, lobes);
        assert.ok(mid);
        assert.equal(mid.ring.length, 6);
        const again = vanillaHit(mid.cx, mid.cy, W, H, size, lobes);
        assert.equal(again.row, mid.row);
        assert.equal(again.col, mid.col);
        assert.equal(contains(mid.ring, mid.cx, mid.cy), true);
        assert.equal(vanillaHit(80, 2, W, H, size, lobes), null);
        assert.equal(insideDiamond(80, 2, W, H, lobes), false);
        assert.equal(insideDiamond(W / 2, H / 2, W, H, lobes), true);
        assert.equal(vanillaHit(W / 2, H / 2, W, H, 0, lobes), null);
    });

    test('a second pointer in the same frame does not run a second hit-test', () => {
        const slot = { point: null, open: false };
        const ran = [];
        let frame = null;
        const request = (fn) => {
            frame = fn;
        };
        queueHover(slot, { x: 1 }, request, (point) => ran.push(point));
        queueHover(slot, { x: 2 }, request, (point) => ran.push(point));
        assert.equal(ran.length, 0);
        assert.equal(typeof frame, 'function');
        frame();
        assert.deepEqual(ran, [{ x: 2 }]);
        queueHover(slot, { x: 3 }, request, (point) => ran.push(point));
        frame();
        assert.deepEqual(ran, [{ x: 2 }, { x: 3 }]);
    });
});
