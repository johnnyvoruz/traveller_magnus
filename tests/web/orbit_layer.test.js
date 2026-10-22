/**
 * AQ1 round 2. An empty picture layer, and belt paths drawn around a host.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyLayer, hostedBeltPaths } from '../../apps/web/src/orbit/picture.ts';

test('an empty layer has an empty list in every slot', () => {
    const layer = emptyLayer();
    assert.deepEqual(layer, { bands: [], panels: [], jumps: [], paths: [], rocks: [], worlds: [] });
    layer.worlds.push({});
    assert.equal(emptyLayer().worlds.length, 0);
});

test('a belt closer than 2 is left out; a wider belt is a path on the host', () => {
    assert.deepEqual(hostedBeltPaths({ x: 4, y: 5 }), []);
    const paths = hostedBeltPaths({
        x: 4,
        y: 5,
        hostedBelts: [
            { key: 'near', r: 1.5, angle: 0, main: false, name: 'Dust' },
            { key: 'wide', r: 8, angle: 0.5, main: true, name: 'The Belt' },
        ],
    });
    assert.equal(paths.length, 1);
    assert.equal(paths[0].key, 'wide');
    assert.equal(paths[0].cx, 4);
    assert.equal(paths[0].cy, 5);
    assert.equal(paths[0].r, 8);
    assert.equal(paths[0].style, 'belt');
    assert.equal(paths[0].main, 'The Belt');
    assert.equal(paths[0].phase, -4);
});
