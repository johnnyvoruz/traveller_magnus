import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEX_SIZE, hexCentre, hexCorners } from '../../apps/web/src/map/geometry.ts';
import { outlineLoops } from '../../apps/web/src/map/outline.ts';
import { regionShapes, territoryShapes } from '../../apps/web/src/map/territory_layer.ts';

const INSET = HEX_SIZE * 0.1;
const COLOUR = '#336699';

/** Inset midpoint of one side. A joined outline must not keep this segment. */
function insetMid(q, r, side) {
    const centre = hexCentre(q, r);
    const corners = hexCorners(centre.x, centre.y);
    const x1 = corners[side * 2];
    const y1 = corners[side * 2 + 1];
    const next = ((side + 1) % 6) * 2;
    const x2 = corners[next];
    const y2 = corners[next + 1];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = centre.x - mx;
    const dy = centre.y - my;
    const len = Math.hypot(dx, dy);
    return { x: mx + (dx / len) * INSET, y: my + (dy / len) * INSET };
}

function hasSegmentAt(loops, x, y) {
    for (const loop of loops) {
        const pts = loop.points;
        const n = pts.length;
        for (let i = 0; i < n; i += 2) {
            const j = (i + 2) % n;
            const mx = (pts[i] + pts[j]) / 2;
            const my = (pts[i + 1] + pts[j + 1]) / 2;
            if (Math.hypot(mx - x, my - y) < 1e-6) return true;
        }
    }
    return false;
}

test('territories and regions join across a sector edge and skip a missing field', () => {
    const left = { x: 0, y: 0, territories: [{ name: 'Imperium', color: COLOUR, hexes: ['3201'] }] };
    const right = { x: 1, y: 0, territories: [{ name: 'Imperium', color: COLOUR, hexes: ['0101'] }] };
    const joined = territoryShapes([left, right]);
    assert.equal(joined.length, 1);
    assert.equal(joined[0].color, COLOUR);
    assert.equal(joined[0].loops.length, 1);
    assert.equal(joined[0].loops[0].points.length, 20);
    const towardLeft = insetMid(31, 0, 5);
    const towardRight = insetMid(32, 0, 2);
    assert.equal(hasSegmentAt(outlineLoops([{ q: 31, r: 0 }]), towardLeft.x, towardLeft.y), true);
    assert.equal(hasSegmentAt(joined[0].loops, towardLeft.x, towardLeft.y), false);
    assert.equal(hasSegmentAt(joined[0].loops, towardRight.x, towardRight.y), false);

    const other = { x: 1, y: 0, territories: [{ name: 'Other', color: COLOUR, hexes: ['0101'] }] };
    assert.equal(territoryShapes([left, other]).length, 2);

    const otherColour = { x: 1, y: 0, territories: [{ name: 'Imperium', color: '#99aabb', hexes: ['0101'] }] };
    assert.equal(territoryShapes([left, otherColour]).length, 2);

    assert.deepEqual(territoryShapes([{}]), []);
    assert.deepEqual(regionShapes([{}]), []);

    const regionLeft = { x: 0, y: 0, regions: [{ name: 'Rift', color: COLOUR, hexes: ['3201'] }] };
    const regionRight = { x: 1, y: 0, regions: [{ name: 'Rift', color: COLOUR, hexes: ['0101'] }] };
    const regions = regionShapes([regionLeft, regionRight]);
    assert.equal(regions.length, 1);
    assert.equal(regions[0].loops.length, 1);
    assert.equal(regions[0].loops[0].points.length, 20);
    assert.equal(hasSegmentAt(regions[0].loops, towardLeft.x, towardLeft.y), false);
});
