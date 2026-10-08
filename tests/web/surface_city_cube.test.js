/**
 * Step 3 cube C. The bake formula, the day material and the vanilla bytes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ENHANCED_BAKE_PASSES, ENHANCED_CITY_VERSION, discRendererVersion } from '../../apps/web/src/surface/enhanced/bake.ts';
import { cityLook } from '../../apps/web/src/surface/enhanced/city_look.ts';
import { CITY_BAKE_FRAG, cityCubeBytes, cityWanted } from '../../apps/web/src/surface/enhanced/city_cube.ts';
import { ENHANCED_DRAW_FRAG } from '../../apps/web/src/surface/enhanced/draw.ts';
import { cubeBytes } from '../../apps/web/src/surface/vanilla/gl_bake.ts';
import { DRAW_FRAG } from '../../apps/web/src/surface/vanilla/gl_shade.ts';

function depth(source) {
    let n = 0;
    for (const ch of source) {
        if (ch === '{') n += 1;
        else if (ch === '}') n -= 1;
        if (n < 0) return n;
    }
    return n;
}

test('population zero and gas allocate no city cube', () => {
    assert.equal(cityWanted({ gas: { bands: 8 }, kind: 'gas', lights: { pop: 9 } }), false);
    assert.equal(cityWanted({ gas: null, kind: 'gas', lights: { pop: 4 } }), false);
    assert.equal(cityWanted({ gas: null, kind: 'desert', lights: { pop: 0 } }), false);
    assert.equal(cityWanted({ gas: null, kind: 'desert' }), false);
    assert.equal(cityWanted({ gas: null, kind: 'temperate', lights: { pop: 2 } }), true);
});

test('cube C uses the two-cube mip estimate, halved', () => {
    for (const size of [32, 64, 128, 256, 512, 1024]) {
        assert.equal(cityCubeBytes(size), cubeBytes(size) / 2);
    }
    assert.equal(cityCubeBytes(256), 2097152);
});

test('the bake stores the design fabric and writes zero on an empty cell', () => {
    assert.ok(CITY_BAKE_FRAG.includes('float K = exp(-pow(w1.x / (0.10 + 0.18 * U), 2.0));'));
    assert.ok(CITY_BAKE_FRAG.includes('0.035 + 0.10 * K + 0.24 * H + 0.14 * A'));
    assert.ok(CITY_BAKE_FRAG.includes('0.055 * S * smoothstep(0.05, 0.5, U)'));
    assert.ok(CITY_BAKE_FRAG.includes('vec3 E = U * (tint * fabric + base * 0.35 * K * K);'));
    assert.ok(CITY_BAKE_FRAG.includes('outC = vec4(clamp(E, 0.0, 1.0), clamp(U * K * K, 0.0, 1.0));'));
    assert.ok(CITY_BAKE_FRAG.includes('if (uGas > 0.5 || U <= 0.0)'));
    assert.equal(depth(CITY_BAKE_FRAG), 0);
});

test('the enhanced draw samples C and leaves the vanilla source alone', () => {
    assert.equal(DRAW_FRAG.includes('samplerCube uC'), false);
    assert.equal(DRAW_FRAG.includes('uCloudForce'), false);
    assert.equal(DRAW_FRAG.includes('uCityOn'), false);
    assert.equal(DRAW_FRAG.includes('uCssDiameter'), false);
    const planet = ENHANCED_DRAW_FRAG.slice(
        ENHANCED_DRAW_FRAG.indexOf('vec4 shadePlanet'),
        ENHANCED_DRAW_FRAG.indexOf('void main'),
    );
    assert.equal(planet.includes('worleyF('), false);
    assert.equal(planet.includes('cityNight'), false);
    assert.equal(planet.includes('uTime * 3.0'), false);
    assert.ok(planet.includes('texture(uC, q, bias)'));
    assert.ok(planet.includes('float direct = 1.8'));
    assert.ok(planet.includes('direct * cityRaw'));
    assert.ok(planet.includes('uCityGain * gainK * uCityOn * night * seen'));
    assert.ok(planet.includes('rawCity / (1.0 + peak)'));
    assert.ok(planet.includes('bias + log2(2.0)'));
    assert.ok(planet.includes('bias + log2(5.0)'));
    assert.ok(planet.includes('smoothstep(core0, core1, g1.a)'));
    assert.ok(planet.includes('float core0 = 0.01'));
    assert.ok(planet.includes('if (uPop >= 9.0 && uNeon >= 0.25) sheetK = 1.4'));
    assert.equal(planet.includes('bias + 2.5'), false);
    assert.equal(planet.includes('bias + 4.5'), false);
    assert.equal(planet.includes('1.0 - exp(-emit'), false);
    assert.ok(planet.includes('float T = exp(-3.0 * c / max(z, 0.35)) * clear;'));
    assert.ok(planet.includes('0.92 + 0.16 * lum'));
    assert.ok(planet.includes('mix(uUrbanColor, uGlassColor, clamp(cityCore, 0.0, 1.0))'));
    assert.equal(depth(ENHANCED_DRAW_FRAG), 0);
    assert.deepEqual([...ENHANCED_BAKE_PASSES], ['C']);
    assert.equal(ENHANCED_CITY_VERSION, 'enhanced-cities-4b');
    assert.equal(discRendererVersion('enhanced'), ENHANCED_CITY_VERSION + '-' + cityLook().id);
});
