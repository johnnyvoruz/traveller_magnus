import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHand, blankHand, formOfHand, HandRefusal } from '../../packages/generation/src/hand.ts';

test('blankHand is an empty system, and the edition is stored only when one is given', () => {
    const plain = blankHand('Spinward_Marches/1910', undefined, '1.2.0');
    assert.equal(plain.kind, 'hand');
    assert.equal(plain.hexKey, 'Spinward_Marches/1910');
    assert.equal(plain.engineVersion, '1.2.0');
    assert.equal(plain.edition, undefined);
    assert.deepEqual(plain.system, { name: '', notes: '', stars: [], bodies: [] });
    const marked = blankHand('Spinward_Marches/1910', 'AoW', '1.2.0');
    assert.equal(marked.edition, 'AoW');
});

test('formOfHand of an empty system is the name, the notes, an add, and the seven read-only rules', () => {
    const form = formOfHand(blankHand('Spinward_Marches/1910', 'MgT2E', '1.2.0'));
    assert.equal(form.mode, 'hand');
    assert.equal(form.edition, 'MgT2E');
    assert.deepEqual(form.sections.map((section) => section.id), ['name', 'notes', 'stars', 'bodies', 'rules']);
    assert.equal(form.sections[0].fields[0].id, 'system.name');
    assert.equal(form.sections[0].fields[0].value, '');
    assert.deepEqual(form.sections[2].fields.map((field) => field.id), ['star.add']);
    assert.equal(form.sections[2].fields[0].value, false);
    assert.deepEqual(form.sections[3].fields.map((field) => field.id), ['body.add']);
    assert.equal(form.sections[4].fields.length, 7);
    assert.equal(form.sections[4].fields.every((field) => field.permission === 'read' && field.value === ''), true);
    assert.equal(formOfHand(blankHand('Spinward_Marches/1910', undefined, '1.2.0')).edition, undefined);
});

test('applyHand with nothing pending returns the same system, and a name is written', () => {
    const envelope = blankHand('Spinward_Marches/1910', 'MgT2E', '1.2.0');
    const quiet = applyHand(envelope);
    assert.equal(quiet.envelope, envelope);
    assert.deepEqual(quiet.answer.changed, []);
    assert.deepEqual(quiet.answer.messages, []);
    const named = applyHand(envelope, [{ id: 'system.name', value: 'Regina' }]);
    assert.equal(named.envelope.system.name, 'Regina');
    assert.deepEqual(named.answer.changed.map((item) => item.id), ['system.name']);
    assert.throws(
        () => applyHand(envelope, [{ id: 'system.name', value: 'R'.repeat(81) }]),
        HandRefusal,
    );
});

test('applyHand refuses a read-only rule, a world with no star, and a profile of two characters', () => {
    const envelope = blankHand('Spinward_Marches/1910', 'MgT2E', '1.2.0');
    assert.throws(() => applyHand(envelope, [{ id: 'rule.R1', value: 'x' }]), /cannot edit Profile digits/);
    assert.throws(() => applyHand(envelope, [{ id: 'body.add', value: true }]), /A world needs a star/);
    const withStar = applyHand(envelope, [{ id: 'star.add', value: true }]);
    assert.equal(withStar.envelope.system.stars.length, 1);
    assert.equal(withStar.envelope.system.stars[0].id, 's1');
    assert.throws(
        () => applyHand(withStar.envelope, [
            { id: 'body.add', value: true },
            { id: 'b1.profile.s', value: 'AB' },
        ]),
        /one character/,
    );
    const world = applyHand(withStar.envelope, [
        { id: 'body.add', value: true },
        { id: 'b1.profile.s', value: '8' },
    ]);
    assert.equal(world.envelope.system.bodies[0].profile.s, '8');
    assert.equal(world.envelope.system.bodies[0].parentId, 's1');
});
