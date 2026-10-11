/**
 * Build, step 3 part 2: a system designed by hand (apps/web/src/workspace/build/hand.ts and
 * hand_acts.ts). The list, the "orbits" picker, the moves and the removals are read from and
 * written to the server's own hand form (packages/generation `formOf` / `applyForm`): every
 * change this screen makes is applied by that code here, so a change the server would refuse
 * fails in this file.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ref } from 'vue';
import { applyForm, blankEnvelope, formOf } from '@voyage/generation';
import { BUILD_COMMANDS, canBuild, menuFor } from '../../apps/web/src/workspace/build/commands.ts';
import { discardEdit, draftHandle, dropEdit, edit, keepEdit, openEdit, setDraftOpener, setField } from '../../apps/web/src/workspace/build/edit.ts';
import {
    below, fieldOwner, handChangeCount, handList, handUi, moveChanges, moveTarget, movedWords, nextId, nodeFields, nodeTitle, orbitsValue, parentOptions, removeChanges,
    removedWith, removeTakesOthers, removeWords, reparentChanges, selectNode, systemFields,
} from '../../apps/web/src/workspace/build/hand.ts';
import {
    addBody, addWhy, cancelRemove, canGive, canMoveBody, canRemoveBody, confirmRemove, giveBody, handMode, handNodes, isHandHex, makeMainworld, moonHost, moveBody, removeBody,
} from '../../apps/web/src/workspace/build/hand_acts.ts';
import { useBuildStore, useOwnSectors } from '../../apps/web/src/workspace/build/seam.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';

const PIN = { seed: 'seed', settings: {}, engineVersion: '1.1.0' };

/** A hand-designed system as the server stores it, built by the server's own form code, one Keep at a time. */
function system(steps) {
    let envelope = blankEnvelope('~01M4GFABNQTCSR151Y18ANZN6Z/0312', 'MgT2E', PIN);
    for (const changes of steps) envelope = applyForm(envelope, changes, []).envelope;
    return envelope;
}

/** Two stars (the second orbits the first), two worlds and a gas giant under the first, two moons of the second world. */
function aster() {
    return system([
        [{ id: 'star.add', value: true }],
        [{ id: 's1.name', value: 'Aster' }, { id: 'star.add', value: true }],
        [{ id: 's2.name', value: 'Aster B' }, { id: 's2.parent', value: 's1' }, { id: 'body.add', value: true }],
        [{ id: 'b1.name', value: 'Cinder' }, { id: 'body.add', value: true }],
        [{ id: 'b2.name', value: 'Marrow' }, { id: 'b2.mainworld', value: true }, { id: 'body.add', value: true }],
        [{ id: 'b3.kind', value: 'gas' }, { id: 'body.add', value: true }],
        [{ id: 'b4.name', value: 'Pip' }, { id: 'b4.kind', value: 'moon' }, { id: 'b4.parent', value: 'b2' }, { id: 'body.add', value: true }],
        [{ id: 'b5.name', value: 'Seed' }, { id: 'b5.kind', value: 'moon' }, { id: 'b5.parent', value: 'b2' }],
    ]);
}

const shape = (list) => list.map((node) => '  '.repeat(node.depth) + node.id + ':' + node.kind);
const ids = (list) => list.map((node) => node.id);

// ---- the list ------------------------------------------------------------------------------------

test('a blank system by hand is empty: no star, no world, and the form says it is by hand', () => {
    const form = formOf(system([]));
    assert.equal(form.mode, 'hand');
    assert.deepEqual(handList(form), []);
    assert.deepEqual(systemFields(form).map((field) => field.id), ['system.name', 'system.notes']);
});

test('the bodies are one list: each star, the stars that orbit it, then its worlds, each followed by its moons', () => {
    const list = handList(formOf(aster()));
    assert.deepEqual(shape(list), ['s1:star', '  s2:star', '  b1:world', '  b2:world', '    b4:moon', '    b5:moon', '  b3:gas']);
    assert.equal(nodeTitle(list[0]), 'Aster');
    assert.equal(nodeTitle(list[6]), 'No name');
    assert.equal(list.find((node) => node.id === 'b2').mainworld, true);
    assert.deepEqual(ids(below(list, 's1')), ['s2', 'b1', 'b2', 'b4', 'b5', 'b3']);
    assert.deepEqual(ids(below(list, 'b2')), ['b4', 'b5']);
});

