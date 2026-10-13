import assert from 'node:assert/strict';
import test from 'node:test';
import { BAKE_FRAG, BAKE_FRAG_TILT } from '../../apps/web/src/surface/vanilla/gl_shaders.ts';
import { latitudeTiltFactor, latitudeTermScales } from '../../apps/web/src/surface/tilt_latitude.ts';
import { hybridWorld } from '../../apps/web/src/surface/hybrid/inputs.ts';
import { buildHybridModel } from '../../apps/web/src/surface/hybrid/model.ts';
import { hybridCaption } from '../../apps/web/src/surface/caption.ts';

test('latitude factor matches the sheet clamp and stays 1 through 45 degrees', () => {
    const factor = (tilt) => {
        const tiltE = tilt > 90 ? 180 - tilt : tilt;
        return Math.max(-1, Math.min(1, (54 - tiltE) / 9));
    };
    for (const tilt of [0, 23, 45, 54, 60, 63, 85, 90, 120]) {
        assert.equal(latitudeTiltFactor(tilt), factor(tilt), String(tilt));
    }
    assert.equal(latitudeTiltFactor(0), 1);
    assert.equal(latitudeTiltFactor(45), 1);
    assert.equal(latitudeTiltFactor(54), 0);
    assert.equal(latitudeTiltFactor(60), (54 - 60) / 9);
    assert.equal(latitudeTiltFactor(85), -1);
    assert.equal(latitudeTermScales(45, false), false);
    assert.equal(latitudeTermScales(46, false), true);
    assert.equal(latitudeTermScales(85, true), false);
});

test('the tilted bake is the original shader plus uLatK on the unlocked latitude term', () => {
    assert.equal(BAKE_FRAG.includes('uLatK'), false);
    const tilted = BAKE_FRAG
        .replace('uniform float uMeanC, uSpread, uLocked;', 'uniform float uMeanC, uSpread, uLocked, uLatK;')
        .replace(
            ': uMeanC + (uSpread / 40.0) * (15.0 - 45.0 * sinLat * sinLat) - e * 28.0;',
            ': uMeanC + (uSpread / 40.0) * (15.0 - 45.0 * sinLat * sinLat) * uLatK - e * 28.0;',
        );
    assert.equal(BAKE_FRAG_TILT, tilted);
    assert.ok(BAKE_FRAG_TILT.includes('uLocked > 0.5'));
});

function band(model, pole) {
    const rows = model.hexes.filter((hex) => (pole ? Math.abs(hex.lat) >= 70 : Math.abs(hex.lat) <= 20));
    assert.ok(rows.length > 0);
    return rows.reduce((sum, hex) => sum + hex.tempK, 0) / rows.length;
}

test('a folded tilt above 54 makes the sheet equator colder than the poles', () => {
    const body = {
        type: 'Planet', name: 'Tilt', size: 4, atmCode: 6, hydroCode: 7, hydroPercent: 70, popCode: 0,
        starport: 'A', uwp: 'A746000-8', meanTempK: 280, lowTempK: 250, highTempK: 310,
        liquidType: 'Water', diamKm: 6400,
    };
    const low = buildHybridModel(hybridWorld('t', 'w', { ...body, axialTilt: 23 }));
    const high = buildHybridModel(hybridWorld('t', 'w', { ...body, name: 'Tilt high', axialTilt: 85 }));
    assert.ok(band(low, true) < band(low, false));
    assert.ok(band(high, false) < band(high, true));
});

function captionOf(body) {
    const world = hybridWorld('cap', body.name || 'body', body);
    assert.ok(world);
    return hybridCaption(buildHybridModel(world), body).text;
}

test('a dry frozen body names no liquid, and other liquids keep their own names', () => {
    const dry = {
        name: 'Vech A-IV-a', type: 'Satellite', uwp: 'Y100000-0', size: 1, atm: 0, atmCode: 0,
        hydro: 0, hydroCode: 0, hydroPercent: 2, liquidType: 'Ice', isMoon: true, isSatellite: true,
        meanTempK: 85, lowTempK: 0, highTempK: 101, axialTilt: 0.7, tidallyLocked: true, diamKm: 1600,
    };
    assert.equal(captionOf(dry), 'Enhanced · no seas');

    const water = {
        name: 'Water', type: 'Planet', uwp: 'A867977-C', size: 4, atmCode: 6, hydroCode: 7, hydroPercent: 70,
        liquidType: 'Water', meanTempK: 288, lowTempK: 260, highTempK: 310, diamKm: 8000,
    };
    assert.equal(captionOf(water), 'Enhanced · Water');

    const frozenWater = {
        ...water, name: 'Frozen water', meanTempK: 180, lowTempK: 160, highTempK: 200,
    };
    assert.equal(captionOf(frozenWater), 'Enhanced · Water · frozen');

    const exotic = {
        name: 'Acid', type: 'Planet', uwp: 'A7688B8-D', size: 4, atmCode: 8, hydroCode: 8, hydroPercent: 80,
        liquidType: 'Carbonic Acid', meanTempK: 290, lowTempK: 250, highTempK: 330, diamKm: 9000,
    };
    assert.equal(captionOf(exotic), 'Enhanced · Carbonic Acid');
});
