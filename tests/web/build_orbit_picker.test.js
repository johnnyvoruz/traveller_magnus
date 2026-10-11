/**
 * The orbit picker of the hand designer (apps/web/src/workspace/build/orbit_pick.ts): its units,
 * its scale, the rings it draws, and what Place writes. The form is the server's own
 * (packages/generation `formOf` / `applyForm`), so every change Place makes is applied by that code.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ref } from 'vue';
import { applyForm, blankEnvelope, formOf } from '@voyage/generation';
import { mgt2eOrbitToAu } from '@voyage/shared';
import { dropEdit, edit, openEdit, setDraftOpener } from '../../apps/web/src/workspace/build/edit.ts';
import { handList } from '../../apps/web/src/workspace/build/hand.ts';
import {
    canPick, clampP, modeFor, orbitChanges, pAtRadius, pickParents, pickWords, placeOrbit, radiusOf, ringsAround, scaleFor, stepP, storedP, ticksOf, valueAt,
} from '../../apps/web/src/workspace/build/orbit_pick.ts';
import { useBuildStore, useOwnSectors } from '../../apps/web/src/workspace/build/seam.ts';

const PIN = { seed: 'seed', settings: {}, engineVersion: '1.1.0' };
const KEY = '~01M4GFABNQTCSR151Y18ANZN6Z/0312';

function system(edition, steps) {
    let envelope = blankEnvelope(KEY, edition, PIN);
    for (const changes of steps) envelope = applyForm(envelope, changes, []).envelope;
    return envelope;
}

/** Two paired stars; two worlds and a gas giant under the first, at orbits 1.2 and 5.6 and none; a moon of the second world at 12 diameters. */
function vell(edition) {
    return system(edition, [
        [{ id: 'star.add', value: true }],
        [{ id: 's1.name', value: 'Vell' }, { id: 'star.add', value: true }],
        [{ id: 's2.name', value: 'Vell B' }, { id: 's2.parent', value: 's1' }, { id: 'body.add', value: true }],
        [{ id: 'b1.name', value: 'Cinder' }, { id: 'b1.orbit.id', value: 1.2 }, { id: 'b1.orbit.au', value: 0.52 }, { id: 'body.add', value: true }],
        [{ id: 'b2.name', value: 'Ostra' }, { id: 'body.add', value: true }],
        [{ id: 'b3.kind', value: 'gas' }, { id: 'b3.name', value: 'Gale' }, { id: 'b3.orbit.au', value: 6 }, { id: 'body.add', value: true }],
        [{ id: 'b4.name', value: 'Pell' }, { id: 'b4.kind', value: 'moon' }, { id: 'b4.parent', value: 'b2' }, { id: 'b4.orbit.pd', value: 12 }],
    ]);
}

test('the unit follows the edition: orbit number on MgT2E, AU elsewhere, planetary diameters for a moon', () => {
    const mg = formOf(vell('MgT2E'));
    const aow = formOf(vell('AoW'));
    const none = formOf(vell(undefined));
    assert.equal(modeFor(mg, 'world'), 'orbit');
    assert.equal(modeFor(mg, 'star'), 'orbit');
    assert.equal(modeFor(mg, 'moon'), 'pd');
    assert.equal(modeFor(aow, 'world'), 'au');
    assert.equal(modeFor(none, 'belt'), 'au');
    const list = handList(mg);
    for (const node of list) assert.equal(canPick(mg, node), true, node.id);
});

test('a stored orbit reads back on the scale: the orbit number, else the AU converted; AU and diameters as tenth-powers', () => {
    const mg = formOf(vell('MgT2E'));
    assert.equal(storedP(mg, 'b1', 'orbit'), 1.2);
    // Only AU was stored for Gale: on MgT2E it is read through the contract's conversion.
    assert.ok(Math.abs(storedP(mg, 'b3', 'orbit') - (6 + (6 - 5.2) / (10 - 5.2))) < 1e-9);
    assert.equal(storedP(mg, 'b2', 'orbit'), null);
    assert.ok(Math.abs(storedP(mg, 'b4', 'pd') - Math.log10(12)) < 1e-12);
    assert.ok(Math.abs(storedP(formOf(vell('AoW')), 'b3', 'au') - Math.log10(6)) < 1e-12);
});

test('what Place writes: the orbit number and its AU on MgT2E, AU alone elsewhere, diameters for a moon', () => {
    assert.deepEqual(orbitChanges('b2', 'orbit', 3.44), [{ id: 'b2.orbit.id', value: 3.4 }, { id: 'b2.orbit.au', value: Number(mgt2eOrbitToAu(3.4).toPrecision(4)) }]);
    assert.deepEqual(orbitChanges('b2', 'au', Math.log10(1.5)), [{ id: 'b2.orbit.au', value: 1.5 }]);
    assert.deepEqual(orbitChanges('b4', 'pd', Math.log10(12.5)), [{ id: 'b4.orbit.pd', value: 12.5 }]);
    assert.equal(pickWords('orbit', 3.4), 'Orbit 3.4 · 1.24 AU');
    assert.equal(pickWords('au', Math.log10(1500)), '1,500 AU');
    assert.equal(pickWords('pd', 0), '1 planetary diameter');
    assert.equal(valueAt('pd', Math.log10(12.5)), 12.5);
});

