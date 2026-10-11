import assert from 'node:assert/strict';
import test from 'node:test';
import { rollBodyProfile } from '@voyage/engines';
import { applyForm, blankEnvelope, formOf } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' };

function starSystem() {
    const blank = blankEnvelope('spin/2008', 'MgT2E', pinned, {});
    return applyForm(blank, [
        { id: 'star.add', value: 's1' },
        { id: 's1.type', value: 'G' },
        { id: 's1.subtype', value: '2' },
        { id: 's1.class', value: 'V' },
        { id: 'body.add', value: 'main' },
        { id: 'main.mainworld', value: true },
        { id: 'main.profile.st', value: 'A' },
        { id: 'main.profile.s', value: '7' },
        { id: 'main.profile.a', value: '8' },
        { id: 'main.profile.h', value: '8' },
        { id: 'main.profile.p', value: '8' },
        { id: 'main.profile.g', value: '5' },
        { id: 'main.profile.l', value: '5' },
        { id: 'main.profile.tl', value: 'A' },
        { id: 'body.add', value: 'w' },
        { id: 'w.orbit.id', value: 3 },
        { id: 'w.orbit.au', value: 1 },
        { id: 'w.orbit.eccentricity', value: 0.01 },
    ], []).envelope;
}

test('one body rolls the same profile three times from one seed', () => {
    const input = {
        hexId: 'spin/2008',
        bodyId: 'w',
        stars: [{ sType: 'G', subType: '2', sClass: 'V' }],
        body: { kind: 'world', name: 'World', orbitId: 3, au: 1, eccentricity: 0.01, parentStarIndex: 0, alsoParentIndex: null },
        mainworld: { name: 'Main', starport: 'A', size: 7, atm: 8, hydro: 8, pop: 8, gov: 5, law: 5, tl: 10 },
        isMainworld: false,
    };
    const first = rollBodyProfile({ ...input, roll: 0 });
    const second = rollBodyProfile({ ...input, roll: 0 });
    const third = rollBodyProfile({ ...input, roll: 0 });
    assert.equal(first.message, 'Rolled this profile.');
    assert.deepEqual(second.cells, first.cells);
    assert.deepEqual(third.cells, first.cells);
    assert.equal(Object.keys(first.cells).length, 8);
    const next = rollBodyProfile({ ...input, roll: 1 });
    assert.notDeepEqual(next.cells, first.cells);
});

test('a hand profile roll stays on the draft until it is kept', () => {
    const envelope = starSystem();
    const before = JSON.stringify(envelope);
    const once = applyForm(envelope, [], [{ id: 'w.profile.roll' }]);
    assert.equal(JSON.stringify(envelope), before);
    assert.equal(once.answer.messages[0].text, 'Rolled this profile.');
    assert.equal(once.answer.messages[0].holds, false);
    assert.equal(once.envelope.system.bodies.find((body) => body.id === 'w').profileRoll, 1);
    const profile = once.envelope.system.bodies.find((body) => body.id === 'w').profile;
    assert.equal(Object.values(profile).every((cell) => cell.length === 1), true);
    const twice = applyForm(once.envelope, [], [{ id: 'w.profile.roll' }]);
    assert.equal(twice.envelope.system.bodies.find((body) => body.id === 'w').profileRoll, 2);
    assert.notDeepEqual(twice.envelope.system.bodies.find((body) => body.id === 'w').profile, profile);
    const repeated = applyForm(envelope, [], [{ id: 'w.profile.roll' }]);
    assert.deepEqual(repeated.envelope.system.bodies.find((body) => body.id === 'w').profile, profile);
});

test('a mainworld roll leaves the social cells, and a gas giant writes none', () => {
    const envelope = starSystem();
    const main = applyForm(envelope, [{ id: 'main.orbit.au', value: 1 }, { id: 'main.orbit.id', value: 3 }], [{ id: 'main.profile.roll' }]);
    assert.match(main.answer.messages[0].text, /This is the mainworld/);
    assert.equal(main.envelope.system.bodies.find((body) => body.id === 'main').profile.p, '8');
    assert.equal(main.envelope.system.bodies.find((body) => body.id === 'main').profile.s.length, 1);
    const gas = applyForm(envelope, [{ id: 'body.add', value: 'g' }, { id: 'g.kind', value: 'gas' }, { id: 'g.orbit.id', value: 8 }], [{ id: 'g.profile.roll' }]);
    assert.match(gas.answer.messages[0].text, /nothing was written/i);
    assert.equal(gas.envelope.system.bodies.find((body) => body.id === 'g').profile.s, '');
    assert.equal(gas.envelope.system.bodies.find((body) => body.id === 'g').profileRoll, undefined);
});

test('a belt roll is not locked, and a belt around a world uses the moon orbit fields', () => {
    const envelope = starSystem();
    const made = applyForm(envelope, [
        { id: 'body.add', value: 'belt' },
        { id: 'belt.kind', value: 'belt' },
        { id: 'belt.parent', value: 'w' },
        { id: 'belt.orbit.pd', value: 4 },
        { id: 'belt.orbit.eccentricity', value: 1e6 },
    ], [{ id: 'belt.profile.roll' }]);
    const belt = made.envelope.system.bodies.find((body) => body.id === 'belt');
    assert.equal(belt.parentId, 'w');
    assert.equal(belt.pd, 4);
    assert.equal(belt.eccentricity, 1e6);
    assert.equal(belt.periodYears, undefined);
    const ids = made.answer.form.sections.flatMap((section) => section.fields);
    for (const cell of ['st', 's', 'a', 'h', 'p', 'g', 'l', 'tl']) {
        const field = ids.find((item) => item.id === `belt.profile.${cell}`);
        assert.equal(field.permission, 'type');
    }
    assert.equal(belt.profile.s, '0');
    assert.throws(() => applyForm(made.envelope, [{ id: 'belt.orbit.eccentricity', value: Number.POSITIVE_INFINITY }], []), /cannot hold that/);
    assert.throws(() => applyForm(envelope, [{ id: 'body.add', value: 'other' }, { id: 'other.parent', value: 'w' }], []), /A world orbits a star/);
});

test('rulings that stay as they were: moon period, shared orbit, inner orbit, and an edition that is not MgT2E', () => {
    const envelope = starSystem();
    assert.throws(() => applyForm(envelope, [{ id: 'body.add', value: 'moon' }, { id: 'moon.kind', value: 'moon' }, { id: 'moon.parent', value: 'w' }, { id: 'moon.orbit.years', value: 1 }], []), /Unknown field/);
    const shared = applyForm(envelope, [
        { id: 'body.add', value: 'near' },
        { id: 'near.orbit.id', value: 0 },
        { id: 'body.add', value: 'far' },
        { id: 'far.orbit.id', value: 0 },
    ], []);
    const orbits = shared.envelope.system.bodies.filter((body) => body.id === 'near' || body.id === 'far').map((body) => body.orbitId);
    assert.deepEqual(orbits, [0, 0]);
    const aow = blankEnvelope('spin/2008', 'AoW', pinned, {});
    const rolled = applyForm(aow, [{ id: 'star.add', value: 's1' }, { id: 'body.add', value: 'w' }], [{ id: 'w.profile.roll' }]);
    assert.equal(rolled.answer.messages[0].text, 'Nothing rolls this field.');
    const form = formOf(envelope);
    const beltFields = form.sections.flatMap((section) => section.fields).filter((field) => field.id.startsWith('main.profile.'));
    assert.equal(beltFields.length, 8);
    assert.equal(beltFields.every((field) => field.permission === 'type'), true);
});
