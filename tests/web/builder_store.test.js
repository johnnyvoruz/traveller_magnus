/**
 * The builder store against a fake transport. No network.
 * Speaks packages/shared builder.ts: one POST per hex, a job for more than one.
 * A change made while a save is in flight adopts the rev that save applied.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subsectorHexes, subsectorLetter, subsectorPath } from '../../apps/web/src/builder/address.ts';
import { mergeHex } from '../../apps/web/src/builder/overlay.ts';
import { asBuildStore } from '../../apps/web/src/builder/screen.ts';
import { openMap, previewSeed } from '../../apps/web/src/builder/store.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';

const KEY = 'spin/1910';
const OTHER = 'spin/1911';
const HASH = 'ab'.repeat(32);
const HASH2 = 'cd'.repeat(32);
const STAMP = '2026-10-08T00:00:00.000Z';
const SEED = 'TravellerMagnus';
const SETTINGS = { generationPopMax: 1 };

function chart(over = {}) {
    return {
        tree: HASH,
        type: 'SYSTEM_PRESENT',
        name: 'Regina',
        uwp: 'A788899-C',
        allegiance: 'Im',
        zone: '',
        bases: 'N',
        tradeCodes: ['Ri'],
        pbg: '303',
        ix: 0,
        partial: null,
        ...over,
    };
}

function row(over = {}) {
    return {
        hexKey: KEY,
        state: 'override',
        treeHash: HASH,
        baseHash: null,
        roll: 0,
        rev: 1,
        updatedAt: STAMP,
        ...over,
    };
}

function absent(hexKey = KEY, state = 'truth') {
    return { hexKey, state, treeHash: null, baseHash: null, roll: 0, rev: 0 };
}

function job(over = {}) {
    return {
        id: 'job-1',
        kind: 'generate',
        state: 'running',
        total: 3,
        done: 2,
        failed: 0,
        skipped: 0,
        failures: [],
        createdAt: STAMP,
        finishedAt: null,
        ...over,
    };
}

function json(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true, data }) };
}

function fail(status, message, details) {
    return { ok: false, status, json: async () => ({ ok: false, error: { code: 'conflict', message, details } }) };
}

function clock() {
    const timers = [];
    return {
        timers,
        schedule(fn, ms) {
            const item = { fn, ms, dead: false };
            timers.push(item);
            return () => { item.dead = true; };
        },
        armed() {
            return timers.filter((item) => !item.dead);
        },
    };
}

function fake(handler) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const call = { url, method: init.method, body, credentials: init.credentials };
        calls.push(call);
        return handler(call);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

function open(fetchImpl, time, over = {}) {
    return openMap({
        fetch: fetchImpl,
        schedule: time.schedule.bind(time),
        truthVersion: 'v9',
        universeId: 'uni-1',
        universeName: 'Mine',
        seed: SEED,
        settings: SETTINGS,
        ...over,
    });
}

test('a subsector is 80 hexes, lettered the way the map already letters them', () => {
    assert.equal(subsectorLetter('1910'), 'C');
    assert.equal(subsectorLetter('0101'), 'A');
    assert.equal(subsectorLetter('3240'), 'P');
    assert.equal(subsectorLetter('191'), null);
    const hexes = subsectorHexes('C');
    assert.equal(hexes.length, 80);
    assert.ok(hexes.includes('1910'));
    assert.equal(hexes.includes('1610'), false);
    assert.equal(hexes[0], '1701');
    assert.equal(hexes[hexes.length - 1], '2410');
    assert.equal(subsectorPath('Spinward_Marches', 'C'), '/s/Spinward_Marches/sub/C');
    assert.equal(subsectorHexes('Q').length, 0);
});

test('preview roll 0 is the universe seed, and a later roll is named on the seed', () => {
    assert.equal(previewSeed(SEED, 0), SEED);
    assert.equal(previewSeed(SEED, 3), SEED + '/roll/3');
});

test('the chart and a universe row lay over each other with no fetch', () => {
    const truth = chart();
    assert.equal(mergeHex(KEY, truth, null).state, 'truth');
    assert.equal(mergeHex(KEY, truth, null).rev, 0);
    assert.equal(mergeHex(KEY, truth, null).entry.name, 'Regina');
    assert.equal(mergeHex(KEY, null, null).state, 'empty');
    const removed = mergeHex(KEY, truth, row({ state: 'removed', treeHash: null }));
    assert.equal(removed.state, 'removed');
    assert.equal(removed.entry, null);
    assert.equal(removed.rev, 1);
    const named = mergeHex(KEY, truth, row({ state: 'removed', treeHash: null, entry: truth }));
    assert.equal(named.state, 'removed');
    assert.equal(named.entry.name, 'Regina');
    assert.equal(named.treeHash, null);
    const own = mergeHex(KEY, null, row({ state: 'own' }));
    assert.equal(own.state, 'own');
    assert.equal(own.entry, null);
    assert.equal(own.treeHash, HASH);
});

test('a sector page answers every hex in view, and one hex does not fetch again', async () => {
    const fetchImpl = fake((call) => {
        if (fetchImpl.calls.length === 1) return json({ items: [row()], nextCursor: KEY });
        assert.match(call.url, /cursor=/);
        return json({ items: [row({ hexKey: OTHER, state: 'removed', treeHash: null, roll: 2, rev: 4 })], nextCursor: null });
    });
    const map = open(fetchImpl, clock());
    assert.equal(map.hexView(KEY, chart()), null);
    await map.loadSector('spin');
    assert.equal(fetchImpl.calls.length, 2);
    assert.equal(fetchImpl.calls[0].credentials, 'same-origin');
    assert.match(fetchImpl.calls[0].url, /\/api\/universes\/uni-1\/hexes\?sector=spin&limit=100$/);
    assert.equal(map.hexView(KEY, chart()).state, 'override');
    assert.equal(map.hexView(KEY, chart()).entry, null);
    assert.equal(map.hexView(KEY, chart()).treeHash, HASH);
    assert.equal(map.hexView(OTHER, chart()).state, 'removed');
    assert.equal(map.hexView('spin/1912', chart()).state, 'truth');
    assert.equal(map.hexView('spin/1912', chart()).rev, 0);
    assert.equal(map.hexView('spin/0101', null).state, 'empty');
    assert.equal(fetchImpl.calls.length, 2);
    assert.equal(map.rows('spin').length, 2);
    map.close();
});

test('a universe tree is fetched from the private object route and kept', async () => {
    const envelope = { kind: 'tree', body: { mgtSystem: { stars: [{ name: 'Sol' }], worlds: [] } } };
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?sector=')) return json({ items: [row()], nextCursor: null });
        assert.equal(call.url, `/api/universes/uni-1/objects/${HASH}`);
        assert.equal(call.url.includes('cdn.traveller.voyage'), false);
        return { ok: true, status: 200, json: async () => envelope };
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    assert.deepEqual(await map.tree(KEY), envelope);
    assert.deepEqual(await map.tree(KEY), envelope);
    assert.equal(fetchImpl.calls.length, 2);
    map.close();
});

test('preview stores nothing, and generate one keeps the returned row and its roll', async () => {
    const envelope = { kind: 'tree', body: { marker: true } };
    const kept = row({ roll: 3, rev: 2, treeHash: HASH2 });
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?sector=')) return json({ items: [], nextCursor: null });
        if (call.url === '/api/generate/preview') {
            assert.equal(call.body.edition, 'MgT2E');
            assert.equal(call.body.mode, 'top-down');
            assert.equal(call.body.seed, SEED + '/roll/3');
            assert.equal(call.body.hexKey, KEY);
            assert.deepEqual(call.body.inputs, { type: 'SYSTEM_PRESENT' });
            return json({ envelope, hash: HASH2 });
        }
        if (call.url.endsWith('/generate')) {
            assert.deepEqual(call.body, {
                hexKeys: [KEY],
                edition: 'MgT2E',
                generator: 'top-down',
                roll: 3,
                filledToo: true,
                baseRev: 0,
            });
            return json({ rows: [kept], skipped: [] });
        }
        if (call.url.endsWith('/revert')) {
            assert.deepEqual(call.body, { toRev: 0, baseRev: 2 });
            return json(absent());
        }
        if (call.url.endsWith('/objects/' + HASH2)) return { ok: true, status: 200, json: async () => envelope };
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const tick = map.tick();
    const made = await map.preview(KEY, 'MgT2E', 'top-down', 3);
    assert.equal(made.envelope, envelope);
    assert.equal(map.tick(), tick);
    assert.equal(map.row(KEY), null);
    const done = await map.generate({ hexKeys: [KEY], edition: 'MgT2E', generator: 'top-down', roll: 3, filledToo: true }).finished;
    assert.equal(map.row(KEY).roll, 3);
    assert.equal(map.row(KEY).rev, 2);
    assert.equal(map.hexView(KEY, chart()).state, 'override');
    const beforeTree = fetchImpl.calls.length;
    assert.equal(await map.tree(KEY), envelope);
    assert.equal(await map.tree(KEY), envelope);
    assert.equal(fetchImpl.calls.length, beforeTree + 1);
    await map.undo(done.undo);
    assert.equal(map.row(KEY), null);
    assert.equal(map.hexView(KEY, chart()).state, 'truth');
    map.close();
});

test('generate many reads the server counts, and stop leaves the rows already done', async () => {
    const doneA = row({ hexKey: KEY, rev: 1 });
    const doneB = row({ hexKey: OTHER, rev: 1 });
    let undone = false;
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/generate')) {
            assert.equal(call.body.filledToo, false);
            assert.equal(call.body.roll, 0);
            assert.equal(call.body.edition, 'AoW');
            assert.equal(call.body.baseRev, undefined);
            assert.deepEqual(call.body.hexKeys, [KEY, OTHER, 'spin/1912']);
            return json({ jobId: 'job-1' });
        }
        if (call.url.endsWith('/stop')) return json(job({ state: 'stopped', done: 2, finishedAt: STAMP }));
        if (call.url.endsWith('/undo')) {
            undone = true;
            return json({ restored: 2, conflicts: [] });
        }
        if (call.url.includes('/jobs/')) return json(job({ failures: [{ hexKey: 'spin/1912', reason: 'stopped' }] }));
        if (call.url.includes('/hexes?')) return json({ items: undone ? [] : [doneA, doneB], nextCursor: null });
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    const seen = [];
    const handle = map.generate(
        { hexKeys: [KEY, OTHER, 'spin/1912'], edition: 'AoW', generator: 'bottom-up', roll: 0, filledToo: false },
        (progress) => {
            seen.push(progress.state);
            if (progress.state === 'running') handle.stop();
        },
    );
    const result = await handle.finished;
    assert.equal(result.progress.state, 'stopped');
    assert.equal(result.progress.done, 2);
    assert.equal(result.progress.total, 3);
    assert.equal(map.row(KEY).state, 'override');
    assert.equal(map.row(OTHER).state, 'override');
    assert.equal(map.row('spin/1912'), null);
    assert.ok(seen.includes('stopping'));
    assert.ok(seen.includes('stopped'));
    await map.undo(result.undo);
    assert.equal(map.row(KEY), null);
    assert.equal(map.row(OTHER), null);
    map.close();
});

test('remove and restore are one POST each, and undo before the save sends nothing', async () => {
    const removed = row({ state: 'removed', treeHash: null, rev: 2 });
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/remove')) {
            assert.deepEqual(call.body, { baseRev: 1 });
            return json(removed);
        }
        if (call.url.endsWith('/restore')) {
            assert.deepEqual(call.body, { baseRev: 2 });
            return json(absent());
        }
        if (call.url.endsWith('/revert')) {
            assert.deepEqual(call.body, { toRev: 2, baseRev: 0 });
            return json(row({ state: 'removed', treeHash: null, rev: 3, entry: chart() }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const token = map.remove([KEY]);
    assert.equal(map.hexView(KEY, chart()).state, 'removed');
    assert.equal(time.armed().length, 1);
    assert.equal(time.armed()[0].ms, 800);
    await map.undo(token);
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(map.row(KEY).rev, 1);
    map.remove([KEY]);
    await map.flushMap();
    assert.equal(map.row(KEY).state, 'removed');
    assert.equal(map.row(KEY).rev, 2);
    const restored = map.restore([KEY]);
    assert.equal(map.row(KEY), null);
    await map.flushMap();
    await map.undo(restored);
    assert.equal(map.row(KEY).state, 'removed');
    assert.equal(map.row(KEY).rev, 3);
    assert.equal(map.row(KEY).entry.name, 'Regina');
    map.close();
});

test('an own map remove drops the row instead of marking it removed', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row({ state: 'own' })], nextCursor: null });
        assert.equal(call.url, '/api/universes/uni-1/hexes/spin/1910/remove');
        assert.deepEqual(call.body, { baseRev: 1 });
        return json(absent(KEY, 'own'));
    });
    const map = open(fetchImpl, clock(), { truthVersion: null });
    await map.loadSector('spin');
    map.remove([KEY]);
    assert.equal(map.row(KEY), null);
    assert.equal(map.hexView(KEY, null).state, 'empty');
    await map.flushMap();
    assert.equal(map.row(KEY), null);
    map.close();
});

test('a second change during a save adopts the applied rev and goes out on its own', async () => {
    let release = () => {};
    let held = false;
    let holding = true;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        const baseRev = call.body.baseRev;
        return (async () => {
            if (holding) {
                holding = false;
                held = true;
                await new Promise((resolve) => { release = resolve; });
            }
            if (call.url.endsWith('/remove')) return json(row({ state: 'removed', treeHash: null, rev: baseRev + 1 }));
            return json(absent());
        })();
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    map.remove([KEY]);
    const first = map.flushMap();
    while (!held) await Promise.resolve();
    map.restore([KEY]);
    assert.equal(map.row(KEY), null);
    release();
    await first;
    const posts = () => fetchImpl.calls.filter((call) => call.method === 'POST');
    assert.equal(posts().length, 1);
    assert.equal(posts()[0].url.endsWith('/remove'), true);
    assert.deepEqual(posts()[0].body, { baseRev: 1 });
    assert.equal(time.armed().length, 1);
    assert.equal(time.armed()[0].ms, 800);
    await map.flushMap();
    assert.equal(posts().length, 2);
    assert.equal(posts()[1].url.endsWith('/restore'), true);
    assert.deepEqual(posts()[1].body, { baseRev: 2 });
    map.close();
});

test('a remove queued while generate is in flight names the rev generate applied', async () => {
    let release = () => {};
    let held = false;
    const kept = row({ rev: 5, roll: 1, treeHash: HASH2 });
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/generate')) {
            return (async () => {
                held = true;
                await new Promise((resolve) => { release = resolve; });
                return json({ rows: [kept], skipped: [] });
            })();
        }
        if (call.url.endsWith('/remove')) {
            assert.deepEqual(call.body, { baseRev: 5 });
            return json(row({ state: 'removed', treeHash: null, rev: 6 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const handle = map.generate({ hexKeys: [KEY], edition: 'MgT2E', generator: 'bottom-up', roll: 1, filledToo: false });
    while (!held) await Promise.resolve();
    map.remove([KEY]);
    release();
    await handle.finished;
    assert.equal(map.row(KEY), null);
    await map.flushMap();
    assert.equal(map.row(KEY).state, 'removed');
    assert.equal(map.row(KEY).rev, 6);
    map.close();
});

test('a conflict replaces the local row and drops the change behind it', async () => {
    clearToasts();
    const current = row({ rev: 4, treeHash: HASH2 });
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        return fail(409, 'The hex changed.', { current });
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    map.remove([KEY]);
    await map.flushMap();
    assert.equal(map.row(KEY).rev, 4);
    assert.equal(map.row(KEY).treeHash, HASH2);
    assert.equal(map.pending.value, false);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].message, /server copy/);
    map.close();
    assert.equal(toasts.length, 0);
});

test('a failed save is put back and retried', async () => {
    let down = true;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (down) {
            down = false;
            throw new Error('network');
        }
        assert.deepEqual(call.body, { baseRev: 1 });
        return json(row({ state: 'removed', treeHash: null, rev: 2 }));
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    map.remove([KEY]);
    await map.flushMap();
    assert.equal(map.lastError.value, 'network');
    assert.equal(map.pending.value, true);
    assert.equal(time.armed().length, 1);
    assert.equal(time.armed()[0].ms, 800);
    await map.flushMap();
    assert.equal(map.lastError.value, '');
    assert.equal(map.row(KEY).state, 'removed');
    assert.equal(map.pending.value, false);
    map.close();
});

test('page hide flushes the queue', async () => {
    const previous = globalThis.document;
    const listeners = new Map();
    globalThis.document = {
        visibilityState: 'visible',
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name) { listeners.delete(name); },
    };
    try {
        const fetchImpl = fake((call) => {
            if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
            return json(row({ state: 'removed', treeHash: null, rev: 2 }));
        });
        const map = open(fetchImpl, clock());
        await map.loadSector('spin');
        map.remove([KEY]);
        listeners.get('pagehide')();
        await map.flushMap();
        assert.equal(fetchImpl.calls.filter((call) => call.url.endsWith('/remove')).length, 1);
        assert.equal(map.row(KEY).state, 'removed');
        map.close();
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
});

test('removing a chart system that was never touched writes a removed row at baseRev 0', async () => {
    const chartHash = HASH;
    const removed = row({ state: 'removed', treeHash: null, baseHash: chartHash, rev: 1, roll: 0 });
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/remove')) {
            assert.deepEqual(call.body, { baseRev: 0 });
            return json(removed);
        }
        if (call.url.endsWith('/revert')) {
            assert.deepEqual(call.body, { toRev: 0, baseRev: 1 });
            return json(absent());
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const truth = chart();
    truth.tree = chartHash;
    const token = map.remove([KEY], () => truth);
    assert.equal(map.hexView(KEY, truth).state, 'removed');
    assert.equal(map.hexView(KEY, truth).entry.name, 'Regina');
    assert.equal(map.row(KEY).baseHash, chartHash);
    await map.flushMap();
    assert.equal(map.row(KEY).state, 'removed');
    assert.equal(map.row(KEY).rev, 1);
    await map.undo(token);
    assert.equal(map.row(KEY), null);
    assert.equal(map.hexView(KEY, truth).state, 'truth');
    map.close();
});

test('the screen seam keeps a preview by generating that roll', async () => {
    const envelope = { kind: 'tree', body: { marker: true } };
    const fetchImpl = fake((call) => {
        if (call.url === '/api/generate/preview') return json({ envelope, hash: HASH2 });
        if (call.url.endsWith('/generate')) {
            assert.equal(call.body.roll, 4);
            assert.equal(call.body.filledToo, true);
            assert.equal(call.body.edition, 'MgT2E');
            assert.equal(call.body.baseRev, 0);
            return json({ rows: [row({ roll: 4, rev: 1, treeHash: HASH2 })], skipped: [] });
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    const screen = asBuildStore(map);
    const made = await screen.preview(KEY, { engine: 'MgT2E', generator: 'top-down' }, 4, null);
    assert.equal(made.tree, envelope);
    assert.equal(made.entry.name, '');
    assert.equal(map.row(KEY), null);
    await screen.keep(made, null);
    assert.equal(screen.row(KEY).roll, 4);
    assert.equal(screen.row(KEY).entry, null);
    map.close();
});

test('blank posts only the row rev', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/blank')) {
            assert.deepEqual(call.body, { baseRev: 0 });
            assert.equal(Object.keys(call.body).join(','), 'baseRev');
            return json(row({ rev: 1, treeHash: HASH2, state: 'own' }));
        }
        if (call.url.endsWith('/form')) {
            return json({
                hash: HASH2,
                form: { sections: [{ id: 'name', label: 'Name', fields: [{ id: 'name.system', label: 'Name', kind: 'text', permission: 'type', value: '', options: [] }] }] },
            });
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const opened = await map.blank(KEY);
    assert.equal(opened.draft.dirty.value, false);
    assert.equal(map.row(KEY).rev, 1);
    assert.equal(fetchImpl.calls.filter((call) => call.url.endsWith('/blank')).length, 1);
    map.close();
});

const HOME = '~0123456789ABCDEFGHJKMNPQRS';
const TAKEN = '~0123456789ABCDEFGHJKMNPQRT';
const SLOT_KEY = '~slot_4_-7/0101';
const HOME_KEY = HOME + '/0101';

function blankNames() {
    return ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
}

function madeSector(over = {}) {
    return {
        id: HOME,
        slot: { x: 4, y: -7 },
        name: 'Far',
        subsectors: blankNames(),
        rev: 1,
        deleted: false,
        ...over,
    };
}

function growBody(hexKeys) {
    return {
        hexKeys,
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
        makeSectors: [{ name: 'Far', slot: { x: 4, y: -7 } }],
    };
}

/** A grow poll that misses Undo waits on the fake clock and never ends. */
function until(promise) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The grow test hung.')), 1000);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function doneJob(over = {}) {
    return job({ id: 'job-1', state: 'done', total: 2, done: 2, finishedAt: STAMP, ...over });
}

