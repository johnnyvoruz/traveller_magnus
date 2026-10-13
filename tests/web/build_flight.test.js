/**
 * Generation in flight (apps/web/src/workspace/build/flight.ts, state.ts jobLine): which hexes
 * of a job are waiting and which have landed, read from each row's revision against the one it
 * had at the click.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endFlight, flight, flightSplit, noteFlight, renameFlight, startFlight } from '../../apps/web/src/workspace/build/flight.ts';
import {
    build, cleanDensity, DEFAULT_DENSITY, DENSITIES, DENSITY_HINT, densityWords, jobLabel, jobLine, jobToast, NOTHING_NEW, readDensity, setDensity, stripLine, yoursNote,
} from '../../apps/web/src/workspace/build/state.ts';
import { endJobToast, jobUndo, startJobToast, takenOver } from '../../apps/web/src/workspace/build/job_toast.ts';
import { useBuildStore } from '../../apps/web/src/workspace/build/seam.ts';
import { stopBuild } from '../../apps/web/src/workspace/build/acts.ts';
import { menuFor } from '../../apps/web/src/workspace/build/commands.ts';
import { lookupWords, unitOf } from '../../apps/web/src/workspace/build/hand.ts';
import { clearToasts, runToastAction, toasts } from '../../apps/web/src/shell/toast.ts';
import { ref } from 'vue';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a job is one busy toast: its words follow the job, Stop turns that same toast to "Stopping", and it gives way at the end', async () => {
    clearToasts();
    let stopped = 0;
    build.job = { label: 'Generating 80 hexes', total: 80, done: 0, failed: [], state: 'running' };
    startJobToast(() => { stopped += 1; });
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'Generating 80 hexes · 0 of 80');
    assert.equal(toasts[0].busy, true);
    assert.equal(toasts[0].action.label, 'Stop');
    assert.equal(toasts[0].action.close, false);
    assert.ok(toasts[0].ms > 24 * 3600 * 1000);
    build.job = { ...build.job, done: 12 };
    await tick();
    assert.equal(toasts[0].message, 'Generating 80 hexes · 12 of 80');
    // The strip leaves the toast up (close: false) and runs Stop: the same toast says so at once, and offers no second Stop.
    const id = toasts[0].id;
    runToastAction(toasts[0]);
    assert.equal(stopped, 1);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].id, id);
    assert.equal(toasts[0].action, null);
    assert.equal(toasts[0].busy, true);
    assert.equal(toasts[0].message, 'Stopping. Generating 80 hexes · 12 of 80');
    build.job = { ...build.job, state: 'stopping', done: 13 };
    await tick();
    assert.equal(toasts[0].message, 'Stopping. Generating 80 hexes · 13 of 80');
    endJobToast();
    build.job = null;
    assert.equal(toasts.length, 0);
});

test('leaving the map clears the toasts; the job goes on, and its toast comes back with the next store', async () => {
    clearToasts();
    useBuildStore({ tick: () => 0, row: () => null });
    await tick();
    build.job = { label: 'Generating 80 hexes', total: 80, done: 3, failed: [], state: 'running' };
    startJobToast(() => {});
    // What the store's close does: every toast goes, then the store.
    clearToasts();
    useBuildStore(null);
    await tick();
    build.job = { ...build.job, done: 9 };
    await tick();
    useBuildStore({ tick: () => 0, row: () => null });
    await tick();
    assert.deepEqual(toasts.map((item) => item.message), ['Generating 80 hexes · 9 of 80']);
    assert.equal(toasts[0].action.label, 'Stop');
    endJobToast();
    build.job = null;
    useBuildStore(null);
    clearToasts();
});

test('a job the store followed across a route change is picked up: progress, one toast, Stop through the store, and its Undo', async () => {
    clearToasts();
    build.job = null;
    const job = ref({ progress: { total: 80, done: 16, failed: [], skipped: 0, state: 'running' }, undo: { id: 'undo-1' } });
    const asked = { stop: 0, undo: [] };
    const store = { tick: () => 0, row: () => null, job, stopJob: () => { asked.stop += 1; }, undo: async (token) => { asked.undo.push(token.id); return null; } };
    useBuildStore(store);
    await tick();
    assert.deepEqual({ ...build.job }, { total: 80, done: 16, failed: [], state: 'running', label: 'Generating 80 hexes' });
    assert.deepEqual(toasts.map((item) => [item.message, item.busy]), [['Generating 80 hexes · 16 of 80', true]]);
    job.value = { progress: { ...job.value.progress, done: 48 }, undo: job.value.undo };
    await tick();
    assert.equal(build.job.done, 48);
    assert.equal(toasts[0].message, 'Generating 80 hexes · 48 of 80');
    stopBuild();
    assert.equal(asked.stop, 1);
    job.value = { progress: { total: 80, done: 80, failed: [], skipped: 0, state: 'done' }, undo: { id: 'undo-1' } };
    await tick();
    assert.equal(build.job, null);
    assert.deepEqual(toasts.map((item) => item.message), ['Generated 80 systems.']);
    toasts[0].action.run();
    await tick();
    assert.deepEqual(asked.undo, ['undo-1']);
    useBuildStore(null);
    clearToasts();
});

test('a job started here, then a route change: the next store’s followed job ends it, with its token, and Stop goes through it', async () => {
    clearToasts();
    const first = { tick: () => 0, row: () => null, job: ref(null) };
    useBuildStore(first);
    await tick();
    build.job = { label: 'Generating 58 hexes', total: 58, done: 0, failed: [], state: 'running' };
    startJobToast(() => assert.fail('the closed store is not asked to stop'));
    assert.equal(takenOver(), false);
    // The map closes (every toast goes), the account page has no store, then the map's next store follows the job.
    clearToasts();
    useBuildStore(null);
    await tick();
    const job = ref({ progress: { total: 58, done: 10, failed: [], skipped: 0, state: 'running' }, undo: { id: 'next-token' } });
    let stops = 0;
    const next = { tick: () => 0, row: () => null, job, stopJob: () => { stops += 1; }, undo: async () => null };
    useBuildStore(next);
    await tick();
    assert.equal(takenOver(), true);
    assert.equal(build.job.done, 10);
    assert.equal(build.job.label, 'Generating 58 hexes');
    assert.deepEqual(toasts.map((item) => item.message), ['Generating 58 hexes · 10 of 58']);
    runToastAction(toasts[0]);
    assert.equal(stops, 1);
    job.value = { progress: { total: 58, done: 30, failed: [], skipped: 0, state: 'stopped' }, undo: { id: 'next-token' } };
    await tick();
    assert.equal(build.job, null);
    assert.deepEqual(toasts.map((item) => item.message), ['Stopped. Generated 30 of 58 systems.']);
    useBuildStore(null);
    clearToasts();
});

test('a job started here and finished after a route change offers the token the current store knows', () => {
    const first = { job: ref(null) };
    const next = { job: ref({ progress: { total: 2, done: 2, failed: [], state: 'done' }, undo: { id: 'adopted' } }) };
    useBuildStore(next);
    assert.deepEqual(jobUndo({ id: 'original' }, first), { id: 'adopted' });
    assert.deepEqual(jobUndo({ id: 'original' }, next), { id: 'original' });
    // A store that does not follow the job (it opened before the job's request was answered) cannot take the first one's token.
    useBuildStore({ job: ref(null) });
    assert.equal(jobUndo({ id: 'original' }, first), null);
    useBuildStore(null);
    assert.equal(jobUndo({ id: 'original' }, first), null);
});

test('the strip names the map and says it is a copy; the version is in the tooltip; the note in plain words', () => {
    assert.deepEqual(stripLine('The Spinward Run', 'v5'), { what: 'your copy of the published chart', title: 'The Spinward Run is your copy of the published chart, version v5' });
    assert.equal(stripLine('Lane F review', null).what, 'a map of your own');
    assert.equal(yoursNote(true), 'This map is your own copy of the published chart. What you generate, change, or remove stays on your map, and nobody else sees it unless you publish a package.');
    assert.ok(yoursNote(false).startsWith('This map is your own. '));
});

test('a hand star’s four numbers: the unit the contract gives, and the lookup as the box shows it', () => {
    assert.equal(unitOf('star.0.mass'), 'solar masses');
    assert.equal(unitOf('star.1.diam'), 'solar diameters');
    assert.equal(unitOf('star.0.temp'), 'kelvin');
    assert.equal(unitOf('star.0.lum'), 'solar luminosities');
    assert.equal(unitOf('body.0.mass'), '');
    assert.equal(unitOf('star.0.name'), '');
    assert.equal(lookupWords(0.8123456), '0.8123');
    assert.equal(lookupWords(5800), '5800');
    assert.equal(lookupWords(1.0), '1');
});

test('a job that lands in three steps: each written hex is marked as its step reports, and a hex left empty goes back to plain', () => {
    const keys = ['A/0101', 'A/0102', 'A/0103', 'A/0104', 'A/0105', 'A/0106'];
    startFlight(keys);
    // The opening report: nothing checked.
    noteFlight({ done: 0, placed: [], landed: [] });
    assert.deepEqual(flightSplit(flight.keys, flight.placed, flight.checked), { waiting: keys, landed: [] });
    // Step 1: two checked, one written (0102 was left empty).
    noteFlight({ done: 2, placed: ['A/0101'], landed: ['A/0101'] });
    assert.deepEqual(flightSplit(flight.keys, flight.placed, flight.checked), { waiting: ['A/0103', 'A/0104', 'A/0105', 'A/0106'], landed: ['A/0101'] });
    // Step 2: four checked; 0103 and 0104 written. A report with only `landed` adds to what was written.
    noteFlight({ done: 4, landed: ['A/0103', 'A/0104'] });
    assert.deepEqual(flightSplit(flight.keys, flight.placed, flight.checked), { waiting: ['A/0105', 'A/0106'], landed: ['A/0101', 'A/0103', 'A/0104'] });
    // Step 3: all checked; 0106 written, 0105 left empty.
    noteFlight({ done: 6, placed: ['A/0101', 'A/0103', 'A/0104', 'A/0106'], landed: ['A/0106'] });
    assert.deepEqual(flightSplit(flight.keys, flight.placed, flight.checked), { waiting: [], landed: ['A/0101', 'A/0103', 'A/0104', 'A/0106'] });
    endFlight();
    assert.deepEqual(flight.keys, []);
});

test('a store from before density sends no keys: every hex waits until the job ends', () => {
    startFlight(['A/0101', 'A/0102']);
    noteFlight({ done: 1 });
    assert.deepEqual(flightSplit(flight.keys, flight.placed, flight.checked), { waiting: ['A/0101', 'A/0102'], landed: [] });
    endFlight();
});

test('the hexes of an empty slot follow their real keys once the sector is made', () => {
    startFlight(['~slot_3_1/0101', 'A/0505']);
    renameFlight({ '~slot_3_1/0101': 'S1/0101' });
    assert.deepEqual(flight.keys, ['S1/0101', 'A/0505']);
    endFlight();
});

test('a running job in one line: hexes checked when the store counts them so', () => {
    assert.equal(jobLine({ label: 'Generating 80 hexes', total: 80, done: 12, failed: [], state: 'running' }), 'Generating 80 hexes · 12 of 80');
    assert.equal(jobLine({ label: 'Generating 1,280 hexes', total: 1280, done: 1000, failed: ['A/0101', 'A/0102'], state: 'running' }), 'Generating 1,280 hexes · 1,000 of 1,280 · 2 failed');
    assert.equal(jobLine({ label: 'Generating up to 80 systems', total: 80, done: 32, failed: [], state: 'running', placed: ['A/0101'], leftEmpty: 31 }), 'Generating up to 80 systems · 32 of 80 hexes checked');
});

test('density: the four choices in order, Standard by default, the words before, during and after a run', () => {
    // Johnny's ruling: the plain words, the name first; the dice in a hint.
    assert.deepEqual(DENSITIES.map((item) => item.name + ': ' + item.meaning), [
        'Sparse: about a third of the empty hexes',
        'Standard: about half of the empty hexes',
        'Dense: about two thirds of the empty hexes',
        'Every hex: all of the empty hexes',
    ]);
    assert.equal(DENSITY_HINT, 'Each empty hex is rolled once: 2, 3, or 4 chances in 6.');
    assert.equal(densityWords('standard'), 'Standard: about half of the empty hexes');
    assert.equal(DEFAULT_DENSITY, 'standard');
    assert.equal(cleanDensity('thick'), 'standard');
    assert.equal(cleanDensity('sparse'), 'sparse');
    assert.equal(jobLabel(80, 'sparse'), 'Generating up to 80 systems');
    assert.equal(jobLabel(80, 'every'), 'Generating 80 hexes');
    const done = (placed, leftEmpty, extra = {}) => ({ total: placed + leftEmpty, done: placed + leftEmpty, failed: [], state: 'done', placed: Array.from({ length: placed }, (_, i) => 'A/' + i), leftEmpty, ...extra });
    assert.equal(jobToast(done(40, 40), 'Subsector C'), 'Generated 40 systems in Subsector C. 40 hexes were left empty.');
    assert.equal(jobToast(done(1, 1), 'Subsector C'), 'Generated 1 system in Subsector C. 1 hex was left empty.');
    assert.equal(jobToast(done(80, 0), 'Subsector A'), 'Generated 80 systems in Subsector A.');
    assert.equal(jobToast(done(3, 2, { failed: ['A/9'] }), ''), 'Generated 3 systems. 2 hexes were left empty. 1 hex failed.');
    assert.equal(jobToast({ total: 80, done: 30, failed: [], state: 'stopped', placed: ['A/1', 'A/2'], leftEmpty: 28 }, 'Subsector C'), 'Stopped after checking 30 of 80 hexes. Generated 2 systems in Subsector C. 28 hexes were left empty.');
    // A second run at the same density over the hexes the first left empty writes nothing: said, with what to do.
    assert.equal(jobToast(done(0, 40), 'Subsector C'), NOTHING_NEW);
});

test('the right-click menu for many hexes says a choice follows ("Generate…"); one hex says what it does', () => {
    useBuildStore({ tick: () => 0, row: () => null, universe: () => ({ id: 'u-menu', name: 'U', truthVersion: null }) });
    const many = menuFor(['A/0101', 'A/0102', 'A/0103']).items.find((item) => item.id === 'build-generate');
    assert.equal(many.label, 'Generate…');
    assert.equal(many.say, undefined);
    const one = menuFor(['A/0101']).items.find((item) => item.id === 'build-generate');
    assert.equal(one.label, 'Generate a system');
    useBuildStore(null);
});

test('the choice is remembered per universe', () => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    assert.equal(readDensity('u1'), 'standard');
    setDensity('u1', 'dense');
    assert.equal(build.density, 'dense');
    assert.equal(readDensity('u1'), 'dense');
    assert.equal(readDensity('u2'), 'standard');
    setDensity('u2', 'every');
    assert.equal(readDensity('u1'), 'dense');
    assert.equal(readDensity('u2'), 'every');
    setDensity(null, 'standard');
    delete globalThis.localStorage;
});