// ---- the "orbits" picker ---------------------------------------------------------------------------

test('what a body may be given to: a moon to a world or a star (becoming a world), a world to a star or a world (becoming a moon)', () => {
    const list = handList(formOf(aster()));
    const moon = parentOptions(list, 'b4');
    assert.deepEqual(moon.map((option) => [option.value, option.becomes]), [['s1', 'world'], ['s2', 'world'], ['s1+s2', 'world'], ['b1', null], ['b2', null], ['b3', null]]);
    const world = parentOptions(list, 'b1');
    assert.deepEqual(world.map((option) => [option.value, option.becomes, option.why !== '']), [['s1', null, false], ['s2', null, false], ['s1+s2', null, false], ['b2', 'moon', false], ['b3', 'moon', false]]);
    // A world that has moons cannot be stored as a moon: the choice is there, and says why it cannot be taken.
    const marrow = parentOptions(list, 'b2').filter((option) => option.becomes === 'moon');
    assert.equal(marrow.length, 2);
    assert.ok(marrow.every((option) => option.why === 'A body with moons can’t become a moon. First, move its moons to another body.'));
    // A star orbits another star or nothing, never something that orbits it.
    assert.deepEqual(parentOptions(list, 's1').map((option) => [option.value, option.why]), [['', ''], ['s2', 'Aster can’t orbit a star that orbits it.']]);
    assert.deepEqual(parentOptions(list, 's2').map((option) => option.value), ['', 's1']);
});

test('every re-parenting the picker offers is one the server stores, and the kind follows', () => {
    const envelope = aster();
    const list = handList(formOf(envelope));
    for (const node of list) {
        for (const option of parentOptions(list, node.id)) {
            const changes = reparentChanges(list, node.id, option.value);
            if (option.why || option.value === orbitsValue(node)) {
                assert.deepEqual(changes, []);
                continue;
            }
            const after = handList(formOf(applyForm(envelope, changes, []).envelope));
            const moved = after.find((item) => item.id === node.id);
            assert.equal(orbitsValue(moved), option.value, node.id + ' to ' + option.value);
            if (option.becomes) assert.equal(moved.kind, option.becomes);
        }
    }
});

test('a moon given to another world, and a world given to the second star', () => {
    const envelope = aster();
    const list = handList(formOf(envelope));
    assert.deepEqual(reparentChanges(list, 'b4', 'b1'), [{ id: 'b4.parent', value: 'b1' }]);
    assert.deepEqual(reparentChanges(list, 'b5', 's1'), [{ id: 'b5.kind', value: 'world' }, { id: 'b5.parent', value: 's1' }]);
    const next = applyForm(envelope, [...reparentChanges(list, 'b4', 'b1'), ...reparentChanges(list, 'b1', 's2'), ...reparentChanges(list, 'b5', 's1')], []).envelope;
    assert.deepEqual(shape(handList(formOf(next))), ['s1:star', '  s2:star', '    b1:world', '      b4:moon', '  b2:world', '  b3:gas', '  b5:world']);
});