function nearSector() {
    return madeSector({ id: TAKEN, slot: { x: 5, y: 0 }, name: 'Near', rev: 2 });
}

test('generateGrowing posts one generate with makeSectors, and baseRev only for one hex', async () => {
    const posts = [];
    const fetchImpl = fake((call) => {
        if (call.method === 'POST' && call.url.endsWith('/generate')) posts.push(call.body);
        if (call.url.includes('/jobs/')) return json(doneJob());
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/generate')) {
            const count = call.body.hexKeys.length;
            return json({
                sectors: [madeSector()],
                rows: count === 1 ? [row({ hexKey: call.body.hexKeys[0], rev: 2 })] : [],
                skipped: [],
                jobId: count === 1 ? null : 'job-1',
            }, count === 1 ? 201 : 202);
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    const screen = asBuildStore(map);
    const started = screen.generateGrowing(growBody([KEY, SLOT_KEY]));
    await started.accepted;
    await started.finished;
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].makeSectors, [{ name: 'Far', slot: { x: 4, y: -7 } }]);
    assert.equal(Object.hasOwn(posts[0], 'baseRev'), false);
    map.close();

    const oneSlot = open(fetchImpl, clock());
    const slotAct = oneSlot.generateGrowing(growBody([SLOT_KEY]));
    await slotAct.accepted;
    await slotAct.finished;
    assert.equal(posts[1].baseRev, 0);
    assert.deepEqual(posts[1].hexKeys, [SLOT_KEY]);
    oneSlot.close();

    const prior = row({ rev: 4 });
    const withRow = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [prior], nextCursor: null });
        if (call.method === 'POST' && call.url.endsWith('/generate')) {
            posts.push(call.body);
            return json({
                sectors: [madeSector()],
                rows: [row({ hexKey: KEY, rev: 5 })],
                skipped: [],
                jobId: null,
            }, 201);
        }
        throw new Error('unexpected ' + call.url);
    });
    const held = open(withRow, clock());
    await held.loadSector('spin');
    const act = held.generateGrowing(growBody([KEY]));
    await act.accepted;
    await act.finished;
    assert.equal(posts[2].baseRev, 4);
    assert.equal(posts.length, 3);
    held.close();
});

