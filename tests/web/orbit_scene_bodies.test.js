/**
 * AQ1 round 3. A laid-out scene becomes the body list an anchor looks up.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sceneBodies } from '../../apps/web/src/orbit/ship_marks.ts';

function scene(over = {}) {
    return {
        originX: 0,
        originY: 0,
        band: { cx: 0, cy: 0, inner: 1, outer: 2, label: '' },
        jumps: [],
        companions: [],
        primary: null,
        stars: [],
        hits: [],
        ...over,
    };
}

function body(key, x, y, worldOver = {}) {
    return {
        world: { key, mainworld: false, mainworldBelt: false, ...worldOver },
        x, y, r: 2, moons: [], hostedBelts: [], rings: [], starX: 0, starY: 0,
    };
}

test('no stars and no worlds is an empty list; a companion with no set is skipped', () => {
    assert.deepEqual(sceneBodies(scene()), []);
    const at = sceneBodies(scene({
        stars: [{ star: { key: 'sun' }, x: 1, y: 2 }],
        companions: [{ at: { star: { key: 'far' }, x: 9, y: 9 }, band: null, set: null }],
    }));
    assert.deepEqual(at, [{ key: 'sun', x: 1, y: 2, main: false }]);
});

test('stars, then each world and its moons; a belt mainworld is flagged', () => {
    const primary = {
        cx: 0, cy: 0, belts: [], orbits: [],
        bodies: [
            {
                ...body('regina', 5, 6, { mainworld: true }),
                moons: [{ moon: { key: 'luna', mainworld: false }, x: 7, y: 8 }],
            },
            body('belt', 3, 4, { mainworldBelt: true }),
        ],
    };
    const at = sceneBodies(scene({
        stars: [{ star: { key: 'sun' }, x: 0, y: 0 }],
        primary,
        companions: [{
            at: { star: { key: 'companion' }, x: 30, y: 0 },
            band: null,
            set: { cx: 30, cy: 0, belts: [], orbits: [], bodies: [body('far', 31, 1)] },
        }],
    }));
    assert.deepEqual(at.map((item) => item.key), ['sun', 'regina', 'luna', 'belt', 'far']);
    assert.equal(at.find((item) => item.key === 'regina').main, true);
    assert.equal(at.find((item) => item.key === 'belt').main, true);
    assert.equal(at.find((item) => item.key === 'luna').main, false);
    assert.equal(at.find((item) => item.key === 'far').main, false);
});
