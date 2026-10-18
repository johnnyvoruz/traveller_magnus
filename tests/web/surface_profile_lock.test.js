// W1: a moon locked to its planet is not star-locked. The star still rises and sets.
import assert from 'node:assert/strict';
import test from 'node:test';
import { surfaceProfile } from '../../apps/web/src/surface/profile.ts';

const body = {
    name: 'Lock',
    type: 'Planet',
    uwp: 'A788899-C',
    size: 8,
    atmCode: 8,
    hydroCode: 8,
    tidallyLocked: true,
    isMoon: true,
};

test('a locked moon is not star-locked, and the same body as a planet is', () => {
    const moon = surfaceProfile(body, 'locked-moon');
    assert.equal(moon.climate.locked, false);
    assert.equal(moon.rotation.locked, false);
    const planet = surfaceProfile({ ...body, isMoon: false }, 'locked-planet');
    assert.equal(planet.climate.locked, true);
    assert.equal(planet.rotation.locked, true);
});
