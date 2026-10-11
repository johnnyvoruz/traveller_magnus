import assert from 'node:assert/strict';
import test from 'node:test';
import { FormBlank, FormDesign, HandEnvelope, SectorRev, stable } from '@voyage/shared';
import { applyForm, blankEnvelope, formOf, generateHex, handChartEntry, handFromForm, handWalk } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' };

test('a hand edit writes the document only', () => {
    const envelope = blankEnvelope('spin/2008', 'MgT2E', pinned, {});
    const before = stable(envelope);
    assert.throws(() => applyForm(envelope, [{ id: 'b1.profile.st', value: '77' }], []), /b1.profile.st|Unknown field/);
    assert.equal(stable(envelope), before);
    const starred = applyForm(envelope, [{ id: 'star.add', value: true }], []);
    const world = applyForm(starred.envelope, [{ id: 'body.add', value: true }], []);
    const named = applyForm(world.envelope, [
        { id: 'system.name', value: 'Referee' },
        { id: 'b1.profile.st', value: '7' },
        { id: 'b1.profile.s', value: 'A' },
        { id: 'b1.mainworld', value: true },
        { id: 's1.type', value: 'K' },
    ], [{ id: 's1.type' }]);
    assert.equal(named.answer.messages[0].text, 'Nothing rolls this field.');
    assert.equal(named.answer.messages[0].holds, false);
    assert.equal(named.envelope.system.name, 'Referee');
    assert.equal(named.envelope.system.stars.length, 1);
    assert.equal(named.envelope.system.stars[0].sType, 'K');
    assert.equal(named.envelope.system.bodies.length, 1);
    assert.equal(named.envelope.system.bodies[0].profile.st, '7');
    assert.equal(named.envelope.system.bodies[0].profile.s, 'A');
    assert.equal(named.envelope.kind, 'hand');
    const entry = handChartEntry(named.envelope.system, 'a'.repeat(64));
    assert.equal(entry.name, 'Referee');
    assert.equal(entry.uwp, '');
    assert.equal(entry.stars, 'K');
    const walk = handWalk(named.envelope.system);
    assert.equal(walk.stars[0].orbitAU, undefined);
    assert.equal(walk.stars[0].sType, 'K');
    assert.equal(walk.worlds[0].au, undefined);
    assert.equal(walk.worlds[0].type, 'Mainworld');
    assert.equal(walk.worlds[0].uwp, undefined);
    const held = stable(named.envelope);
    assert.throws(() => applyForm(named.envelope, [{ id: 'b1.profile.a', value: '77' }], []), /b1.profile.a cannot hold that/);
    assert.equal(stable(named.envelope), held);
});

test('a moon whose parent does not exist is refused', () => {
    const envelope = blankEnvelope('spin/2008', 'AoW', pinned, {});
    const starred = applyForm(envelope, [{ id: 'star.add', value: true }], []).envelope;
    const world = applyForm(starred, [{ id: 'body.add', value: true }], []).envelope;
    const before = stable(world);
    assert.throws(() => applyForm(world, [{ id: 'b1.kind', value: 'moon' }], []), /parent does not exist/);
    assert.equal(stable(world), before);
});

test('design by hand keeps the form and drops the engine tree', () => {
    const envelope = generateHex({
        hexKey: 'spin/1911', edition: 'MgT2E', mode: 'top-down', summary: { type: 'SYSTEM_PRESENT' }, pinned,
    });
    const form = formOf(envelope);
    const hand = handFromForm(form, 'spin/1911', '1.1.0');
    assert.equal(hand.kind, 'hand');
    assert.equal(hand.system.name, form.sections[0].fields[0].value);
    assert.equal(hand.system.stars.length > 0, true);
    assert.equal(JSON.stringify(hand).includes('mgtSystem'), false);
    assert.equal(JSON.stringify(hand).includes('mass'), false);
    const again = applyForm(hand, [{ id: hand.system.stars[0].id + '.type', value: 'M' }], []);
    assert.equal(again.envelope.system.stars[0].sType, 'M');
    assert.equal(again.envelope.system.bodies.length, hand.system.bodies.length);
    const walk = handWalk(again.envelope.system);
    assert.equal(Object.hasOwn(walk.stars[0], 'orbitAU'), false);
    assert.equal(Object.hasOwn(walk.worlds[0] ?? {}, 'journeyTimes'), false);
});

