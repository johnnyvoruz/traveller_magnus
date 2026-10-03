import test from 'node:test';
import assert from 'node:assert/strict';
import { parseT5Tab } from '@voyage/shared';
import { placeCompanionOrbits, roll1D, setRandomSeed } from '@voyage/engines';
import { TSV } from '../golden/cases.js';
import { withEngineRng } from '../golden/rng_lock.js';

function reversedRows(tsv) {
    const lines = tsv.split(/\r?\n/).filter(line => line.length > 0);
    return [lines[0], ...lines.slice(1).reverse()].join('\n');
}

test('parser emits null companion orbits and placement ignores row order', async () => {
    await withEngineRng(async () => {
        const forward = parseT5Tab(TSV);
        const backward = parseT5Tab(reversedRows(TSV));
        const regina = forward.get('1910').t5System.stars;
        assert.equal(regina[0].role, 'Primary');
        assert.equal(regina[0].orbitID, 0);
        assert.ok(regina.slice(1).every(star => star.orbitID === null));

        setRandomSeed('TravellerMagnus');
        const stream = [roll1D(), roll1D(), roll1D(), roll1D()];
        setRandomSeed('TravellerMagnus');

        const hexKey = 'Spinward_Marches/1910';
        const fromForward = structuredClone(forward.get('1910').t5System.stars);
        const fromBackward = structuredClone(backward.get('1910').t5System.stars);
        placeCompanionOrbits(structuredClone(forward.get('1912').t5System.stars), 'Spinward_Marches/1912');
        placeCompanionOrbits(fromForward, hexKey);
        placeCompanionOrbits(fromBackward, hexKey);
        assert.deepEqual(fromForward, fromBackward);
        assert.equal(fromForward[0].orbitID, 0);
        assert.equal(typeof fromForward[1].orbitID, 'number');
        assert.ok(fromForward[1].orbitID >= 0 && fromForward[1].orbitID <= 5);
        assert.ok(fromForward[2].orbitID >= 6 && fromForward[2].orbitID <= 11);

        const again = structuredClone(forward.get('1910').t5System.stars);
        placeCompanionOrbits(again, hexKey);
        assert.deepEqual(again, fromForward);
        assert.deepEqual([roll1D(), roll1D(), roll1D(), roll1D()], stream);
    });
});