test('a world orbits two stars together: one choice for each pair of paired stars, stored by the server parent first', () => {
    const envelope = aster();
    const list = handList(formOf(envelope));
    const pair = parentOptions(list, 'b1').find((option) => option.value === 's1+s2');
    assert.equal(pair.label, 'Aster and Aster B');
    // Two stars that do not orbit one another are not a pair: a third star that orbits nothing adds no choice.
    const three = applyForm(envelope, [{ id: 'star.add', value: 's9' }], []).envelope;
    assert.deepEqual(parentOptions(handList(formOf(three)), 'b1').filter((option) => option.value.includes('+')).map((option) => option.value), ['s1+s2']);
    assert.deepEqual(reparentChanges(list, 'b1', 's1+s2'), [{ id: 'b1.parent', value: 's1+s2' }]);
    const next = applyForm(envelope, reparentChanges(list, 'b1', 's1+s2'), []).envelope;
    assert.equal(next.system.bodies.find((body) => body.id === 'b1').alsoParentId, 's2');
    const after = handList(formOf(next));
    const world = after.find((node) => node.id === 'b1');
    assert.deepEqual([world.parent, world.also, orbitsValue(world)], ['s1', 's2', 's1+s2']);
    // It stands under the star the other orbits, and counts as orbiting each of the two.
    assert.deepEqual(shape(after).slice(0, 3), ['s1:star', '  s2:star', '  b1:world']);
    assert.deepEqual(ids(below(after, 's2')), ['b1']);
    assert.equal(movedWords(world, after, { 'b1.parent': 's1+s2' }, { 'b1.kind': 'world' }), 'Now orbits Aster and Aster B');
    // The choice it holds now changes nothing; one star alone takes it back.
    assert.deepEqual(reparentChanges(after, 'b1', 's1+s2'), []);
    assert.deepEqual(reparentChanges(after, 'b1', 's1'), [{ id: 'b1.parent', value: 's1' }]);
    assert.equal(applyForm(next, reparentChanges(after, 'b1', 's1'), []).envelope.system.bodies.find((body) => body.id === 'b1').alsoParentId, undefined);
    // A moon given to the pair becomes a world first: a moon orbits one world.
    assert.deepEqual(reparentChanges(list, 'b4', 's1+s2'), [{ id: 'b4.kind', value: 'world' }, { id: 'b4.parent', value: 's1+s2' }]);
});

test('the row says what a body becomes before it is kept', () => {
    const list = handList(formOf(applyForm(aster(), [{ id: 'b5.kind', value: 'world' }, { id: 'b5.parent', value: 's1' }, { id: 'b4.parent', value: 'b1' }], []).envelope));
    const was = { 'b5.kind': 'moon', 'b4.kind': 'moon' };
    const mine = { 'b5.kind': 'world', 'b5.parent': 's1', 'b4.parent': 'b1' };
    assert.equal(movedWords(list.find((node) => node.id === 'b5'), list, mine, was), 'Becomes a world of Aster');
    assert.equal(movedWords(list.find((node) => node.id === 'b4'), list, mine, was), 'Now orbits Cinder');
    assert.equal(movedWords(list.find((node) => node.id === 'b1'), list, mine, was), '');
});

// ---- move up, move down ---------------------------------------------------------------------------

test('Move up and Move down swap a body with its neighbour under the same parent; the ends have nowhere to go', () => {
    const envelope = aster();
    const list = handList(formOf(envelope));
    assert.equal(moveTarget(list, 'b1', -1), null);
    assert.equal(moveTarget(list, 'b3', 1), null);
    assert.equal(moveTarget(list, 'b3', -1).id, 'b2');
    assert.equal(moveTarget(list, 'b5', -1).id, 'b4');
    assert.equal(moveTarget(list, 's2', -1), null);
    assert.deepEqual(moveChanges(list, 'b1', -1), []);
    const up = applyForm(envelope, moveChanges(list, 'b3', -1), []).envelope;
    assert.deepEqual(shape(handList(formOf(up))), ['s1:star', '  s2:star', '  b1:world', '  b3:gas', '  b2:world', '    b4:moon', '    b5:moon']);
    const moons = applyForm(envelope, moveChanges(list, 'b4', 1), []).envelope;
    assert.deepEqual(ids(handList(formOf(moons))).slice(3), ['b2', 'b5', 'b4', 'b3']);
});