test('a grow answer lands the rows and remaps slot keys before accepted resolves', async () => {
    const otherSlot = '~slot_5_0/0202';
    const fetchImpl = fake((call) => {
        if (call.url.includes('/jobs/')) return json(doneJob({ total: 2, done: 2 }));
        if (call.url.includes('sector=' + encodeURIComponent(HOME))) {
            return json({ items: [row({ hexKey: HOME_KEY, rev: 3 })], nextCursor: null });
        }
        if (call.url.includes('sector=' + encodeURIComponent(TAKEN))) {
            return json({ items: [row({ hexKey: TAKEN + '/0202', rev: 4 })], nextCursor: null });
        }
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/generate')) {
            const queued = call.body.hexKeys.length > 1;
            return json({
                sectors: queued ? [madeSector(), nearSector()] : [madeSector()],
                rows: queued ? [] : [row({ hexKey: HOME_KEY, rev: 2 })],
                skipped: [],
                jobId: queued ? 'job-1' : null,
            }, queued ? 202 : 201);
        }
        throw new Error('unexpected ' + call.url);
    });
    const inline = open(fetchImpl, clock());
    const one = inline.generateGrowing(growBody([SLOT_KEY]));
    const seen = one.accepted.then((opened) => ({
        id: inline.sectors().get(HOME)?.id ?? null,
        rev: inline.row(HOME_KEY)?.rev ?? null,
        keys: opened.keys,
    }));
    const opened = await one.accepted;
    const snap = await seen;
    assert.equal(snap.id, HOME);
    assert.equal(snap.rev, 2);
    assert.deepEqual(snap.keys, { [SLOT_KEY]: HOME_KEY });
    assert.equal(opened.sectors[0].id, HOME);
    await one.finished;
    inline.close();

    const queued = open(fetchImpl, clock());
    const body = growBody([SLOT_KEY, otherSlot]);
    body.makeSectors = [
        { name: 'Far', slot: { x: 4, y: -7 } },
        { name: 'Near', slot: { x: 5, y: 0 } },
    ];
    const many = queued.generateGrowing(body);
    const atAccept = many.accepted.then(() => ({
        far: queued.sectors().get(HOME)?.slot.y ?? null,
        near: queued.sectors().get(TAKEN)?.name ?? null,
        row: queued.row(HOME_KEY),
    }));
    const accepted = await many.accepted;
    const mid = await atAccept;
    assert.equal(mid.far, -7);
    assert.equal(mid.near, 'Near');
    assert.equal(mid.row, null);
    assert.deepEqual(accepted.keys, {
        [SLOT_KEY]: HOME_KEY,
        [otherSlot]: TAKEN + '/0202',
    });
    await many.finished;
    assert.equal(queued.row(HOME_KEY).rev, 3);
    assert.equal(queued.row(TAKEN + '/0202').rev, 4);
    queued.close();
});

