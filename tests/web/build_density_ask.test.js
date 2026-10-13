/**
 * Generating more than one hex always asks how many to fill (apps/web/src/workspace/build/density_ask.ts;
 * prompts/d_menu_selection.md part 0): every way in opens the prompt and none runs a job without
 * it; Cancel writes nothing; the last choice in the universe is preselected; one hex is not asked.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setBuildMap } from '../../apps/web/src/workspace/build/acts.ts';
import { canBuild, runBuild } from '../../apps/web/src/workspace/build/commands.ts';
import { askDensity, cancelDensity, confirmDensity, runMany } from '../../apps/web/src/workspace/build/density_ask.ts';
import { growUi } from '../../apps/web/src/workspace/build/grow_acts.ts';
import { useBuildStore } from '../../apps/web/src/workspace/build/seam.ts';
import { build, readDensity, setDensity } from '../../apps/web/src/workspace/build/state.ts';
import { clearToasts } from '../../apps/web/src/shell/toast.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
    const kept = new Map();
    globalThis.localStorage = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) };
    const calls = { many: [], grow: [], preview: [] };
    const store = {
        universe: () => ({ id: 'u-ask', name: 'U', truthVersion: null }),
        tick: () => 0,
        row: () => null,
        rows: () => [],
        preview: async (hexKey) => { calls.preview.push(hexKey); return new Promise(() => {}); },
        generateMany: (hexes, choice, onProgress, density) => {
            calls.many.push({ keys: hexes.map((item) => item.hexKey), density });
            return { stop() {}, finished: new Promise(() => {}) };
        },
        generateGrowing: (body) => {
            calls.grow.push(body);
            return { stop() {}, accepted: new Promise(() => {}), finished: new Promise(() => {}) };
        },
    };
    useBuildStore(store);
    setBuildMap({ truth: () => null, sectorName: (slug) => slug, subsectorName: () => 'Subsector C', settings: () => null, select: () => {} });
    build.on = true;
    build.job = null;
    build.asking = null;
    build.preview = null;
    build.rolling = '';
    clearToasts();
    return { calls };
}

function teardown() {
    build.job = null;
    build.asking = null;
    useBuildStore(null);
    setBuildMap(null);
    clearToasts();
    delete globalThis.localStorage;
}

const NINE = ['A/1002', 'A/1003', 'A/1004', 'A/1102', 'A/1103', 'A/1104', 'A/1202', 'A/1203', 'A/1204'];

test('G, the right-click menu and the palette (one command) ask first: no job runs before the prompt', () => {
    const { calls } = setup();
    assert.equal(canBuild('build-generate', NINE), true);
    runBuild('build-generate', NINE);
    assert.deepEqual(build.asking, NINE);
    assert.deepEqual(calls.many, []);
    assert.deepEqual(calls.grow, []);
    teardown();
});

test('the prompt’s Generate runs once, with the choice, and remembers it for the universe', async () => {
    const { calls } = setup();
    askDensity(NINE);
    confirmDensity('dense');
    await tick();
    assert.equal(build.asking, null);
    assert.deepEqual(calls.many, [{ keys: NINE, density: 'dense' }]);
    assert.equal(readDensity('u-ask'), 'dense');
    teardown();
});

test('Cancel writes nothing and runs nothing', () => {
    const { calls } = setup();
    setDensity('u-ask', 'sparse');
    askDensity(NINE);
    cancelDensity();
    assert.equal(build.asking, null);
    assert.deepEqual(calls.many, []);
    assert.equal(readDensity('u-ask'), 'sparse');
    teardown();
});

test('the preselection is the last choice in this universe, or Standard the first time', () => {
    setup();
    assert.equal(readDensity('u-ask'), 'standard');
    setDensity('u-ask', 'every');
    assert.equal(build.density, 'every');
    assert.equal(readDensity('u-ask'), 'every');
    teardown();
});

test('one hex is never asked: it previews as before', () => {
    const { calls } = setup();
    runBuild('build-generate', ['A/1002']);
    assert.equal(build.asking, null);
    assert.deepEqual(calls.preview, ['A/1002']);
    assert.deepEqual(calls.many, []);
    teardown();
});

test('hexes in an empty slot: the new sector is named first; then asked; then made with the choice', () => {
    const { calls } = setup();
    const slot = ['~slot_3_-2/0101', '~slot_3_-2/0102'];
    growUi.names = {};
    askDensity(slot);
    assert.equal(build.asking, null, 'not asked while the sector has no name');
    assert.equal(growUi.error, 'To generate here, first name the new sector.');
    growUi.names['~slot_3_-2'] = 'Vell';
    askDensity(slot);
    assert.deepEqual(build.asking, slot);
    confirmDensity('sparse');
    assert.equal(calls.grow.length, 1);
    assert.equal(calls.grow[0].density, 'sparse');
    growUi.names = {};
    growUi.error = '';
    growUi.busy = false;
    teardown();
});

test('the full sheet has chosen already: it runs without asking a second time', () => {
    const { calls } = setup();
    build.density = 'dense';
    runMany(NINE);
    assert.equal(build.asking, null);
    assert.deepEqual(calls.many, [{ keys: NINE, density: 'dense' }]);
    teardown();
});