test('a move holds when two bodies carry one number: the list is numbered again in the order it shows', () => {
    const tied = applyForm(aster(), [{ id: 'b1.order', value: 0 }, { id: 'b2.order', value: 0 }, { id: 'b3.order', value: 0 }], []).envelope;
    const list = handList(formOf(tied));
    assert.deepEqual(ids(list).filter((id) => ['b1', 'b2', 'b3'].includes(id)), ['b1', 'b2', 'b3']);
    const down = applyForm(tied, moveChanges(list, 'b1', 1), []).envelope;
    assert.deepEqual(ids(handList(formOf(down))).filter((id) => ['b1', 'b2', 'b3'].includes(id)), ['b2', 'b1', 'b3']);
});

// ---- remove ----------------------------------------------------------------------------------------

test('a remove is one change; the server takes what orbits with it, and its answer gives the count', () => {
    const envelope = aster();
    const list = handList(formOf(envelope));
    assert.equal(removeWords(list, 'b2'), 'Marrow and its moons');
    assert.equal(removeWords(list, 'b1'), 'Cinder');
    assert.equal(removeWords(list, 's1'), 'Aster and everything that orbits it');
    assert.equal(removeTakesOthers(list, 'b1'), false);
    assert.equal(removeTakesOthers(list, 'b2'), true);
    assert.equal(removeTakesOthers(list, 's1'), true, 'nothing is withheld: a star with worlds can be removed');
    assert.deepEqual(removeChanges(list, 'b2'), [{ id: 'b2.remove', value: true }]);
    assert.deepEqual(removeChanges(list, 'nope'), []);
    // A world takes its moons.
    const world = applyForm(envelope, removeChanges(list, 'b2'), []);
    assert.deepEqual(ids(handList(world.answer.form)), ['s1', 's2', 'b1', 'b3']);
    assert.equal(removedWith(ids(list), handList(world.answer.form), 'b2'), 2);
    // A star takes its paired star and every world and moon under either.
    const star = applyForm(envelope, removeChanges(list, 's1'), []);
    assert.deepEqual(handList(star.answer.form), []);
    assert.equal(removedWith(ids(list), handList(star.answer.form), 's1'), 6);
    assert.deepEqual(star.answer.messages, [{ id: 's1.remove', text: '6 bodies go with this star.', holds: false }]);
    // Until the answer no longer shows the body, nothing is counted.
    assert.equal(removedWith(ids(list), list, 's1'), null);
});

test('a new body is named by the screen as the server would name it, never with an id in use or pending', () => {
    assert.equal(nextId('s', []), 's1');
    assert.equal(nextId('s', ['s1', 's2', 'b1']), 's3');
    assert.equal(nextId('b', ['s1', 'b1', 'b3']), 'b2');
    assert.equal(nextId('b', ['star.0', 'body.0', 'body.1']), 'b1');
    assert.equal(nextId('s', ['s1.x']), 's2', 'never the head of another id');
});

// ---- the selected body's fields ---------------------------------------------------------------------

test('the selected body shows its own fields; what the list sets (parent, order, remove) is left out; a moon has no kind to choose', () => {
    const form = formOf(aster());
    const list = handList(form);
    const world = nodeFields(form, list.find((node) => node.id === 'b2'));
    assert.deepEqual(world.rows.map((field) => field.id), ['b2.name', 'b2.kind', 'b2.orbit.id', 'b2.orbit.au', 'b2.orbit.eccentricity', 'b2.orbit.years', 'b2.mainworld', 'b2.notes', 'b2.bases', 'b2.zone', 'b2.allegiance', 'b2.trade']);
    assert.deepEqual(world.rows[1].options.map((option) => option.value), ['world', 'gas', 'belt']);
    assert.equal(world.profile.length, 8);
    const moon = nodeFields(form, list.find((node) => node.id === 'b4'));
    assert.equal(moon.rows.some((field) => field.id === 'b4.kind'), false);
    assert.deepEqual(moon.rows.map((field) => field.id), ['b4.name', 'b4.orbit.pd', 'b4.orbit.eccentricity', 'b4.mainworld', 'b4.notes', 'b4.bases', 'b4.zone', 'b4.allegiance', 'b4.trade']);
    const star = nodeFields(form, list[0]);
    assert.deepEqual(star.rows.map((field) => field.id), ['s1.name', 's1.type', 's1.subtype', 's1.class', 's1.orbit.id', 's1.orbit.au', 's1.orbit.eccentricity', 's1.orbit.years']);
    assert.equal(star.profile.length, 0);
});

