/**
 * AQ1 round 2. The mainworld is the world or moon whose type is Mainworld. A star is not one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mainworldByKey } from '../../apps/web/src/orbit/bodies.ts';

test('no mainworld is null; a world or a moon marked Mainworld is the one; a star is not', () => {
    assert.equal(mainworldByKey({ stars: [], worlds: [] }), null);
    assert.equal(mainworldByKey({ stars: [{ type: 'Mainworld', name: 'Sol' }], worlds: [] }), null);
    const planet = { type: 'Planet', name: 'Rock' };
    assert.equal(mainworldByKey({ stars: [], worlds: [planet, { type: 'Empty' }] }), null);
    const world = { type: 'Mainworld', name: 'Regina' };
    const found = mainworldByKey({ stars: [{}], worlds: [planet, world] });
    assert.equal(found.body, world);
    assert.match(found.key, /^w/);
    const moon = { type: 'Mainworld', name: 'Luna' };
    const ofMoon = mainworldByKey({ stars: [], worlds: [{ type: 'Planet', moons: [{ type: 'Empty' }, moon] }] });
    assert.equal(ofMoon.body, moon);
    assert.match(ofMoon.key, /m/);
});
