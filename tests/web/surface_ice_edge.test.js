import assert from 'node:assert/strict';
import test from 'node:test';
import { capHasCoast, capNoise, capShiftRad, edgeTemp } from '../../apps/web/src/surface/ice_edge.ts';

test('a cap edge is seeded, retreats over sea, and reaches over high land', () => {
    const seed = 0x51ce;
    const a = capNoise(0.2, 0.9, -0.1, seed);
    const b = capNoise(0.2, 0.9, -0.1, seed);
    assert.equal(a, b);
    assert.ok(Math.abs(a) <= 1, 'noise ' + a);
    assert.notEqual(capNoise(0.2, 0.9, -0.1, seed), capNoise(-0.4, 0.2, 0.8, seed));

    const sea = capShiftRad(0, true, 0, true);
    const land = capShiftRad(0, false, 1, true);
    const dry = capShiftRad(0, true, 0, false);
    assert.ok(sea < 0, 'open sea pulls the cap back');
    assert.ok(land > 0, 'high land carries the cap further');
    assert.equal(dry, 0, 'a water world with no land keeps a zero-mean edge');
    assert.equal(capHasCoast(1), false);
    assert.equal(capHasCoast(0), false);
    assert.equal(capHasCoast(0.5), true);
});

test('the ice nudge fades away from the melting line and a frozen world is untouched', () => {
    const atEdge = edgeTemp(273, 273, 1, false, 1, true, 'normal');
    const deep = edgeTemp(200, 273, 1, false, 1, true, 'normal');
    const warm = edgeTemp(320, 273, -1, true, 0, true, 'normal');
    const frozen = edgeTemp(200, 273, 1, true, 0, true, 'frozen');
    assert.ok(atEdge < 273, 'high land at the line is colder: ' + atEdge);
    assert.equal(deep, 200, 'the interior of the cap stays put');
    assert.equal(warm, 320, 'the tropics stay put');
    assert.equal(frozen, 200, 'a fully frozen world has no edge to move');
    const sea = edgeTemp(273, 273, 0, true, 0, true, 'normal');
    const shore = edgeTemp(273, 273, 0, false, 0, true, 'normal');
    assert.ok(sea > shore, 'the sea is warmer at the line than the shore');
});
