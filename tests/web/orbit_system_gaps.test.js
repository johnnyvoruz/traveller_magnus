/**
 * AQ1 round 2. Which stored system is present, and the spin line the picture prints.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectSystem, rotationText, surfaceKind } from '../../apps/web/src/orbit/system.ts';

const stars = [{ sType: 'G' }];

test('the first stored system that has a star, in the file\'s order; none when every list is empty', () => {
    assert.equal(detectSystem({}), null);
    assert.equal(detectSystem({ mgtSystem: { stars: [] } }), null);
    assert.equal(detectSystem({ mgtSystem: { stars: [] }, ctSystem: { stars } }).edition, 'CT');
    const both = { aowSystem: { stars }, mgtSystem: { stars: [{ sType: 'M' }] } };
    assert.equal(detectSystem(both).edition, 'AoW');
    assert.equal(detectSystem(both).raw, both.aowSystem);
    assert.equal(detectSystem({ mgtSystem: { stars } }).edition, 'MgT2E');
    assert.equal(detectSystem({ ctSystem: { stars } }).edition, 'CT');
    assert.equal(detectSystem({ t5System: { stars } }).edition, 'T5');
    assert.equal(detectSystem({ rttSystem: { stars } }).edition, 'RTT');
    assert.equal(detectSystem({ handSystem: { stars } }).edition, 'hand');
});

test('the spin line: locked, a sidereal day, retrograde, or blank', () => {
    assert.equal(rotationText(null), '');
    assert.equal(rotationText({}), '');
    assert.equal(rotationText({ tidallyLocked: true }), 'Tidally locked');
    assert.equal(rotationText({ isTwilightZone: true, siderealHours: 24 }), 'Tidally locked');
    assert.equal(rotationText({ rotationPeriod: 'tidally locked' }), 'Tidally locked');
    assert.equal(rotationText({ siderealHours: 24 }), '24 h');
    assert.equal(rotationText({ siderealHours: 24, axialTilt: 91 }), '24 h, retrograde');
    assert.equal(rotationText({ rotationPeriod: '2d' }), '48 h');
    assert.equal(rotationText({ siderealHours: 0, rotationPeriod: 10 }), '10 h');
});

test('a missing body has no surface kind; a gas giant is gas', () => {
    assert.equal(surfaceKind(null), null);
    assert.equal(surfaceKind(undefined), null);
    assert.equal(surfaceKind({ type: 'Gas Giant' }), 'gas');
});