test('the scale: room past the farthest body, the radius and back, snapping, arrow steps and marks', () => {
    const orbit = scaleFor('orbit', [1.2, 6.3]);
    assert.deepEqual(orbit, { mode: 'orbit', lo: 0, hi: 9 });
    assert.equal(scaleFor('orbit', [19.5]).hi, 20, 'never past the table');
    assert.equal(scaleFor('orbit', []).hi, 8);
    const r = radiusOf(orbit, 4.5, 26, 208);
    assert.equal(pAtRadius(orbit, r, 26, 208), 4.5);
    assert.equal(pAtRadius(orbit, 9999, 26, 208), 9, 'the pointer past the edge stays on the scale');
    assert.equal(stepP(orbit, 3.4, 1, false), 3.5);
    assert.equal(stepP(orbit, 3.4, -1, true), 2.4);
    assert.equal(stepP(orbit, 0.05, -1, false), 0);
    assert.equal(clampP(orbit, -3), 0);
    assert.deepEqual(ticksOf(orbit).map((tick) => tick.label), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    const au = scaleFor('au', [Math.log10(0.3), Math.log10(40)]);
    assert.deepEqual([au.lo, au.hi], [-2, 3]);
    assert.deepEqual(ticksOf(au).map((tick) => tick.label), ['0.01 AU', '0.1 AU', '1 AU', '10 AU', '100 AU', '1,000 AU']);
    assert.ok(Math.abs(stepP(au, 0, 1, false) - 0.02) < 1e-12);
});

test('the parents offered keep the body what it is; the rings are the others around that parent, and those with no orbit are named', () => {
    const form = formOf(vell('MgT2E'));
    const list = handList(form);
    assert.deepEqual(pickParents(list, 'b2').map((item) => item.value), ['s1', 's2', 's1+s2']);
    assert.deepEqual(pickParents(list, 'b4').map((item) => item.value), ['b1', 'b2', 'b3']);
    assert.deepEqual(pickParents(list, 's2').map((item) => item.value), ['s1']);
    const around = ringsAround(form, list, 's1', 'b2', 'orbit');
    assert.deepEqual(around.rings.map((ring) => [ring.id, ring.words]), [['b1', 'Orbit 1.2 · 0.46 AU'], ['b3', pickWords('orbit', storedP(form, 'b3', 'orbit'))]]);
    // Vell B orbits Vell too, but has no orbit yet.
    assert.deepEqual(around.unplaced, ['Vell B']);
    assert.deepEqual(ringsAround(form, list, 'b2', 'b4', 'pd'), { rings: [], unplaced: [] });
});

/** A handle over the server's own form code, as Agent A's behaves: `set` replaces one change a field. */
function handDraft(start) {
    let changes = [];
    const form = ref(formOf(start));
    const handle = {
        form, dirty: ref(false), changedByEngine: ref([]), messages: ref([]), conflict: ref(null), replaced: ref(false), dropped: ref([]),
        set(id, value) {
            const at = changes.findIndex((item) => item.id === id);
            if (at >= 0) changes[at] = { id, value }; else changes.push({ id, value });
            form.value = applyForm(start, changes, []).answer.form;
        },
        add() {}, unset() {}, rollAgain() {}, async keep() { return null; }, async keepMine() {}, async takeTheirs() {}, discard() {},
    };
    return { handle, changes: () => changes };
}

test('Place gives the body to the parent picked, then sets its orbit, as draft changes the server stores', async () => {
    const start = vell('MgT2E');
    const draft = handDraft(start);
    dropEdit();
    setDraftOpener(async () => draft.handle);
    useOwnSectors(null);
    useBuildStore(null);
    await openEdit(KEY, '');
    placeOrbit('b2', 's1+s2', 'orbit', 9.2);
    assert.deepEqual(draft.changes(), [{ id: 'b2.parent', value: 's1+s2' }, { id: 'b2.orbit.id', value: 9.2 }, { id: 'b2.orbit.au', value: Number(mgt2eOrbitToAu(9.2).toPrecision(4)) }]);
    assert.equal(edit.mine['b2.orbit.id'], 9.2);
    const after = applyForm(start, draft.changes(), []).envelope;
    const ostra = after.system.bodies.find((body) => body.id === 'b2');
    assert.deepEqual([ostra.parentId, ostra.alsoParentId, ostra.orbitId, ostra.au], ['s1', 's2', 9.2, Number(mgt2eOrbitToAu(9.2).toPrecision(4))]);
    // The same parent again changes only the orbit.
    placeOrbit('b4', 'b2', 'pd', Math.log10(20));
    assert.deepEqual(draft.changes().slice(3), [{ id: 'b4.orbit.pd', value: 20 }]);
    dropEdit();
});
