/**
 * DU2 (UX backlog U2): the jump-range ring. With a party ship's record open, the hexes within its jump
 * number (typed on its sheet as Jump Drive Output; one parsec a jump number, from the rules file) of
 * where it is, on a layer of their own.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { jumpNumberOf, jumpParsecs, jumpRing, ringHexes, ringOutline } from '../../apps/web/src/map/jump_ring.ts';
import { hexDistance } from '../../apps/web/src/map/geometry.ts';

test('the jump number is what was typed on the sheet, a whole number from 1 to 9', () => {
    assert.equal(jumpNumberOf({ 'Jump Drive Output': '2' }), 2);
    assert.equal(jumpNumberOf({ 'Jump Drive Output': 'J-3' }), 3);
    assert.equal(jumpNumberOf({ 'Jump Drive Output': 'Jump-1' }), 1);
    assert.equal(jumpNumberOf({ 'Jump Drive Output': '' }), null);
    assert.equal(jumpNumberOf({ 'Jump Drive Output': 'none' }), null);
    assert.equal(jumpNumberOf({ 'Jump Drive Output': '0' }), null);
    assert.equal(jumpNumberOf({}), null);
    assert.equal(jumpNumberOf(null), null);
});

test('a jump number carries the rules file\'s parsecs; the ring is every hex within them', () => {
    const rules = JSON.parse(fs.readFileSync(new URL('../../rules/mgt2e_space_travel.json', import.meta.url), 'utf8'));
    assert.equal(jumpParsecs(2), 2 * rules.jump.parsecsPerJumpNumber);
    const centre = { q: 20, r: 10 };
    for (const [n, count] of [[0, 1], [1, 7], [2, 19], [3, 37]]) {
        const hexes = ringHexes(centre, n);
        assert.equal(hexes.length, count, 'jump ' + n);
        assert.ok(hexes.every((hex) => hexDistance(centre, hex) <= n));
    }
    // Odd and even columns alike.
    assert.equal(ringHexes({ q: 21, r: 10 }, 2).length, 19);
});

test('the outline is the outer edge only: six sides for one hex, eighteen for a jump-1 ring', () => {
    assert.equal(ringOutline([{ q: 4, r: 4 }]).length, 6);
    assert.equal(ringOutline(ringHexes({ q: 4, r: 4 }, 1)).length, 18);
    const ring = jumpRing({ q: 4, r: 4 }, 2);
    assert.equal(ring.hexes.length, 19);
    assert.equal(ring.outline.length, 30);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the map view draws it on its own canvas, only for a party ship with a jump number, every frame it draws', () => {
    const view = fs.readFileSync(path.join(root, 'apps/web/src/views/MapView.vue'), 'utf8');
    assert.match(view, /<canvas ref="ringEl" class="jump-ring" aria-hidden="true"><\/canvas>/);
    assert.match(view, /if \(!ship \|\| ship\.deleted \|\| ship\.type !== 'vessel' \|\| !party \|\| !party\.vesselIds\.includes\(ship\.id\)\) return null;/);
    assert.match(view, /const jump = jumpNumberOf\(fieldsOf\(ship\.sheet\)\);/);
    assert.match(view, /if \(ringLayer\) ringLayer\.draw\(cam, viewport\(\), shownRing\.value, ringInk\);/);
    assert.match(view, /\.map > canvas\.jump-ring \{\s+pointer-events: none;/);
});
