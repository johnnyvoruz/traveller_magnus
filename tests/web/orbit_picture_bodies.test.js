/**
 * AQ1 round 3. Bodies on a picture, in paint order, with the mainworld flagged.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pictureBodies } from '../../apps/web/src/orbit/ships.ts';

function picture(over = {}) {
    return { stars: [], layers: [], ...over };
}

test('an empty picture has no bodies', () => {
    assert.deepEqual(pictureBodies(picture()), []);
});

test('stars come first, then each layer\'s worlds and moons; a belt mainworld is flagged', () => {
    const at = pictureBodies(picture({
        stars: [
            { star: { key: 'sun' }, x: 0, y: 0 },
            { star: { key: 'far' }, x: 40, y: 0 },
        ],
        layers: [
            {
                worlds: [{
                    world: { key: 'regina', mainworld: true, mainworldBelt: false },
                    x: 5, y: 6,
                    moons: [{ moon: { key: 'luna', mainworld: true }, x: 7, y: 8 }],
                }],
            },
            {
                worlds: [{
                    world: { key: 'belt', mainworld: false, mainworldBelt: true },
                    x: 9, y: 1,
                    moons: [],
                }],
            },
        ],
    }));
    assert.deepEqual(at.map((item) => [item.key, item.main]), [
        ['sun', false],
        ['far', false],
        ['regina', true],
        ['luna', true],
        ['belt', true],
    ]);
    assert.equal(at.find((item) => item.key === 'regina').x, 5);
    assert.equal(at.find((item) => item.key === 'luna').y, 8);
});