test('undo of a grow token posts sectors/undo-generate as soon as accepted resolves', async () => {
    const posts = [];
    const fetchImpl = fake((call) => {
        if (call.url.includes('/jobs/') && !call.url.endsWith('/undo-generate')) {
            return json(job({ id: 'job-1', state: 'running', total: 2, done: 0 }));
        }
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/undo-generate')) {
            posts.push({ url: call.url, body: call.body });
            return json({ sectors: [], restored: 0, hexes: [] });
        }
        if (call.url.endsWith('/generate')) {
            const queued = call.body.hexKeys.length > 1;
            return json({
                sectors: [madeSector()],
                rows: queued ? [] : [row({ hexKey: HOME_KEY, rev: 2 })],
                skipped: [],
                jobId: queued ? 'job-1' : null,
            }, queued ? 202 : 201);
        }
        throw new Error('unexpected ' + call.url);
    });
    const inline = open(fetchImpl, clock());
    const one = inline.generateGrowing(growBody([SLOT_KEY]));
    const opened = await one.accepted;
    await one.finished;
    await inline.undo(opened.undo);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, '/api/universes/uni-1/sectors/undo-generate');
    assert.deepEqual(posts[0].body, { sectorId: HOME, baseRev: 1 });
    inline.close();

    const running = open(fetchImpl, clock());
    const act = running.generateGrowing(growBody([KEY, SLOT_KEY]));
    const accepted = await act.accepted;
    const undoing = running.undo(accepted.undo);
    await until(act.finished);
    await until(undoing);
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[1].body, { jobId: 'job-1' });
    assert.equal(posts[1].url, '/api/universes/uni-1/sectors/undo-generate');
    assert.equal(fetchImpl.calls.some((call) => call.url.includes('/jobs/') && call.url.endsWith('/undo')), false);
    running.close();
});