test('nothing rolls by hand: a field the form would let roll is drawn as one that is typed', () => {
    const form = formOf(aster());
    for (const section of form.sections) for (const field of section.fields) if (field.id === 'b2.name' || field.id === 'system.name') field.permission = 'roll';
    const list = handList(form);
    assert.equal(nodeFields(form, list.find((node) => node.id === 'b2')).rows.find((field) => field.id === 'b2.name').permission, 'type');
    assert.equal(systemFields(form).find((field) => field.id === 'system.name').permission, 'type');
});

test('a field belongs to the longest id that leads it: a moon’s field is not its world’s', () => {
    const all = ['star.0', 'body.2', 'body.2.moon.0', 'body.21'];
    assert.equal(fieldOwner('body.2.name', all), 'body.2');
    assert.equal(fieldOwner('body.2.moon.0.name', all), 'body.2.moon.0');
    assert.equal(fieldOwner('body.21.name', all), 'body.21');
    assert.equal(fieldOwner('system.name', all), '');
});

test('the bar counts a move as one change, and a body given away as one though its kind changes too', () => {
    assert.equal(handChangeCount({}), 0);
    assert.equal(handChangeCount({ 'b1.order': 2, 'b2.order': 1, 'b3.order': 0 }), 1);
    assert.equal(handChangeCount({ 'b5.kind': 'world', 'b5.parent': 's1' }), 1);
    assert.equal(handChangeCount({ 'b5.kind': 'gas', 'b1.name': 'x', 'b1.order': 3 }), 3);
    // A body added is one change, whatever is typed into it; a remove is one.
    assert.equal(handChangeCount({ 'b9.kind': 'gas', 'b9.parent': 's1', 'b9.name': 'Pip', 's1.remove': true }, ['b9', 's7']), 3);
});

// ---- the acts, against a draft that answers as the server does --------------------------------------

/**
 * A draft handle over the server's own form code, as Agent A's handle behaves
 * (findings/builder_handle_ready.md): `add` appends, `set` replaces one change a field,
 * `unset` takes one back, and `keep` stores the whole array as one revision.
 */
function handDraft(start) {
    let stored = start;
    let changes = [];
    const form = ref(formOf(stored));
    const dirty = ref(false);
    const messages = ref([]);
    const kept = [];
    const publish = () => {
        const answer = applyForm(stored, changes, []).answer;
        form.value = answer.form;
        messages.value = answer.messages;
    };
    const settle = () => {
        dirty.value = changes.length > 0;
        // The draft answer arrives later in the app; here it is at once, and a refused draft leaves the form as it was.
        try { publish(); } catch { /* shown when Keep is pressed */ }
    };
    const handle = {
        form,
        dirty,
        changedByEngine: ref([]),
        messages,
        conflict: ref(null),
        replaced: ref(false),
        dropped: ref([]),
        set(id, value) {
            const was = formOf(stored).sections.flatMap((section) => section.fields).find((field) => field.id === id);
            const at = changes.findIndex((item) => item.id === id);
            if (was && was.value === value) changes = changes.filter((item) => item.id !== id);
            else if (at >= 0) changes[at] = { id, value };
            else changes.push({ id, value });
            settle();
        },
        add(field, id) {
            changes.push({ id: field, value: id });
            settle();
        },
        unset(id) {
            changes = changes.filter((item) => item.id !== id);
            settle();
        },
        rollAgain() {},
        async keep() {
            if (!changes.length) return null;
            stored = applyForm(stored, changes, []).envelope;
            kept.push(changes);
            changes = [];
            dirty.value = false;
            form.value = formOf(stored);
            return { id: 'undo-' + kept.length };
        },
        async keepMine() {},
        async takeTheirs() {},
        discard() {
            changes = [];
            settle();
        },
    };
    return { handle, kept, stored: () => stored };
}

