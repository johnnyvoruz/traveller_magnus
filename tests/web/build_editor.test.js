import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ref } from 'vue';
import {
    changeLine, discardEdit, draftHandle, edit, editDirty, editing, fieldOf, groupFields, groupTitle, holdLeaving, keepEdit, keepMine,
    leaveDiscarding, looseMessages, markOf, messagesFor, numberValue, openBlank, openEdit, ownerOf, rollField, rulesAfter, setDraftOpener,
    setField, stay, takeTheirs, valuesOf, whyOf,
} from '../../apps/web/src/workspace/build/edit.ts';
import { BUILD_COMMANDS } from '../../apps/web/src/workspace/build/commands.ts';
import { handleKey, registerCommand } from '../../apps/web/src/shell/registry.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';

const field = (id, value, more = {}) => ({ id, label: more.label ?? id, kind: more.kind ?? 'text', permission: more.permission ?? 'type', value, options: more.options ?? [] });
const formOf = () => ({
    edition: 'MgT2E',
    sections: [
        { id: 'name', label: 'Name', fields: [field('name.system', 'Sco', { label: 'System name' })] },
        { id: 'profile', label: 'Mainworld profile', fields: [field('profile.s', 9, { kind: 'number', label: 'Size' })] },
        { id: 'stars', label: 'Stars', fields: [
            field('stars.addWorld', false, { kind: 'switch', label: '+World' }),
            field('star.0.type', 'F', { kind: 'choice', options: [{ value: 'F', label: 'F' }, { value: 'G', label: 'G' }] }),
            field('star.0.mass', 1.2, { kind: 'number', permission: 'roll', label: 'Mass' }),
            field('star.1.type', 'M', { kind: 'choice' }),
        ] },
        { id: 'system', label: 'System', fields: [
            field('system.age', 5.27, { kind: 'number', permission: 'roll', label: 'Age' }),
            field('body.0.name', 'Sco I'), field('body.0.au', 0.4, { permission: 'read' }),
            field('body.0.moon.0.name', ''), field('body.0.moon.0.pd', 12, { kind: 'number' }),
            field('body.1.name', 'Sco II'),
        ] },
        { id: 'rules', label: 'Rules', fields: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'].map((r) => field('rule.' + r, '', { permission: 'read' })) },
    ],
});

// ---- reading a form -----------------------------------------------------------------------------

test('a field belongs to the star, world or moon its id names', () => {
    assert.equal(ownerOf('star.0.type'), 'star.0');
    assert.equal(ownerOf('body.2.moon.0.pd'), 'body.2.moon.0');
    assert.equal(ownerOf('body.2.name'), 'body.2');
    assert.equal(ownerOf('profile.s'), '');
    assert.equal(ownerOf('system.age'), '');
});

test('a section is gathered into blocks in the form’s own order, moons marked', () => {
    const form = formOf();
    const stars = groupFields(form.sections[2]);
    assert.deepEqual(stars.map((group) => [group.owner, group.fields.length]), [['', 1], ['star.0', 2], ['star.1', 1]]);
    const system = groupFields(form.sections[3]);
    assert.deepEqual(system.map((group) => [group.owner, group.moon]), [['', false], ['body.0', false], ['body.0.moon.0', true], ['body.1', false]]);
    assert.equal(groupTitle(system[1]), 'Sco I');
    assert.equal(groupTitle(system[2]), 'Moon 1');
    assert.equal(groupTitle(stars[1]), 'Star 1');
    assert.equal(groupTitle(stars[0]), '');
});

test('the seven rule places stand after their sections, and each is empty', () => {
    const form = formOf();
    const placed = ['profile', 'chart', 'system'].flatMap((id) => rulesAfter(form, id));
    // This form has no chart section, so four of the seven come with it when the server sends one.
    assert.deepEqual(placed.map((item) => item.id), ['rule.R1', 'rule.R2', 'rule.R4', 'rule.R5', 'rule.R7', 'rule.R3', 'rule.R6']);
    assert.ok(placed.every((item) => item.value === ''));
    assert.deepEqual(rulesAfter(form, 'name'), []);
});

test('teal is the referee’s change, amber the engine’s, with the engine’s words', () => {
    const changed = [{ id: 'star.0.mass', why: ' Mass rolled 1.4 ' }, { id: 'profile.s', why: '' }];
    assert.equal(markOf('profile.s', { 'profile.s': 8 }, [], changed), 'mine');
    assert.equal(markOf('star.0.mass', {}, [], changed), 'engine');
    assert.equal(markOf('star.0.mass', {}, ['star.0.mass'], changed), 'mine');
    assert.equal(markOf('body.0.name', {}, [], changed), 'none');
    assert.equal(whyOf('star.0.mass', changed), 'Mass rolled 1.4');
    assert.equal(whyOf('body.0.name', changed), '');
});

test('a message sits under its field; one for a field that is gone is said at the top', () => {
    const form = formOf();
    const messages = [{ id: 'star.0.type', text: 'a', holds: false }, { id: null, text: 'b', holds: true }, { id: 'body.9.name', text: 'c', holds: false }];
    assert.deepEqual(messagesFor('star.0.type', messages).map((m) => m.text), ['a']);
    assert.deepEqual(looseMessages(form, messages).map((m) => m.text), ['b', 'c']);
});

test('the count of changes, and a typed number', () => {
    assert.equal(changeLine({ a: 1 }, ['b'], []), '2 changes');
    assert.equal(changeLine({ a: 1 }, [], [{ id: null, text: 'x', holds: false }]), '1 change · 1 message');
    assert.equal(numberValue(' 0.5 '), 0.5);
    assert.equal(numberValue(''), null);
    assert.equal(numberValue('abc'), null);
});

// ---- the open draft, against a handle like Agent A's ------------------------------------------------

function fakeHandle(log, options = {}) {
    const form = ref(formOf());
    const handle = {
        form,
        dirty: ref(false),
        changedByEngine: ref([]),
        messages: ref([]),
        conflict: ref(null),
        replaced: ref(false),
        dropped: ref([]),
        async keepMine() { log.push(['keepMine']); handle.conflict.value = null; handle.replaced.value = false; handle.dropped.value = [{ id: 'body.7.name', label: 'World 8 name' }]; },
        async takeTheirs() { log.push(['takeTheirs']); handle.conflict.value = null; handle.dirty.value = false; },
        set(id, value) { log.push(['set', id, value]); fieldOf(form.value, id).value = value; handle.dirty.value = true; },
        rollAgain(id) { log.push(['roll', id]); handle.dirty.value = true; },
        async keep() {
            log.push(['keep']);
            if (options.conflict) { handle.conflict.value = { hexKey: 'S/2009', rev: 5 }; return null; }
            if (options.refuse) throw new Error(options.refuse);
            handle.dirty.value = false;
            return { id: 'undo-1' };
        },
        discard() { log.push(['discard']); handle.dirty.value = false; handle.conflict.value = null; },
    };
    return handle;
}

function opened(options) {
    const log = [];
    setDraftOpener(async (hexKey) => { log.push(['open', hexKey]); return fakeHandle(log, options); });
    clearToasts();
    return log;
}

test('a draft opens on one system; typing marks a field mine; putting it back unmarks it', async () => {
    const log = opened();
    await openEdit('S/2009', 'Sco');
    assert.equal(editing('S/2009'), true);
    assert.equal(editing('S/2010'), false);
    assert.equal(editDirty(), false);
    assert.deepEqual(edit.baseline['name.system'], 'Sco');
    setField('name.system', 'Scorpio');
    assert.deepEqual(edit.mine, { 'name.system': 'Scorpio' });
    assert.equal(editDirty(), true);
    setField('name.system', 'Sco');
    assert.deepEqual(edit.mine, {});
    rollField('star.0.mass');
    assert.deepEqual(edit.rolled, ['star.0.mass']);
    setField('star.0.mass', 2);
    assert.deepEqual(edit.rolled, []);
    assert.deepEqual(log.filter((item) => item[0] !== 'open').map((item) => item[0]), ['set', 'set', 'roll', 'set']);
    discardEdit();
});

test('Keep is one save: the editor closes and the toast offers Undo', async () => {
    const log = opened();
    await openEdit('S/2009', 'Sco');
    setField('name.system', 'Scorpio');
    assert.equal(await keepEdit(), true);
    assert.equal(draftHandle.value, null);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'Kept your changes to Sco.');
    assert.equal(toasts[0].action.label, 'Undo');
    assert.deepEqual(log.map((item) => item[0]), ['open', 'set', 'keep']);
});