test('undo during a running grow job resolves finished as stopped', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/jobs/') && !call.url.endsWith('/undo-generate')) {
            return json(job({ id: 'job-1', state: 'running', total: 2, done: 0 }));
        }
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/undo-generate')) return json({ sectors: [], restored: 0, hexes: [] });
        if (call.url.endsWith('/generate')) {
            return json({ sectors: [madeSector()], rows: [], skipped: [], jobId: 'job-1' }, 202);
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    const act = map.generateGrowing(growBody([KEY, SLOT_KEY]));
    const opened = await act.accepted;
    const undoing = map.undo(opened.undo);
    const done = await until(act.finished);
    await until(undoing);
    assert.equal(done.progress.state, 'stopped');
    assert.equal(done.undo.id, opened.undo.id);
    map.close();
});

test('undo of a grow drops the made sector and its rows, and reloads the old slug', async () => {
    let undone = false;
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/undo-generate')) {
            undone = true;
            return json({
                sectors: [{ id: HOME, toRev: 1, baseRev: 1 }],
                restored: 0,
                hexes: [{ hexKey: KEY, toRev: 4, baseRev: 4 }],
            });
        }
        if (call.url.includes('/jobs/') && !call.url.endsWith('/undo-generate')) {
            return json(job({ id: 'job-1', state: 'running', total: 2, done: 0 }));
        }
        if (call.url.includes('sector=spin')) {
            return json({ items: [row({ rev: undone ? 9 : 4 })], nextCursor: null });
        }
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/generate')) {
            return json({
                sectors: [madeSector()],
                rows: [row({ hexKey: HOME_KEY, rev: 2 })],
                skipped: [],
                jobId: 'job-1',
            }, 202);
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    const act = map.generateGrowing(growBody([KEY, SLOT_KEY]));
    const opened = await act.accepted;
    assert.equal(map.sectors().get(HOME).name, 'Far');
    assert.equal(map.row(HOME_KEY).rev, 2);
    const before = fetchImpl.calls.filter((call) => call.url.includes('sector=spin')).length;
    const undoing = map.undo(opened.undo);
    await until(act.finished);
    await until(undoing);
    assert.equal(map.sectors().get(HOME), null);
    assert.equal(map.row(HOME_KEY), null);
    assert.equal(map.row(KEY).rev, 9);
    assert.ok(fetchImpl.calls.filter((call) => call.url.includes('sector=spin')).length > before);
    map.close();
});

