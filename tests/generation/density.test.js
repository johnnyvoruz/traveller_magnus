import assert from 'node:assert/strict';
import test from 'node:test';
import { densityKeeps } from '@voyage/generation';
import { BuilderGenerate } from '@voyage/shared';

const SEED = 'TravellerMagnus';

function subsector() {
    const keys = [];
    for (let column = 1; column <= 8; column += 1) {
        for (let row = 1; row <= 10; row += 1) {
            keys.push(`blank/${String(column).padStart(2, '0')}${String(row).padStart(2, '0')}`);
        }
    }
    return keys;
}

function kept(density, keys = subsector()) {
    return keys.filter((hexKey) => densityKeeps({
        universeSeed: SEED,
        hexKey,
        density,
        alone: false,
        holds: false,
        filledToo: false,
    }) === 'write');
}

test('absent density is every, and the three chances leave a subsector partly empty', () => {
    const parsed = BuilderGenerate.parse({
        hexKeys: ['blank/0101', 'blank/0102'],
        edition: 'MgT2E',
        generator: 'top-down',
    });
    assert.equal(parsed.density, 'every');
    const keys = subsector();
    assert.equal(keys.length, 80);
    assert.equal(kept('every', keys).length, 80);
    for (const density of ['sparse', 'standard', 'dense']) {
        const first = kept(density, keys);
        const second = kept(density, keys);
        assert.deepEqual(second, first);
        assert.ok(first.length < 80, density);
        assert.ok(first.length > 0, density);
    }
});

test('one hex is written, a held hex is skipped, and filledToo does not roll', () => {
    const hexKey = subsector().find((key) => densityKeeps({
        universeSeed: SEED,
        hexKey: key,
        density: 'sparse',
        alone: false,
        holds: false,
        filledToo: false,
    }) === 'empty');
    assert.ok(hexKey);
    assert.equal(densityKeeps({
        universeSeed: SEED, hexKey, density: 'sparse', alone: true, holds: false, filledToo: false,
    }), 'write');
    assert.equal(densityKeeps({
        universeSeed: SEED, hexKey, density: 'sparse', alone: false, holds: true, filledToo: false,
    }), 'skip');
    assert.equal(densityKeeps({
        universeSeed: SEED, hexKey, density: 'sparse', alone: false, holds: true, filledToo: true,
    }), 'write');
});
