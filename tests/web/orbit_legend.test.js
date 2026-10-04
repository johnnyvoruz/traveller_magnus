/**
 * The orbit picture's legend (apps/web/src/orbit/legend.ts): an entry for each mark that is on
 * the picture, following the layer switches and the layout.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutScene, planSystem } from '../../apps/web/src/orbit/layout.ts';
import {
    LEGEND_BAND, LEGEND_BANDS, LEGEND_JUMP, LEGEND_MAINWORLD, LEGEND_PANEL, legendFor, legendSignature,
} from '../../apps/web/src/orbit/legend.ts';
import { layoutLineup } from '../../apps/web/src/orbit/lineup.ts';
import { DEFAULT_LAYERS, orbitPicture } from '../../apps/web/src/orbit/picture.ts';
import { blendPictures, travelOrder } from '../../apps/web/src/orbit/tween.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const VIEW = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false };

function orbits(plan, layers = DEFAULT_LAYERS) {
    const scene = layoutScene(plan, { ...VIEW, moons: layers.moons, jump: layers.jump }, 1000);
    return orbitPicture(plan, scene, layers, VIEW.z);
}

const labels = (entries) => entries.map((entry) => entry.label);

test('the orbits layout lists the habitable zones, the jump limit and the mainworld', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const entries = legendFor(plan, orbits(plan), DEFAULT_LAYERS);
    // The fixture's far companion has a habitable band of its own.
    assert.deepEqual(labels(entries), [LEGEND_BANDS, LEGEND_JUMP, LEGEND_MAINWORLD]);
    assert.deepEqual(entries.map((entry) => entry.kind), ['band', 'jump', 'mainworld']);
});

test('one band is one habitable zone', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const picture = orbits(plan);
    let seen = false;
    for (const layer of picture.layers) {
        layer.bands = layer.bands.filter(() => {
            if (seen) return false;
            seen = true;
            return true;
        });
    }
    assert.equal(legendFor(plan, picture, DEFAULT_LAYERS)[0].label, LEGEND_BAND);
});

test('an entry goes when its layer is switched off', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const off = (change) => {
        const layers = { ...DEFAULT_LAYERS, ...change };
        return labels(legendFor(plan, orbits(plan, layers), layers));
    };
    assert.deepEqual(off({ habitable: false }), [LEGEND_JUMP, LEGEND_MAINWORLD]);
    assert.deepEqual(off({ jump: false }), [LEGEND_BANDS, LEGEND_MAINWORLD]);
    assert.deepEqual(off({ markMainworld: false }), [LEGEND_BANDS, LEGEND_JUMP]);
    assert.deepEqual(off({ habitable: false, jump: false, markMainworld: false }), []);
});

test('a line-up lists the habitable panel and no jump limit', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    for (const mode of ['row', 'column']) {
        const picture = layoutLineup(plan, { ...VIEW, moons: true }, mode, 1000, DEFAULT_LAYERS);
        const entries = legendFor(plan, picture, DEFAULT_LAYERS);
        assert.deepEqual(labels(entries), [LEGEND_PANEL, LEGEND_MAINWORLD]);
        assert.equal(entries[0].kind, 'panel');
    }
});

test('while the layouts travel, the stronger habitable mark is the one named', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const from = orbits(plan);
    const to = layoutLineup(plan, { ...VIEW, moons: true }, 'row', 1000, DEFAULT_LAYERS);
    const order = travelOrder(plan);
    const at = (elapsed) => legendFor(plan, blendPictures({ from, to, elapsed, ms: 650, order, days: 1000, moonsShown: true }), DEFAULT_LAYERS);
    assert.equal(at(20)[0].kind, 'band');
    assert.equal(at(640)[0].kind, 'panel');
});

test('no plan or no picture: no legend; the signature changes only with the entries', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    assert.deepEqual(legendFor(null, null, DEFAULT_LAYERS), []);
    assert.deepEqual(legendFor(plan, null, DEFAULT_LAYERS), []);
    const a = legendSignature(legendFor(plan, orbits(plan), DEFAULT_LAYERS));
    const b = legendSignature(legendFor(plan, orbits(plan), DEFAULT_LAYERS));
    const c = legendSignature(legendFor(plan, orbits(plan, { ...DEFAULT_LAYERS, jump: false }), { ...DEFAULT_LAYERS, jump: false }));
    assert.equal(a, b);
    assert.notEqual(a, c);
});
