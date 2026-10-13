/**
 * The daily generation allowance in Build (apps/web/src/workspace/build/allowance_words.ts, acts.ts,
 * grow_acts.ts; prompts/d_dots_allowance.md part 2): quiet with plenty; "N of 100 left today." at 20
 * or fewer; a request sure to pass what is left is not sent; a density that may write fewer keeps the
 * button on; zero; an admin; the server's refusal with the local reset time, no marks and no toast.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { session } from '../../apps/web/src/account/session.ts';
import { AllowanceRefused } from '../../apps/web/src/builder/allowance.ts';
import { allowanceFor, generateMany, previewAt, setBuildMap } from '../../apps/web/src/workspace/build/acts.ts';
import { allowanceSay, allowanceSpent, refusalWords, resetWords, writesOf } from '../../apps/web/src/workspace/build/allowance_words.ts';
import { endFlight, flight } from '../../apps/web/src/workspace/build/flight.ts';
import { endJobToast } from '../../apps/web/src/workspace/build/job_toast.ts';
import { generateGrowing, growUi } from '../../apps/web/src/workspace/build/grow_acts.ts';
import { useBuildStore } from '../../apps/web/src/workspace/build/seam.ts';
import { build } from '../../apps/web/src/workspace/build/state.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';
import { ref } from 'vue';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const LATER = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
const allowance = (remaining, limit = 100) => ({ limit, used: limit === null ? 0 : limit - remaining, remaining, resetsAt: LATER });

function setup(left, { refuse = false } = {}) {
    session.user = { id: 'u1', email: null, role: 'user', profile: null };
    session.allowance = left === undefined ? null : left;
    const calls = { many: [], preview: [], grow: [] };
    const job = ref(null);
    const refusal = new AllowanceRefused('You can generate 12 more systems today. The allowance resets at 00:00 UTC.', { remaining: 12, limit: 100, resetsAt: LATER });
    const store = {
        universe: () => ({ id: 'u-allow', name: 'U', truthVersion: null }),
        tick: () => 0,
        row: () => null,
        rows: () => [],
        job,
        preview: async (hexKey) => { calls.preview.push(hexKey); return new Promise(() => {}); },
        generateMany: (hexes, choice, onProgress, density) => {
            calls.many.push({ keys: hexes.map((item) => item.hexKey), density });
            return { stop() {}, finished: refuse ? Promise.reject(refusal) : new Promise(() => {}) };
        },
        generateGrowing: (body) => {
            calls.grow.push(body);
            const accepted = refuse ? Promise.reject(refusal) : new Promise(() => {});
            accepted.catch(() => {});
            const finished = refuse ? Promise.reject(refusal) : new Promise(() => {});
            finished.catch(() => {});
            return { stop() {}, accepted, finished };
        },
    };
    useBuildStore(store);
    setBuildMap({ truth: () => null, sectorName: (slug) => slug, subsectorName: () => 'Subsector C', settings: () => null, select: () => {} });
    build.on = true;
    build.job = null;
    build.error = '';
    build.preview = null;
    build.rolling = '';
    build.density = 'standard';
    build.filledToo = false;
    growUi.error = '';
    growUi.busy = false;
    growUi.names = {};
    clearToasts();
    return { calls, job };
}

function teardown() {
    endFlight();
    endJobToast();
    build.job = null;
    build.error = '';
    useBuildStore(null);
    setBuildMap(null);
    clearToasts();
    session.user = null;
    session.allowance = null;
}

const hexes = (n) => Array.from({ length: n }, (_, i) => 'A/' + String(1 + Math.floor(i / 10)).padStart(2, '0') + String(1 + (i % 10)).padStart(2, '0'));

test('the words: quiet with plenty, a short line at 20 or fewer, and the reset in the local time zone', () => {
    const now = new Date();
    assert.equal(allowanceSay(allowance(21), 1, 1, now), null);
    assert.deepEqual(allowanceSay(allowance(20), 1, 1, now), { text: '20 of 100 left today.', blocked: false });
    assert.deepEqual(allowanceSay(allowance(3, 40), 1, 1, now), { text: '3 of 40 left today.', blocked: false });
    const at = new Date(LATER);
    const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const when = at.toDateString() === now.toDateString() ? 'at ' + time : 'tomorrow at ' + time;
    assert.deepEqual(allowanceSay(allowance(12), 80, 80, now), { text: 'You can generate 12 more systems today. The allowance resets ' + when + '.', blocked: true });
    assert.equal(allowanceSay(allowance(1), 2, 2, now).text.startsWith('You can generate 1 more system today.'), true);
    // A reset on the next local day says so.
    const late = new Date('2026-10-12T23:30:00');
    assert.equal(resetWords(new Date('2026-10-13T00:00:00'), late).startsWith('tomorrow at '), true);
    assert.equal(resetWords(new Date('2026-10-12T23:45:00'), late).startsWith('tomorrow'), false);
});

test('a density that may write fewer than what is left keeps the button on, and says what happens', () => {
    const say = allowanceSay(allowance(12), 0, 80);
    assert.deepEqual(say, { text: 'You can generate 12 more systems today. If the roll would make more than 12, nothing is generated.', blocked: false });
    // Every hex is a write: sure to pass, so the button is off.
    const every = writesOf(80, 0, 'every');
    assert.deepEqual(every, { least: 80, most: 80 });
    assert.equal(allowanceSay(allowance(12), every.least, every.most).blocked, true);
    // Filled hexes regenerated are always written: more of them than is left is sure to pass.
    const filled = writesOf(10, 20, 'sparse');
    assert.deepEqual(filled, { least: 20, most: 30 });
    assert.equal(allowanceSay(allowance(12), filled.least, filled.most).blocked, true);
});

test('zero: every Generate is off, and the strip says so with nothing selected', () => {
    const say = allowanceSay(allowance(0), 0, 80);
    assert.equal(say.blocked, true);
    assert.equal(say.text.startsWith('You’ve used today’s 100 systems. The allowance resets '), true);
    assert.equal(allowanceSpent(allowance(0)), say.text);
    assert.equal(allowanceSpent(allowance(5)), '');
});

test('an admin, signed out, or no answer yet: nothing is said and nothing is held', () => {
    assert.equal(allowanceSay(allowance(null, null), 1280, 1280), null);
    assert.equal(allowanceSay(null, 1280, 1280), null);
    assert.equal(allowanceSpent(allowance(null, null)), '');
    setup(allowance(null, null));
    assert.equal(allowanceFor(hexes(80), 'every'), null);
    teardown();
    setup(allowance(0));
    session.user = null;
    assert.equal(allowanceFor(['A/0101']), null);
    teardown();
});

test('the refusal is the server’s sentence, then the reset in the person’s time zone', () => {
    const err = new AllowanceRefused('You can generate 1 more system today. The allowance resets at 00:00 UTC.', { remaining: 1, limit: 100, resetsAt: '2026-10-13T00:00:00.000Z' });
    const now = new Date('2026-10-12T12:00:00.000Z');
    const words = refusalWords(err, now);
    assert.equal(words.startsWith('You can generate 1 more system today. The allowance resets at 00:00 UTC. In your time zone, that’s '), true);
    assert.equal(words.endsWith(resetWords(new Date('2026-10-13T00:00:00.000Z'), now) + '.'), true);
});

test('a request sure to pass what is left is not sent, and its sentence is where the refusal would be', () => {
    const { calls } = setup(allowance(12));
    build.density = 'every';
    generateMany(hexes(20));
    assert.deepEqual(calls.many, []);
    assert.equal(build.job, null);
    assert.equal(build.error.startsWith('You can generate 12 more systems today.'), true);
    assert.equal(toasts.length, 0);
    teardown();
});

test('one hex at zero: no preview is asked for', async () => {
    const { calls } = setup(allowance(0));
    await previewAt('A/0101');
    assert.deepEqual(calls.preview, []);
    assert.equal(build.error.startsWith('You’ve used today’s 100 systems.'), true);
    teardown();
});

test('plenty left: the job runs at once, with its marks and its toast', async () => {
    const { calls } = setup(allowance(90));
    generateMany(hexes(20));
    assert.equal(calls.many.length, 1);
    assert.equal(flight.keys.length, 20);
    assert.equal(toasts.length, 1);
    teardown();
});

test('a roll that might pass what is left: sent, but the marks and the toast wait for the job to be accepted', async () => {
    const { calls, job } = setup(allowance(12));
    build.density = 'sparse';
    generateMany(hexes(20));
    assert.equal(calls.many.length, 1);
    assert.equal(flight.keys.length, 0);
    assert.equal(toasts.length, 0);
    job.value = { progress: { total: 20, done: 0, failed: [], state: 'running' }, undo: 't' };
    await tick();
    assert.equal(flight.keys.length, 20);
    assert.equal(toasts.length, 1);
    teardown();
});

test('the server refuses: nothing is marked, no toast starts, and the refusal says the local time', async () => {
    const { calls } = setup(allowance(12), { refuse: true });
    // The store's watch lets go of the last test's followed job.
    await tick();
    build.density = 'sparse';
    generateMany(hexes(20));
    await tick();
    await tick();
    assert.equal(calls.many.length, 1);
    assert.equal(flight.keys.length, 0);
    assert.equal(toasts.length, 0);
    assert.equal(build.job, null);
    assert.equal(build.error.startsWith('You can generate 12 more systems today. The allowance resets at 00:00 UTC. In your time zone, that’s '), true);
    teardown();
});

test('an empty sector slot: sure to pass is not sent; a refusal is said beside the names', async () => {
    const keys = ['~slot_9_9/0101', '~slot_9_9/0102', '~slot_9_9/0103'];
    let { calls } = setup(allowance(2));
    growUi.names = { '~slot_9_9': 'New' };
    build.density = 'every';
    generateGrowing(keys);
    assert.deepEqual(calls.grow, []);
    assert.equal(growUi.error.startsWith('You can generate 2 more systems today.'), true);
    teardown();
    ({ calls } = setup(allowance(2), { refuse: true }));
    growUi.names = { '~slot_9_9': 'New' };
    build.density = 'sparse';
    generateGrowing(keys);
    await tick();
    await tick();
    assert.equal(calls.grow.length, 1);
    assert.equal(flight.keys.length, 0);
    assert.equal(toasts.length, 0);
    assert.equal(growUi.error.includes('In your time zone, that’s '), true);
    teardown();
});