test('undo of a grow returns a Restore token, and a bad answer returns null', async () => {
    const broken = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/undo-generate')) return json({ restored: 0 });
        if (call.url.endsWith('/generate')) {
            return json({
                sectors: [madeSector()],
                rows: [row({ hexKey: HOME_KEY, rev: 2 })],
                skipped: [],
                jobId: null,
            }, 201);
        }
        throw new Error('unexpected ' + call.url);
    });
    const bad = open(broken, clock());
    const failed = bad.generateGrowing(growBody([SLOT_KEY]));
    const failedOpen = await failed.accepted;
    await failed.finished;
    assert.equal(await bad.undo(failedOpen.undo), null);
    assert.equal(bad.sectors().get(HOME), null);
    assert.equal(bad.row(HOME_KEY), null);
    bad.close();

    const posts = [];
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/undo-generate')) {
            return json({
                sectors: [{ id: HOME, toRev: 1, baseRev: 2 }],
                restored: 1,
                hexes: [{ hexKey: KEY, toRev: 3, baseRev: 4 }],
            });
        }
        if (call.url.endsWith('/sectors/' + HOME + '/undo') || call.url.endsWith('/revert')) {
            posts.push({ url: call.url, body: call.body });
            if (call.url.endsWith('/undo')) return json(madeSector({ rev: 2 }));
            return json(row({ rev: 8 }));
        }
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/generate')) {
            return json({
                sectors: [madeSector()],
                rows: [row({ hexKey: HOME_KEY, rev: 2 }), row({ hexKey: KEY, rev: 5 })],
                skipped: [],
                jobId: null,
            }, 201);
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    const act = map.generateGrowing(growBody([KEY, SLOT_KEY]));
    const opened = await act.accepted;
    await act.finished;
    const restore = await map.undo(opened.undo);
    assert.equal(typeof restore?.id, 'string');
    assert.notEqual(restore.id, opened.undo.id);
    assert.equal(await map.undo(restore), null);
    assert.deepEqual(posts.map((call) => call.url), [
        '/api/universes/uni-1/sectors/' + HOME + '/undo',
        '/api/universes/uni-1/hexes/spin/1910/revert',
    ]);
    assert.deepEqual(posts[0].body, { toRev: 1, baseRev: 2 });
    assert.deepEqual(posts[1].body, { toRev: 3, baseRev: 4 });
    const screenMap = open(fetchImpl, clock());
    const screen = asBuildStore(screenMap);
    const shown = screen.generateGrowing(growBody([SLOT_KEY]));
    const shownOpen = await shown.accepted;
    await shown.finished;
    const wrapped = await screen.undo(shownOpen.undo);
    assert.equal(typeof wrapped?.id, 'string');
    assert.notEqual(wrapped.id, shownOpen.undo.id);
    screenMap.close();
    map.close();
});

