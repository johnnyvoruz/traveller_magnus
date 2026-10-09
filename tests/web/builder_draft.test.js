/**
 * The edit draft against a fake transport. Nothing is stored until Keep.
 * An older draft answer is dropped. Keep uses the map queue's rev.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDraft } from '../../apps/web/src/builder/draft.ts';
import { openMap } from '../../apps/web/src/builder/store.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';

const KEY = 'spin/1910';
const HASH = 'ab'.repeat(32);
const HASH2 = 'cd'.repeat(32);
const STAMP = '2026-10-08T00:00:00.000Z';

function field(id, value, permission = 'type', kind = 'text') {
    return { id, label: id, kind, permission, value, options: [] };
}

function form(fields, edition = 'MgT2E') {
    return { edition, sections: [{ id: 'name', label: 'Name', fields }] };
}

function read(fields = [field('name.system', 'Regina'), field('system.age', 4, 'roll', 'number'), field('rule.R1', '', 'read')]) {
    return { hash: HASH, form: form(fields) };
}

function answer(fields, changed = [], messages = []) {
    return { form: form(fields), changed, messages };
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

function fire(time) {
    const item = time.armed()[0];
    assert.ok(item, 'a draft timer');
    item.dead = true;
    item.fn();
}

function fake(handler) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const call = { url, method: init.method, body, credentials: init.credentials };
        calls.push(call);
        return handler(call, calls);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

function open(fetchImpl, time) {
    return openMap({
        fetch: fetchImpl,
        schedule: time.schedule.bind(time),
        truthVersion: 'v9',
        universeId: 'uni-1',
        universeName: 'Mine',
        seed: 'TravellerMagnus',
        settings: { generationPopMax: 1 },
    });
}

function posts(fetchImpl) {
    return fetchImpl.calls.filter((call) => call.method === 'POST');
}

async function until(ready) {
    for (let i = 0; i < 50 && !ready(); i += 1) await Promise.resolve();
    assert.equal(ready(), true);
}

test('openDraft needs the signed-in map', () => {
    assert.throws(() => openDraft(KEY), /offline/);
});

test('a draft stays local until Keep, and two edits leave as one call', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) {
            assert.equal(call.body.hash, HASH);
            assert.deepEqual(call.body.changes, [
                { id: 'name.system', value: 'Regina Prime' },
                { id: 'system.age', value: 5 },
            ]);
            assert.equal(call.body.roll, undefined);
            return json(answer(
                [field('name.system', 'Regina Prime'), field('system.age', 5, 'roll', 'number'), field('rule.R1', '', 'read')],
                [{ id: 'body.0.orbit', why: 'Age changed.' }],
            ));
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.form.value.sections[0].fields[0].value, 'Regina');
    draft.set('rule.R1', 'checked');
    assert.equal(draft.dirty.value, false);
    assert.equal(time.armed().length, 0);
    draft.set('name.system', 'Regina Prime');
    draft.set('system.age', 5);
    assert.equal(draft.dirty.value, true);
    assert.equal(draft.form.value.sections[0].fields[0].value, 'Regina Prime');
    assert.equal(posts(fetchImpl).length, 0);
    assert.equal(time.armed().length, 1);
    assert.equal(time.armed()[0].ms, 800);
    fire(time);
    await until(() => posts(fetchImpl).some((call) => call.url.endsWith('/draft')));
    await until(() => draft.changedByEngine.value.length === 1);
    assert.deepEqual(draft.changedByEngine.value, [{ id: 'body.0.orbit', why: 'Age changed.' }]);
    assert.equal(posts(fetchImpl).some((call) => call.url.endsWith('/keep')), false);
    map.close();
});

test('an older draft answer is dropped', async () => {
    let release = () => {};
    let held = false;
    let drafts = 0;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) {
            drafts += 1;
            if (drafts === 1) {
                return (async () => {
                    held = true;
                    await new Promise((resolve) => { release = resolve; });
                    return json(answer(
                        [field('name.system', 'One')],
                        [{ id: 'name.system', why: 'stale' }],
                    ));
                })();
            }
            return json(answer(
                [field('name.system', 'Two')],
                [{ id: 'name.system', why: 'fresh' }],
            ));
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'One');
    fire(time);
    await until(() => held);
    draft.set('name.system', 'Two');
    fire(time);
    await until(() => draft.changedByEngine.value[0] && draft.changedByEngine.value[0].why === 'fresh');
    release();
    await until(() => drafts === 2);
    await Promise.resolve();
    assert.equal(draft.changedByEngine.value[0].why, 'fresh');
    assert.equal(draft.form.value.sections[0].fields[0].value, 'Two');
    map.close();
});

test('discard throws the local draft away and ignores a late answer', async () => {
    let release = () => {};
    let held = false;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) {
            return (async () => {
                held = true;
                await new Promise((resolve) => { release = resolve; });
                return json(answer([field('name.system', 'Gone')], [{ id: 'name.system', why: 'late' }]));
            })();
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Gone');
    assert.equal(time.armed().length, 1);
    draft.discard();
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.form.value.sections[0].fields[0].value, 'Regina');
    assert.equal(time.armed().length, 0);
    assert.equal(posts(fetchImpl).length, 0);
    draft.set('name.system', 'Gone');
    fire(time);
    await until(() => held);
    draft.discard();
    release();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.changedByEngine.value.length, 0);
    assert.equal(draft.form.value.sections[0].fields[0].value, 'Regina');
    assert.equal(posts(fetchImpl).some((call) => call.url.endsWith('/keep')), false);
    map.close();
});

test('roll again sends the id, and typing that field clears the roll', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) {
            return json(answer(
                [field('name.system', 'Regina'), field('system.age', 7, 'roll', 'number'), field('rule.R1', '', 'read')],
                [{ id: 'system.age', why: 'Rolled again.' }],
            ));
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.rollAgain('system.age');
    draft.rollAgain('system.age');
    fire(time);
    await until(() => posts(fetchImpl).some((call) => call.url.endsWith('/draft')));
    const first = posts(fetchImpl).find((call) => call.url.endsWith('/draft'));
    assert.deepEqual(first.body, { hash: HASH, changes: [], roll: [{ id: 'system.age' }] });
    await until(() => draft.changedByEngine.value.length === 1);
    draft.set('system.age', 5);
    fire(time);
    await until(() => posts(fetchImpl).filter((call) => call.url.endsWith('/draft')).length === 2);
    const second = posts(fetchImpl).filter((call) => call.url.endsWith('/draft'))[1];
    assert.deepEqual(second.body, { hash: HASH, changes: [{ id: 'system.age', value: 5 }] });
    map.close();
});

test('Keep sends one save on the queue and lands the row', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) return json(answer([field('name.system', 'Regina Prime')]));
        if (call.url.endsWith('/keep')) {
            assert.deepEqual(call.body, {
                hash: HASH,
                baseRev: 1,
                changes: [{ id: 'name.system', value: 'Regina Prime' }],
            });
            return json(row({ rev: 2, treeHash: HASH2 }));
        }
        if (call.url.endsWith('/revert')) {
            assert.deepEqual(call.body, { toRev: 1, baseRev: 2 });
            return json(row({ rev: 3 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Regina Prime');
    const undo = await draft.keep();
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.conflict.value, null);
    assert.equal(map.row(KEY).rev, 2);
    assert.equal(map.row(KEY).treeHash, HASH2);
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/keep')).length, 1);
    await map.undo(undo);
    assert.equal(map.row(KEY).rev, 3);
    map.close();
});

test('Keep waits for a save already in flight and uses the rev it applied', async () => {
    let release = () => {};
    let held = false;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) return json(answer([field('name.system', 'Regina Prime')]));
        if (call.url.endsWith('/remove')) {
            return (async () => {
                held = true;
                await new Promise((resolve) => { release = resolve; });
                return json(row({ rev: 2, state: 'removed', treeHash: null }));
            })();
        }
        if (call.url.endsWith('/keep')) {
            assert.equal(call.body.baseRev, 2);
            assert.equal(call.body.hash, HASH);
            return json(row({ rev: 3, treeHash: HASH2 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    map.remove([KEY]);
    const flight = map.flushMap();
    await until(() => held);
    draft.set('name.system', 'Regina Prime');
    const kept = draft.keep();
    await until(() => posts(fetchImpl).some((call) => call.url.endsWith('/draft')));
    release();
    await flight;
    await kept;
    assert.equal(map.row(KEY).rev, 3);
    assert.equal(map.row(KEY).treeHash, HASH2);
    map.close();
});

test('a conflict offers the server row and the next Keep uses its rev', async () => {
    clearToasts();
    let conflicted = true;
    const current = row({ rev: 4, treeHash: HASH2 });
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) return json(answer([field('name.system', 'Mine')]));
        if (call.url.endsWith('/keep')) {
            if (conflicted) {
                conflicted = false;
                assert.equal(call.body.baseRev, 1);
                return fail(409, 'The hex changed.', { current });
            }
            assert.equal(call.body.baseRev, 4);
            assert.equal(call.body.hash, HASH);
            assert.deepEqual(call.body.changes, [{ id: 'name.system', value: 'Mine' }]);
            return json(row({ rev: 5, treeHash: HASH2 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Mine');
    const first = await draft.keep();
    assert.equal(first, null);
    assert.equal(draft.dirty.value, true);
    assert.equal(draft.conflict.value.rev, 4);
    assert.equal(draft.conflict.value.treeHash, HASH2);
    assert.equal(map.row(KEY).rev, 4);
    assert.equal(toasts.length, 0);
    const second = await draft.keep();
    assert.ok(second);
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.conflict.value, null);
    assert.equal(map.row(KEY).rev, 5);
    map.close();
});

test('a message that holds blocks Keep', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) {
            return json(answer(
                [field('name.system', 'Regina')],
                [],
                [{ id: 'star.0.type', text: 'The generator refused this hex.', holds: true }],
            ));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Regina Prime');
    await assert.rejects(() => draft.keep(), /refused this hex/);
    assert.equal(draft.dirty.value, true);
    assert.equal(posts(fetchImpl).some((call) => call.url.endsWith('/keep')), false);
    assert.equal(draft.messages.value[0].holds, true);
    map.close();
});

test('Keep surfaces a validation refusal from the save itself', async () => {
    const messages = [{ id: null, text: 'The engine could not build this system.', holds: true }];
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) return json(answer([field('name.system', 'Regina Prime')]));
        if (call.url.endsWith('/keep')) return fail(400, 'The engine could not build this system.', { messages });
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Regina Prime');
    await assert.rejects(() => draft.keep(), /could not build/);
    assert.equal(draft.dirty.value, true);
    assert.equal(draft.messages.value[0].holds, true);
    assert.equal(map.row(KEY).rev, 1);
    map.close();
});
