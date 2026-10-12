/**
 * The edit draft against a fake transport. Nothing is stored until Keep.
 * An older draft answer is dropped. Keep uses the map queue's rev.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDraft } from '../../apps/web/src/builder/draft.ts';
import { openMap } from '../../apps/web/src/builder/store.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';
import { handChangeCount } from '../../apps/web/src/workspace/build/hand.ts';

const KEY = 'spin/1910';
const HASH = 'ab'.repeat(32);
const HASH2 = 'cd'.repeat(32);
const STAMP = '2026-10-08T00:00:00.000Z';

function field(id, value, permission = 'type', kind = 'text', label = id) {
    return { id, label, kind, permission, value, options: [] };
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
    const current = row({ rev: 4, treeHash: HASH });
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read());
        if (call.url.endsWith('/draft')) return json(answer([field('name.system', 'Mine')]));
        if (call.url.endsWith('/keep')) {
            if (conflicted) {
                conflicted = false;
                assert.equal(call.body.baseRev, 1);
                return fail(409, 'This hex changed. Reload it, then try again.', { current });
            }
            assert.equal(call.body.baseRev, 4);
            assert.equal(call.body.hash, HASH);
            assert.deepEqual(call.body.changes, [{ id: 'name.system', value: 'Mine' }]);
            return json(row({ rev: 5, treeHash: HASH }));
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
    assert.equal(draft.replaced.value, false);
    assert.equal(draft.conflict.value.rev, 4);
    assert.equal(draft.conflict.value.treeHash, HASH);
    assert.equal(map.row(KEY).rev, 4);
    assert.equal(toasts.length, 0);
    const second = await draft.keep();
    assert.ok(second);
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.conflict.value, null);
    assert.equal(map.row(KEY).rev, 5);
    map.close();
});

test('Keep mine re-reads the newer tree and does not resend the old hash', async () => {
    const newer = [
        field('name.system', 'Theirs', 'type', 'text', 'Name'),
        field('system.age', 4, 'roll', 'number', 'Age'),
    ];
    let forms = 0;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) {
            forms += 1;
            if (forms === 1) {
                return json(read([
                    field('name.system', 'Regina', 'type', 'text', 'Name'),
                    field('profile.s', 5, 'type', 'number', 'Size'),
                    field('system.age', 4, 'roll', 'number', 'Age'),
                ]));
            }
            return json({ hash: HASH2, form: form(newer) });
        }
        if (call.url.endsWith('/draft')) {
            if (call.body.hash === HASH2) {
                assert.deepEqual(call.body.changes, [{ id: 'name.system', value: 'Mine' }]);
                assert.deepEqual(call.body.roll, [{ id: 'system.age' }]);
                return json(answer(
                    [field('name.system', 'Mine', 'type', 'text', 'Name'), field('system.age', 9, 'roll', 'number', 'Age')],
                    [{ id: 'system.age', why: 'Rolled again.' }],
                ));
            }
            return json(answer([field('name.system', 'Mine', 'type', 'text', 'Name')]));
        }
        if (call.url.endsWith('/keep')) {
            if (call.body.hash === HASH) return fail(409, 'This hex changed. Reload it, then try again.', { current: row({ rev: 4, treeHash: HASH2 }) });
            assert.equal(call.body.hash, HASH2);
            assert.equal(call.body.baseRev, 4);
            assert.deepEqual(call.body.changes, [{ id: 'name.system', value: 'Mine' }]);
            return json(row({ rev: 5, treeHash: HASH2 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Mine');
    draft.set('profile.s', 8);
    draft.rollAgain('system.age');
    draft.rollAgain('body.2');
    const blocked = await draft.keep();
    assert.equal(blocked, null);
    assert.equal(draft.replaced.value, true);
    const again = await draft.keep();
    assert.equal(again, null);
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/keep')).length, 1);
    await draft.keepMine();
    assert.equal(draft.replaced.value, false);
    assert.equal(draft.conflict.value, null);
    assert.equal(draft.dirty.value, true);
    assert.deepEqual(draft.dropped.value, [
        { id: 'profile.s', label: 'Size' },
        { id: 'body.2', label: 'body.2' },
    ]);
    assert.equal(draft.changedByEngine.value[0].why, 'Rolled again.');
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/keep')).length, 1);
    const saved = await draft.keep();
    assert.ok(saved);
    assert.equal(draft.dirty.value, false);
    assert.equal(map.row(KEY).rev, 5);
    map.close();
});

test('Take theirs shows the stored form and drops the local draft', async () => {
    let forms = 0;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) {
            forms += 1;
            if (forms === 1) return json(read());
            return json({ hash: HASH2, form: form([field('name.system', 'Theirs', 'type', 'text', 'Name')]) });
        }
        if (call.url.endsWith('/draft')) return json(answer([field('name.system', 'Mine')]));
        if (call.url.endsWith('/keep')) return fail(409, 'This hex changed. Reload it, then try again.', { current: row({ rev: 4, treeHash: HASH2 }) });
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Mine');
    await draft.keep();
    await draft.takeTheirs();
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.conflict.value, null);
    assert.equal(draft.replaced.value, false);
    assert.equal(draft.form.value.sections[0].fields[0].value, 'Theirs');
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/keep')).length, 1);
    map.close();
});

test('a blank system is one save, then the draft of what was stored', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/blank')) {
            assert.deepEqual(call.body, { baseRev: 0 });
            return json(row({ rev: 1, treeHash: HASH2, state: 'own' }));
        }
        if (call.url.endsWith('/form')) return json({ hash: HASH2, form: form([field('name.system', '', 'type', 'text', 'Name')]) });
        if (call.url.endsWith('/revert')) {
            assert.deepEqual(call.body, { toRev: 0, baseRev: 1 });
            return json({ hexKey: KEY, state: 'own', treeHash: null, baseHash: null, roll: 0, rev: 0 });
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const opened = await map.blank(KEY);
    assert.equal(opened.draft.form.value.sections[0].fields[0].label, 'Name');
    assert.equal(opened.draft.dirty.value, false);
    assert.equal(map.row(KEY).rev, 1);
    assert.equal(map.row(KEY).treeHash, HASH2);
    await map.undo(opened.undo);
    assert.equal(map.row(KEY), null);
    map.close();
});

test('a blank sends only the row rev', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row({ state: 'removed', treeHash: null, rev: 2 })], nextCursor: null });
        if (call.url.endsWith('/blank')) {
            assert.deepEqual(call.body, { baseRev: 2 });
            return json(row({ rev: 3, treeHash: HASH2 }));
        }
        if (call.url.endsWith('/form')) return json(read());
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const opened = await map.blank(KEY);
    assert.equal(opened.draft.form.value.edition, 'MgT2E');
    assert.equal(map.row(KEY).rev, 3);
    map.close();
});

test('a blank that loses the race does not open a draft', async () => {
    clearToasts();
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/blank')) return fail(409, 'This hex changed. Reload it, then try again.', { current: row({ rev: 3, treeHash: HASH2 }) });
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    await assert.rejects(() => map.blank(KEY), /hex changed/);
    assert.equal(map.row(KEY).rev, 3);
    assert.equal(toasts.length, 0);
    assert.equal(fetchImpl.calls.some((call) => call.url.endsWith('/form')), false);
    map.close();
});

test('a refused draft names the field and blocks Keep', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read([field('profile.st', 'A', 'type', 'text', 'Starport')]));
        if (call.url.endsWith('/draft')) return fail(400, 'Starport cannot hold that. Type one character.', { code: 'field', id: 'profile.st' });
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('profile.st', 'AA');
    assert.equal(draft.dirty.value, true);
    assert.equal(draft.messages.value.length, 0);
    fire(time);
    await until(() => draft.messages.value.length === 1);
    assert.deepEqual(draft.messages.value[0], {
        id: 'profile.st',
        text: 'Starport cannot hold that. Type one character.',
        holds: true,
    });
    assert.equal(draft.dirty.value, true);
    assert.equal(draft.form.value.sections[0].fields[0].value, 'AA');
    await assert.rejects(() => draft.keep(), /cannot hold that/);
    assert.equal(posts(fetchImpl).some((call) => call.url.endsWith('/keep')), false);
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

test('a hand form keeps its kind, and a parent, an order and an add go out as field ids', async () => {
    const hand = {
        edition: 'MgT2E',
        mode: 'hand',
        sections: [{
            id: 'stars',
            label: 'Stars',
            fields: [
                field('s1.parent', '', 'type', 'text', 'Parent'),
                field('s1.order', 0, 'type', 'number', 'Order'),
                field('star.add', false, 'type', 'switch', 'Add a star'),
            ],
        }],
    };
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json({ hash: HASH, form: hand });
        if (call.url.endsWith('/draft')) return json({ form: hand, changed: [], messages: [] });
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    assert.equal(draft.form.value.mode, 'hand');
    draft.set('s1.parent', 's0');
    draft.set('s1.order', 2);
    draft.set('star.add', true);
    assert.equal(draft.form.value.mode, 'hand');
    fire(time);
    await until(() => posts(fetchImpl).some((call) => call.url.endsWith('/draft')));
    const body = posts(fetchImpl).find((call) => call.url.endsWith('/draft')).body;
    assert.deepEqual(body.changes, [
        { id: 's1.parent', value: 's0' },
        { id: 's1.order', value: 2 },
        { id: 'star.add', value: true },
    ]);
    draft.set('s1.parent', '');
    draft.set('s1.order', 0);
    draft.set('star.add', false);
    assert.equal(draft.dirty.value, false);
    assert.equal(draft.form.value.mode, 'hand');
    map.close();
});

test('several adds stay in call order, count as their own changes, and discard drops them', async () => {
    const expected = [
        { id: 'star.add', value: 's9' },
        { id: 'body.add', value: 'w1' },
        { id: 'w1.kind', value: 'gas' },
        { id: 'w1.parent', value: 's9' },
        { id: 'body.add', value: 'w2' },
        { id: 'w2.name', value: 'Pebble' },
    ];
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read([field('name.system', 'Regina')]));
        if (call.url.endsWith('/draft')) {
            assert.deepEqual(call.body.changes, expected);
            return json(answer([field('name.system', 'Regina')]));
        }
        if (call.url.endsWith('/keep')) {
            assert.deepEqual(call.body.changes, expected);
            return json(row({ rev: 2 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.add('star.add', 's9');
    draft.add('body.add', 'w1');
    draft.set('w1.name', 'Haven');
    assert.equal(draft.dirty.value, true);
    draft.discard();
    assert.equal(draft.dirty.value, false);
    assert.equal(time.armed().length, 0);
    assert.equal(posts(fetchImpl).length, 0);
    draft.add('star.add', 's9');
    draft.add('body.add', 'w1');
    draft.set('w2.name', 'Too soon');
    draft.set('w1.kind', 'gas');
    draft.set('w1.parent', 's9');
    draft.add('body.add', 'w2');
    draft.set('w2.name', 'Pebble');
    draft.set('nope.x', 1);
    assert.equal(draft.dirty.value, true);
    fire(time);
    await until(() => posts(fetchImpl).some((call) => call.url.endsWith('/draft')));
    assert.equal(posts(fetchImpl).find((call) => call.url.endsWith('/draft')).body.changes.length, expected.length);
    const saved = await draft.keep();
    assert.ok(saved);
    assert.equal(draft.dirty.value, false);
    map.close();
});

test('Keep mine carries every add and a field of a body added in this draft', async () => {
    const expected = [
        { id: 'name.system', value: 'Mine' },
        { id: 'star.add', value: 's9' },
        { id: 'body.add', value: 'w1' },
        { id: 'w1.name', value: 'Haven' },
        { id: 'w1.kind', value: 'gas' },
        { id: 'w1.parent', value: 's9' },
        { id: 'body.add', value: 'w2' },
    ];
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) {
            if (call.url && fetchImpl.calls.filter((item) => item.url.endsWith('/form')).length > 1) {
                return json({ hash: HASH2, form: form([field('name.system', 'Theirs', 'type', 'text', 'Name')]) });
            }
            return json(read([
                field('name.system', 'Regina', 'type', 'text', 'Name'),
                field('profile.s', 5, 'type', 'number', 'Size'),
            ]));
        }
        if (call.url.endsWith('/draft')) {
            const drafted = fetchImpl.calls.filter((item) => item.url.endsWith('/draft')).length;
            if (drafted === 1) {
                assert.equal(call.body.changes.some((item) => item.id === 'profile.s'), true);
                assert.equal(call.body.changes.filter((item) => item.id === 'body.add').length, 2);
            } else {
                assert.deepEqual(call.body.changes, expected);
            }
            return json(answer([field('name.system', 'Mine', 'type', 'text', 'Name')]));
        }
        if (call.url.endsWith('/keep')) {
            if (call.body.hash === HASH) {
                assert.equal(call.body.changes.some((item) => item.id === 'profile.s'), true);
                return fail(409, 'This hex changed. Reload it, then try again.', { current: row({ rev: 4, treeHash: HASH2 }) });
            }
            assert.deepEqual(call.body.changes, expected);
            assert.equal(call.body.hash, HASH2);
            assert.equal(call.body.baseRev, 4);
            return json(row({ rev: 5, treeHash: HASH2 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Mine');
    draft.set('profile.s', 8);
    draft.add('star.add', 's9');
    draft.add('body.add', 'w1');
    draft.set('w1.name', 'Haven');
    draft.set('w1.kind', 'gas');
    draft.set('w1.parent', 's9');
    draft.add('body.add', 'w2');
    assert.equal(await draft.keep(), null);
    assert.equal(draft.replaced.value, true);
    await draft.keepMine();
    assert.deepEqual(draft.dropped.value, [{ id: 'profile.s', label: 'Size' }]);
    assert.equal(draft.dirty.value, true);
    assert.equal(draft.replaced.value, false);
    const saved = await draft.keep();
    assert.ok(saved);
    assert.equal(draft.dirty.value, false);
    assert.equal(map.row(KEY).rev, 5);
    map.close();
});

test('unset takes a star, world, or moon remove back and leaves earlier edits', async () => {
    const opening = [
        field('name.system', 'Regina', 'type', 'text', 'Name'),
        field('s1.remove', false, 'type', 'switch', 'Remove'),
        field('b1.remove', false, 'type', 'switch', 'Remove world'),
        field('m1.remove', false, 'type', 'switch', 'Remove moon'),
    ];
    let drafts = 0;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read(opening));
        if (call.url.endsWith('/draft')) {
            drafts += 1;
            if (drafts === 1) {
                assert.deepEqual(call.body.changes, [
                    { id: 'name.system', value: 'Kept' },
                    { id: 'star.add', value: 's9' },
                    { id: 's1.remove', value: true },
                    { id: 'b1.remove', value: true },
                    { id: 'm1.remove', value: true },
                ]);
                return json({
                    form: form([field('name.system', 'Kept', 'type', 'text', 'Name')]),
                    changed: [],
                    messages: [{ id: 's1.remove', text: 'Removing this star also removes 2 bodies.', holds: false }],
                });
            }
            assert.deepEqual(call.body.changes, [
                { id: 'name.system', value: 'Kept' },
                { id: 'star.add', value: 's9' },
            ]);
            return json(answer(opening));
        }
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.set('name.system', 'Kept');
    draft.add('star.add', 's9');
    draft.set('s1.remove', true);
    draft.set('b1.remove', true);
    draft.set('m1.remove', true);
    fire(time);
    await until(() => draft.messages.value.length === 1);
    assert.equal(draft.messages.value[0].holds, false);
    assert.equal(draft.form.value.sections[0].fields.some((field) => field.id === 's1.remove'), false);
    draft.set('s1.remove', false);
    draft.set('b1.remove', false);
    draft.set('m1.remove', false);
    assert.equal(time.armed().length, 0);
    draft.unset('s1.remove');
    draft.unset('b1.remove');
    draft.unset('m1.remove');
    draft.unset('not.here');
    assert.equal(draft.dirty.value, true);
    fire(time);
    await until(() => drafts === 2 && draft.form.value.sections[0].fields.some((item) => item.id === 's1.remove'));
    assert.equal(draft.form.value.sections[0].fields.some((item) => item.id === 's1.remove'), true);
    map.close();
});

const PROFILE = 'b1.profile.roll';
const PROFILE_TWICE = [{ id: PROFILE }, { id: PROFILE }];

test('two profile rolls of one body leave as two entries and count as one change', async () => {
    const fields = [field('b1.name', 'Haven', 'type', 'text', 'Name')];
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read(fields));
        if (call.url.endsWith('/draft')) {
            assert.deepEqual(call.body, { hash: HASH, changes: [], roll: PROFILE_TWICE });
            return json(answer(fields));
        }
        if (call.url.endsWith('/keep')) {
            assert.deepEqual(call.body, { hash: HASH, baseRev: 1, changes: [], roll: PROFILE_TWICE });
            return json(row({ rev: 2, treeHash: HASH2 }));
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.rollAgain(PROFILE);
    draft.rollAgain(PROFILE);
    assert.equal(handChangeCount({}, [], [PROFILE, PROFILE]), 1);
    const undo = await draft.keep();
    assert.ok(undo);
    assert.equal(draft.dirty.value, false);
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/draft')).length, 1);
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/keep')).length, 1);
    map.close();
});

test('Discard drops every profile roll before anything is sent', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) return json(read([field('b1.name', 'Haven')]));
        throw new Error('unexpected ' + call.url);
    });
    const time = clock();
    const map = open(fetchImpl, time);
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.rollAgain(PROFILE);
    draft.rollAgain(PROFILE);
    assert.equal(draft.dirty.value, true);
    assert.equal(time.armed().length, 1);
    draft.discard();
    assert.equal(draft.dirty.value, false);
    assert.equal(time.armed().length, 0);
    assert.equal(posts(fetchImpl).length, 0);
    map.close();
});

test('Keep mine carries both profile rolls in order and drops a roll whose body is gone', async () => {
    const opening = [
        field('b1.name', 'Haven', 'type', 'text', 'Name'),
        field('b9.name', 'Gone', 'type', 'text', 'Name'),
    ];
    const newer = [field('b1.name', 'Haven', 'type', 'text', 'Name')];
    let forms = 0;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [row()], nextCursor: null });
        if (call.url.endsWith('/form')) {
            forms += 1;
            if (forms === 1) return json(read(opening));
            return json({ hash: HASH2, form: form(newer) });
        }
        if (call.url.endsWith('/draft')) {
            if (call.body.hash === HASH) {
                assert.deepEqual(call.body.roll, [...PROFILE_TWICE, { id: 'b9.profile.roll' }]);
                return json(answer(opening));
            }
            assert.equal(call.body.hash, HASH2);
            assert.deepEqual(call.body.changes, []);
            assert.deepEqual(call.body.roll, PROFILE_TWICE);
            return json(answer(newer));
        }
        if (call.url.endsWith('/keep')) {
            return fail(409, 'This hex changed. Reload it, then try again.', { current: row({ rev: 4, treeHash: HASH2 }) });
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl, clock());
    await map.loadSector('spin');
    const draft = await map.openDraft(KEY);
    draft.rollAgain(PROFILE);
    draft.rollAgain(PROFILE);
    draft.rollAgain('b9.profile.roll');
    assert.equal(await draft.keep(), null);
    assert.equal(draft.replaced.value, true);
    await draft.keepMine();
    assert.equal(draft.dirty.value, true);
    assert.equal(draft.replaced.value, false);
    assert.deepEqual(draft.dropped.value, [{ id: 'b9.profile.roll', label: 'b9.profile.roll' }]);
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/draft')).length, 2);
    map.close();
});
