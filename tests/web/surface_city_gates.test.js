/**
 * Step 2 city gates. The numbers are the design's, and the enhanced program
 * carries those edges. Vanilla's draw source is not the enhanced program.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { cityNight, citySeen, cloudTransmission } from '../../apps/web/src/surface/enhanced/city_gates.ts';
import { ENHANCED_DRAW_FRAG } from '../../apps/web/src/surface/enhanced/draw.ts';
import { DRAW_FRAG } from '../../apps/web/src/surface/vanilla/gl_shade.ts';

const near = (got, want) => Math.abs(got - want) < 1e-3;

test('cloud transmission, the night ramp and the limb gate', () => {
    assert.ok(near(cloudTransmission(0, 1), 1));
    assert.ok(near(cloudTransmission(0.25, 1), Math.exp(-0.75)));
    assert.ok(near(cloudTransmission(0.5, 1), Math.exp(-1.5)));
    assert.ok(near(cloudTransmission(0.75, 1), Math.exp(-2.25) * (1 - 0.259259)));
    assert.equal(cloudTransmission(0.95, 1), 0);
    assert.equal(cloudTransmission(1, 1), 0);
    assert.equal(cityNight(1, 1), 0);
    assert.equal(cityNight(-1, 1), 1);
    assert.ok(cityNight(0, 0) >= 0.8);
    assert.equal(citySeen(0, 1), 0);
    assert.ok(citySeen(1, 0) > 0.9);
});

test('the enhanced program gates city light and leaves vanilla bytes alone', () => {
    assert.notEqual(ENHANCED_DRAW_FRAG, DRAW_FRAG);
    assert.equal(DRAW_FRAG.includes('uCityHaze * 0.25'), true);
    assert.equal(ENHANCED_DRAW_FRAG.includes('uCityHaze *'), false);
    assert.equal(ENHANCED_DRAW_FRAG.includes('uCityColor'), true);
    const halo = ENHANCED_DRAW_FRAG.slice(
        ENHANCED_DRAW_FRAG.indexOf('vec4 halo'),
        ENHANCED_DRAW_FRAG.indexOf('float seenPort'),
    );
    assert.equal(halo.includes('uCityColor'), false);
    assert.ok(ENHANCED_DRAW_FRAG.includes('float T = exp(-3.0 * c / max(z, 0.35)) * clear;'));
    assert.ok(ENHANCED_DRAW_FRAG.includes('float night = max(1.0 - smoothstep(-0.16, 0.08, geo), 0.8 * (1.0 - lit));'));
    assert.ok(ENHANCED_DRAW_FRAG.includes('float seen = smoothstep(0.02, 0.30, z) * exp(-uAirStrength * 0.22 * (path - 1.0));'));
    assert.equal(ENHANCED_DRAW_FRAG.includes('size * 4.5'), false);
    assert.equal(ENHANCED_DRAW_FRAG.includes('uPortView.'), false);
    const planet = ENHANCED_DRAW_FRAG.slice(
        ENHANCED_DRAW_FRAG.indexOf('vec4 shadePlanet'),
        ENHANCED_DRAW_FRAG.indexOf('void main'),
    );
    const discard = planet.indexOf('if (d > 1.0 + aa) return vec4(0.0);');
    const gate = planet.indexOf('float T =');
    assert.ok(discard >= 0 && gate > discard);
    assert.ok(planet.includes('uGas < 0.5 ? 1.0 : 0.0'));
    assert.ok(planet.includes('density > 0.002'));
});