test('a grow error is the server message, and a taken slot lands that sector', async () => {
    const refused = fake((call) => {
        if (call.url.endsWith('/generate')) return fail(400, 'The sector name is taken.');
        throw new Error('unexpected ' + call.url);
    });
    const map = open(refused, clock());
    const act = map.generateGrowing(growBody([SLOT_KEY]));
    const settled = await Promise.allSettled([act.accepted, act.finished]);
    assert.equal(settled[0].status, 'rejected');
    assert.equal(settled[1].status, 'rejected');
    assert.equal(settled[0].reason.message, 'The sector name is taken.');
    assert.equal(settled[1].reason.message, 'The sector name is taken.');
    assert.equal(map.sectors().list().length, 0);
    map.close();

    const taken = fake((call) => {
        if (call.url.endsWith('/generate')) return fail(409, 'That slot is in use.', { current: madeSector({ name: 'Occupied', rev: 6 }) });
        throw new Error('unexpected ' + call.url);
    });
    const held = open(taken, clock());
    const clash = held.generateGrowing(growBody([SLOT_KEY]));
    const clashSettled = await Promise.allSettled([clash.accepted, clash.finished]);
    assert.equal(clashSettled[0].reason.message, 'That slot is in use.');
    assert.equal(clashSettled[1].reason.message, 'That slot is in use.');
    assert.equal(held.sectors().get(HOME).name, 'Occupied');
    assert.equal(held.sectors().get(HOME).rev, 6);
    held.close();

    const other = fake((call) => {
        if (call.url.endsWith('/generate')) return fail(409, 'The sector changed.', { current: madeSector() });
        throw new Error('unexpected ' + call.url);
    });
    const left = open(other, clock());
    const missed = left.generateGrowing(growBody([SLOT_KEY]));
    const missedSettled = await Promise.allSettled([missed.accepted, missed.finished]);
    assert.equal(missedSettled[0].reason.message, 'The sector changed.');
    assert.equal(left.sectors().list().length, 0);
    left.close();
});

test('generate and its undo still omit makeSectors and return null', async () => {
    const posts = [];
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/generate')) {
            posts.push(call.body);
            return json({ jobId: 'job-9' });
        }
        if (call.url.includes('/jobs/job-9') && call.method === 'GET') return json(doneJob({ id: 'job-9' }));
        if (call.url.endsWith('/jobs/job-9/undo')) {
            posts.push({ url: call.url, body: call.body });
            return json({ restored: 0, conflicts: [] });
        }
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    const done = await map.generate({
        hexKeys: [KEY, OTHER],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
    }).finished;
    assert.equal(Object.hasOwn(posts[0], 'makeSectors'), false);
    assert.equal(Object.hasOwn(posts[0], 'baseRev'), false);
    assert.deepEqual(posts[0].hexKeys, [KEY, OTHER]);
    const back = await map.undo(done.undo);
    assert.equal(back, null);
    assert.equal(posts[1].url, '/api/universes/uni-1/jobs/job-9/undo');
    assert.deepEqual(posts[1].body, {});
    assert.equal(fetchImpl.calls.some((call) => call.url.endsWith('/undo-generate')), false);
    map.close();
});