test('a refused Keep leaves the draft open and says why in the engine’s words', async () => {
    opened({ refuse: 'The generator encountered an error: x' });
    await openEdit('S/2009', 'Sco');
    setField('name.system', 'Scorpio');
    assert.equal(await keepEdit(), false);
    assert.equal(editing('S/2009'), true);
    assert.equal(edit.error, 'The generator encountered an error: x');
    assert.deepEqual(edit.mine, { 'name.system': 'Scorpio' });
    discardEdit();
});

test('a conflict leaves the draft; the two choices are the handle’s, and neither keeps', async () => {
    let log = opened({ conflict: true });
    await openEdit('S/2009', 'Sco');
    setField('name.system', 'Scorpio');
    assert.equal(await keepEdit(), false);
    assert.notEqual(draftHandle.value.conflict.value, null);
    assert.equal(toasts.length, 0);
    await takeTheirs();
    assert.deepEqual(edit.mine, {});
    assert.deepEqual(log.map((item) => item[0]), ['open', 'set', 'keep', 'takeTheirs']);

    log = opened({ conflict: true });
    await openEdit('S/2009', 'Sco');
    setField('name.system', 'Scorpio');
    edit.mine['body.7.name'] = 'Lost';
    await keepEdit();
    await keepMine();
    // What the handle dropped is no longer counted as the referee's change; the rest stands, unkept.
    assert.deepEqual(edit.mine, { 'name.system': 'Scorpio' });
    assert.deepEqual(draftHandle.value.dropped.value, [{ id: 'body.7.name', label: 'World 8 name' }]);
    assert.equal('name.system' in edit.baseline, false);
    assert.deepEqual(log.map((item) => item[0]).slice(-2), ['keep', 'keepMine']);
    discardEdit();
});