async function open(start) {
    clearToasts();
    dropEdit();
    const draft = handDraft(start);
    setDraftOpener(async () => draft.handle);
    useOwnSectors(null);
    useBuildStore(null);
    await openEdit('~01M4GFABNQTCSR151Y18ANZN6Z/0312', '');
    return draft;
}

test('a draft whose form says "hand" opens the designer; the generated editor is left as it was', async () => {
    await open(system([]));
    assert.equal(edit.mode, 'hand');
    assert.deepEqual(handNodes(), []);
    dropEdit();
    assert.equal(edit.mode, 'generated');
});

test('a world needs a star first, and a moon needs a world selected: the buttons say so and do nothing', async () => {
    const draft = await open(system([]));
    assert.equal(addWhy('star'), '');
    assert.equal(addWhy('world'), 'Add a star first.');
    assert.equal(canBuild('build-add-world', []), false);
    addBody('world');
    assert.deepEqual(draft.kept, []);
    assert.equal(draftHandle.value.dirty.value, false);
    dropEdit();
});

test('adds wait for Keep: two stars, three worlds, two moons, a just-added body named; Discard drops them all; again, and one Keep is one revision', async () => {
    const draft = await open(system([]));
    const build = () => {
        addBody('star');
        assert.equal(handUi.selected, 's1', 'the new star is selected at once');
        setField('s1.name', 'Aster');
        addBody('star');
        selectNode('s1');
        addBody('world');
        addBody('gas');
        selectNode('s2');
        addBody('world');
        setField('b3.name', 'Seed');
        selectNode('b1');
        addBody('moon');
        assert.equal(moonHost().id, 'b1');
        addBody('moon');
    };
    build();
    assert.deepEqual(handNodes().map((node) => node.id).sort(), ['b1', 'b2', 'b3', 'b4', 'b5', 's1', 's2']);
    assert.equal(handNodes().find((node) => node.id === 'b3').parent, 's2', 'a world goes under the star selected');
    assert.equal(handNodes().find((node) => node.id === 'b3').name, 'Seed', 'a body just added can be named in the same draft');
    assert.equal(handNodes().find((node) => node.id === 'b2').kind, 'gas');
    assert.deepEqual(handNodes().filter((node) => node.kind === 'moon').map((node) => node.parent), ['b1', 'b1']);
    assert.deepEqual(draft.kept, [], 'nothing is stored before Keep');
    assert.equal(toasts.length, 0, 'no toast per add');
    assert.equal(handChangeCount(edit.mine, edit.added.map((item) => item.id)), 7, 'seven bodies; what is typed into a body just added counts with it');
    discardEdit();
    assert.deepEqual(draft.kept, []);
    assert.equal(draftHandle.value, null);
    // Again, and Keep: one revision holding everything.
    await openEdit('~01M4GFABNQTCSR151Y18ANZN6Z/0312', '');
    build();
    assert.equal(await keepEdit(), true);
    assert.equal(draft.kept.length, 1);
    assert.equal(draft.stored().system.stars.length, 2);
    assert.equal(draft.stored().system.bodies.length, 5);
    assert.equal(draft.stored().system.bodies.find((body) => body.id === 'b3').name, 'Seed');
    dropEdit();
});

