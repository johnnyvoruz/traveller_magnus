/**
 * Generation in flight (apps/web/src/workspace/build/flight.ts, state.ts jobLine): which hexes
 * of a job are waiting and which have landed, read from each row's revision against the one it
 * had at the click.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endFlight, flight, flightSplit, renameFlight, startFlight } from '../../apps/web/src/workspace/build/flight.ts';
import { build, jobLine, stripLine, yoursNote } from '../../apps/web/src/workspace/build/state.ts';
import { endJobToast, startJobToast } from '../../apps/web/src/workspace/build/job_toast.ts';
import { useBuildStore } from '../../apps/web/src/workspace/build/seam.ts';
import { lookupWords, unitOf } from '../../apps/web/src/workspace/build/hand.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a job is one toast: its words follow the job, Stop keeps a toast up, and it gives way at the end', async () => {
    clearToasts();
    let stopped = 0;
    build.job = { label: 'Generating 80 hexes', total: 80, done: 0, failed: [], state: 'running' };
    startJobToast(() => { stopped += 1; });
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'Generating 80 hexes · 0 of 80');
    assert.equal(toasts[0].action.label, 'Stop');
    assert.ok(toasts[0].ms > 24 * 3600 * 1000);
    build.job = { ...build.job, done: 12 };
    await tick();
    assert.equal(toasts[0].message, 'Generating 80 hexes · 12 of 80');
    // The strip closes a toast when its action is pressed; the job's words come back in a toast of their own.
    const run = toasts[0].action.run;
    toasts.splice(0, 1);
    run();
    assert.equal(stopped, 1);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].action, null);
    // Said at once, before the store's next answer.
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

test('a hex has landed when its row moved past the revision it had at the click', () => {
    const revs = { 'A/0101': -1, 'A/0102': 3, 'A/0103': -1 };
    const rev = (key) => revs[key] ?? -1;
    startFlight(['A/0101', 'A/0102', 'A/0103'], rev);
    assert.deepEqual(flight.from, { 'A/0101': -1, 'A/0102': 3, 'A/0103': -1 });
    assert.deepEqual(flightSplit(flight.keys, flight.from, rev), { waiting: ['A/0101', 'A/0102', 'A/0103'], landed: [] });
    // An empty hex gets its first row; a filled one generated again moves to a later revision.
    revs['A/0101'] = 1;
    revs['A/0102'] = 4;
    assert.deepEqual(flightSplit(flight.keys, flight.from, rev), { waiting: ['A/0103'], landed: ['A/0101', 'A/0102'] });
    endFlight();
    assert.deepEqual(flight.keys, []);
});

test('the hexes of an empty slot follow their real keys once the sector is made', () => {
    startFlight(['~slot_3_1/0101', 'A/0505'], () => -1);
    renameFlight({ '~slot_3_1/0101': 'S1/0101' });
    assert.deepEqual(flight.keys, ['S1/0101', 'A/0505']);
    assert.deepEqual(flight.from, { 'S1/0101': -1, 'A/0505': -1 });
    endFlight();
});

test('a running job in one line', () => {
    assert.equal(jobLine({ label: 'Generating 80 hexes', total: 80, done: 12, failed: [], state: 'running' }), 'Generating 80 hexes · 12 of 80');
    assert.equal(jobLine({ label: 'Generating 1,280 hexes', total: 1280, done: 1000, failed: ['A/0101', 'A/0102'], state: 'running' }), 'Generating 1,280 hexes · 1,000 of 1,280 · 2 failed');
});