test('a blank system is made at once from the hex alone (no engine, no star), opens in the editor, and its toast offers Undo', async () => {
    const log = [];
    clearToasts();
    setDraftOpener(async () => fakeHandle(log), async (...args) => { log.push(['blank', ...args]); return { draft: fakeHandle(log), undo: { id: 'undo-b' } }; });
    await openBlank('S/2010');
    assert.deepEqual(log[0], ['blank', 'S/2010'], 'the opener is handed the hex and nothing else');
    assert.equal(editing('S/2010'), true);
    assert.equal(editDirty(), false);
    assert.equal(toasts[0].action.label, 'Undo');
    discardEdit();
});

test('leaving with changes not kept is held and asked; without changes it is not', async () => {
    opened();
    await openEdit('S/2009', 'Sco');
    let went = 0;
    assert.equal(holdLeaving(() => { went += 1; }), false);
    assert.equal(draftHandle.value, null);
    await openEdit('S/2009', 'Sco');
    setField('name.system', 'Scorpio');
    assert.equal(holdLeaving(() => { went += 1; }), true);
    assert.notEqual(edit.leaving, null);
    stay();
    assert.equal(edit.leaving, null);
    assert.equal(editing('S/2009'), true);
    holdLeaving(() => { went += 1; });
    leaveDiscarding();
    assert.equal(went, 1);
    assert.equal(draftHandle.value, null);
    assert.equal(toasts[toasts.length - 1].message, 'Discarded your changes to Sco.');
});

test('a draft that cannot be opened says so and changes nothing', async () => {
    setDraftOpener(async () => { throw new Error('offline'); });
    await openEdit('S/2009', 'Sco');
    assert.equal(draftHandle.value, null);
    assert.equal(edit.error, 'Can’t reach the server, so nothing was changed. Check your connection and try again.');
    discardEdit();
    setDraftOpener(null);
});

// ---- keys -----------------------------------------------------------------------------------------

test('Edit is E, and Keep is one command, K or Ctrl+Enter; Ctrl+Enter works from inside a box', () => {
    const keys = Object.fromEntries(BUILD_COMMANDS.filter((item) => item.keys).map((item) => [item.id, item.keys]));
    assert.deepEqual(keys['build-edit'], ['e']);
    assert.deepEqual(keys['build-keep'], ['k', 'Ctrl+Enter']);
    assert.equal(BUILD_COMMANDS.some((item) => item.id === 'build-draft-keep'), false, 'one Keep in the palette');
    let ran = 0;
    const remove = registerCommand({ id: 'build-keep', name: 'Keep', keys: ['Ctrl+Enter'], run: () => { ran += 1; } });
    try {
        const event = (more) => ({ key: 'Enter', ctrlKey: false, altKey: false, metaKey: false, target: { tagName: 'INPUT' }, preventDefault() {}, ...more });
        assert.equal(handleKey(event({})), false);
        assert.equal(handleKey(event({ ctrlKey: true })), true);
        assert.equal(ran, 1);
    } finally {
        remove();
    }
});

test('the values of a form by id', () => {
    const values = valuesOf(formOf());
    assert.equal(values['profile.s'], 9);
    assert.equal(values['rule.R7'], '');
});