test('a remove waits for Keep; one that takes others asks first with the count from the answer; Cancel puts it all back', async () => {
    const draft = await open(aster());
    moveBody('b3', -1);
    giveBody('b4', 'b1');
    makeMainworld('b1');
    assert.equal(handNodes().find((node) => node.id === 'b1').mainworld, true);
    // A body with nothing under it: it leaves the list, and the draft holds the remove.
    removeBody('b3');
    assert.equal(handNodes().some((node) => node.id === 'b3'), false);
    assert.equal(handUi.removing, null);
    assert.deepEqual(draft.kept, []);
    // A star with worlds and a paired star: the ask, with the count of what went in the answer.
    assert.equal(canRemoveBody('s1'), true, 'a star with worlds is not greyed');
    removeBody('s1');
    assert.equal(handUi.removing.id, 's1');
    assert.equal(removedWith(handUi.removing.before, handNodes(), 's1'), 5);
    assert.equal(canBuild('build-draft-keep', []), false, 'Keep waits for the answer to the ask');
    cancelRemove();
    assert.equal(handUi.removing, null);
    assert.deepEqual(handNodes().map((node) => node.id).sort(), ['b1', 'b2', 'b4', 'b5', 's1', 's2']);
    assert.equal(edit.mine['s1.remove'], undefined);
    // Again, and confirm: it stays in the draft until Keep.
    removeBody('s1');
    confirmRemove();
    assert.deepEqual(handNodes(), []);
    assert.deepEqual(draft.kept, []);
    assert.equal(await keepEdit(), true);
    assert.equal(draft.kept.length, 1);
    assert.deepEqual(draft.stored().system.stars, []);
    assert.equal(toasts[toasts.length - 1].action.label, 'Undo');
    dropEdit();
});

// ---- hand and generated, both ways -------------------------------------------------------------------

test('a system by hand offers Generate in place of "Design by hand"; a generated one offers the designer', async () => {
    dropEdit();
    const key = '~01M4GFABNQTCSR151Y18ANZN6Z/0312';
    const other = '~01M4GFABNQTCSR151Y18ANZN6Z/0313';
    const entry = { tree: 'h', type: 'SYSTEM_PRESENT', name: 'Aster', uwp: '', allegiance: '', zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null };
    const asks = [];
    useBuildStore({
        universe: () => ({ id: 'u', name: 'U', truthVersion: 'v5' }),
        tick: () => 0,
        row: (hexKey) => (hexKey === key || hexKey === other ? { hexKey, state: 'own', entry, roll: 0, rev: 3 } : null),
        rows: () => [],
    });
    useOwnSectors({ formMode: async (hexKey) => { asks.push(hexKey); return hexKey === key ? 'hand' : 'generated'; } });
    // Until the server has said, the system is neither: a muted "Checking…" holds the line, so Remove does not move.
    assert.equal(handMode(key), null);
    assert.equal(isHandHex(key), false);
    const cold = menuFor([key]).items;
    assert.deepEqual(cold.map((item) => item.id), ['build-edit', 'build-design-hand', 'build-remove']);
    assert.equal(cold[1].label, 'Checking…');
    assert.equal(cold[1].disabled, true);
    assert.equal(cold[1].say, undefined);
    assert.equal(canBuild('build-generate', [key]), false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(isHandHex(key), true);
    assert.equal(isHandHex(other), false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(canBuild('build-generate', [key]), true);
    assert.equal(canBuild('build-design-hand', [key]), false);
    assert.equal(canBuild('build-generate', [other]), false);
    assert.equal(canBuild('build-design-hand', [other]), true);
    const hand = menuFor([key]).items.map((item) => item.id);
    assert.deepEqual(hand, ['build-edit', 'build-generate', 'build-remove']);
    // One line high, as "Checking…" was: the preview says that keeping replaces the hand system.
    assert.equal(menuFor([key]).items[1].say, undefined);
    assert.equal(menuFor([key]).items[1].disabled, false);
    assert.deepEqual(menuFor([other]).items.map((item) => item.id), ['build-edit', 'build-design-hand', 'build-remove']);
    // Asked once for a revision, however often the screen reads it.
    assert.deepEqual(asks, [key, other]);
    useBuildStore(null);
    useOwnSectors(null);
});

test('the designer’s acts are commands', () => {
    const have = new Set(BUILD_COMMANDS.map((item) => item.id));
    for (const id of ['build-design-hand', 'build-add-star', 'build-add-world', 'build-add-gas', 'build-add-belt', 'build-add-moon', 'build-body-up', 'build-body-down', 'build-body-mainworld', 'build-body-remove']) {
        assert.equal(have.has(id), true, id);
        assert.equal(canBuild(id, []), false, id + ' cannot run with no draft open');
    }
    setDraftOpener(null);
});