test('one draft adds several bodies, names them, and orbits two paired stars', () => {
    const blank = blankEnvelope('spin/2008', undefined, pinned, {});
    const before = stable(blank);
    const once = applyForm(blank, [
        { id: 'star.add', value: true },
        { id: 's1.name', value: 'Primary' },
        { id: 'star.add', value: 'companion' },
        { id: 'companion.name', value: 'Far' },
        { id: 'companion.parent', value: 's1' },
        { id: 'body.add', value: 'w' },
        { id: 'w.name', value: 'Both' },
        { id: 'w.parent', value: 'companion+s1' },
        { id: 'body.add', value: true },
        { id: 'b1.kind', value: 'moon' },
        { id: 'b1.parent', value: 'w' },
        { id: 'b1.name', value: 'Pip' },
        { id: 'b1.order', value: 0 },
    ], [{ id: 'w.name' }]);
    assert.equal(stable(blank), before);
    assert.equal(once.answer.messages[0].text, 'Nothing rolls this field.');
    assert.equal(once.answer.messages[0].holds, false);
    assert.equal(once.envelope.system.stars.map((star) => star.id).join(','), 's1,companion');
    assert.equal(once.envelope.system.stars[1].parentId, 's1');
    assert.equal(once.envelope.system.bodies[0].id, 'w');
    assert.equal(once.envelope.system.bodies[0].parentId, 's1');
    assert.equal(once.envelope.system.bodies[0].alsoParentId, 'companion');
    assert.equal(once.envelope.system.bodies[1].id, 'b1');
    assert.equal(once.envelope.system.bodies[1].kind, 'moon');
    assert.equal(once.envelope.system.bodies[1].parentId, 'w');
    assert.equal(once.envelope.system.bodies[1].name, 'Pip');
    const parent = once.answer.form.sections.flatMap((section) => section.fields).find((item) => item.id === 'w.parent');
    assert.equal(parent.value, 's1+companion');
    const walk = handWalk(once.envelope.system);
    const both = walk.worlds.find((world) => world.name === 'Both');
    assert.equal(both.orbitType, 'P-Type');
    assert.equal(both.parentStarIdx, 0);
    assert.equal(both.pairStarIdx, 1);
    assert.equal(Object.hasOwn(both, 'au'), false);
    assert.equal(Object.hasOwn(both, 'orbitAU'), false);
    const kept = stable(once.envelope);
    assert.throws(() => applyForm(once.envelope, [{ id: 'companion.parent', value: '' }], []), /not paired/);
    assert.equal(stable(once.envelope), kept);
    const old = HandEnvelope.parse(JSON.parse(before));
    assert.equal(stable(old), before);
    assert.equal(stable(applyForm(old, [], []).envelope), before);
    assert.equal(FormBlank.safeParse({ baseRev: 0 }).success, true);
    assert.equal(FormBlank.safeParse({ baseRev: 0, edition: 'MgT2E', starType: 'G', starSubtype: 2, starClass: 'V' }).success, true);
    assert.equal(FormDesign.safeParse({ baseRev: 0 }).success, true);
    assert.equal(SectorRev.safeParse({ baseRev: 0 }).success, false);
});

test('removing a star takes what orbits it, and a world with moons stays a world', () => {
    const blank = blankEnvelope('spin/2008', undefined, pinned, {});
    const built = applyForm(blank, [
        { id: 'star.add', value: 's1' },
        { id: 'star.add', value: 'far' },
        { id: 'far.parent', value: 's1' },
        { id: 'star.add', value: 'other' },
        { id: 'body.add', value: 'w' },
        { id: 'w.parent', value: 's1' },
        { id: 'body.add', value: 'moon' },
        { id: 'moon.kind', value: 'moon' },
        { id: 'moon.parent', value: 'w' },
        { id: 'body.add', value: 'both' },
        { id: 'both.parent', value: 's1+far' },
        { id: 'body.add', value: 'kept' },
        { id: 'kept.parent', value: 'other' },
    ], []).envelope;
    const before = stable(built);
    assert.throws(() => applyForm(built, [
        { id: 'w.kind', value: 'moon' },
        { id: 'w.parent', value: 'kept' },
    ], []), /cannot be given to another world/);
    assert.equal(stable(built), before);
    const given = applyForm(built, [
        { id: 'both.kind', value: 'moon' },
        { id: 'both.parent', value: 'kept' },
    ], []);
    const moved = given.envelope.system.bodies.find((body) => body.id === 'both');
    assert.equal(moved.kind, 'moon');
    assert.equal(moved.parentId, 'kept');
    const removed = applyForm(built, [{ id: 's1.remove', value: true }], []);
    assert.equal(stable(built), before);
    assert.deepEqual(removed.envelope.system.stars.map((star) => star.id), ['other']);
    assert.deepEqual(removed.envelope.system.bodies.map((body) => body.id), ['kept']);
    const note = removed.answer.messages.find((item) => item.id === 's1.remove');
    assert.equal(note.text, '4 bodies go with this star.');
    assert.equal(note.holds, false);
    const worldOnly = applyForm(built, [{ id: 'w.remove', value: true }], []);
    assert.equal(worldOnly.envelope.system.bodies.some((body) => body.id === 'moon'), false);
    assert.equal(worldOnly.envelope.system.bodies.some((body) => body.id === 'w'), false);
    assert.equal(worldOnly.envelope.system.bodies.some((body) => body.id === 'both'), true);
});
