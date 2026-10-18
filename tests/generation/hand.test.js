import assert from 'node:assert/strict';
import test from 'node:test';
import { FormBlank, FormDesign, HandEnvelope, MGT2E_ORBIT_AU, SectorRev, mgt2eAuToOrbit, mgt2eOrbitToAu, stable } from '@voyage/shared';
import { MGT2E_ORBIT_AU as ENGINE_ORBIT_AU } from '@voyage/engines';
import { applyForm, blankEnvelope, formOf, generateHex, handChartEntry, handFromForm, handWalk } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' };

test('a hand edit writes the document only', () => {
    const envelope = blankEnvelope('spin/2008', 'MgT2E', pinned, {});
    const before = stable(envelope);
    assert.throws(() => applyForm(envelope, [{ id: 'b1.profile.st', value: '77' }], []), /Starport cannot hold that/);
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
    assert.equal(named.answer.messages[0].text, 'This field cannot be rolled.');
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
    assert.throws(() => applyForm(named.envelope, [{ id: 'b1.profile.a', value: '77' }], []), /Atmosphere cannot hold that/);
    assert.equal(stable(named.envelope), held);
});

test('a moon whose parent does not exist is refused', () => {
    const envelope = blankEnvelope('spin/2008', 'AoW', pinned, {});
    const starred = applyForm(envelope, [{ id: 'star.add', value: true }], []).envelope;
    const world = applyForm(starred, [{ id: 'body.add', value: true }], []).envelope;
    const before = stable(world);
    assert.throws(() => applyForm(world, [{ id: 'b1.kind', value: 'moon' }], []), /Choose a world for this moon/);
    assert.equal(stable(world), before);
});

test('design by hand copies the orbit numbers the generated rows already hold', () => {
    const envelope = generateHex({
        hexKey: 'spin/1911', edition: 'MgT2E', mode: 'top-down', summary: { type: 'SYSTEM_PRESENT' }, pinned,
    });
    const raw = envelope.body.mgtSystem;
    const hand = handFromForm(formOf(envelope), 'spin/1911', '1.1.0', envelope);
    const walk = handWalk(hand.system);
    assert.equal(walk.stars.length, raw.stars.length);
    let sawWorldAu = false;
    raw.stars.forEach((star, index) => {
        const row = walk.stars[index];
        if (typeof star.orbitId === 'number') assert.equal(row.orbitId, star.orbitId);
        else assert.equal(Object.hasOwn(row, 'orbitId'), false);
        const orbitAU = typeof star.orbitAU === 'number' ? star.orbitAU : star.distAU;
        if (typeof orbitAU === 'number') assert.equal(row.orbitAU, orbitAU);
        else assert.equal(Object.hasOwn(row, 'orbitAU'), false);
        if (typeof star.eccentricity === 'number') assert.equal(row.eccentricity, star.eccentricity);
        else assert.equal(Object.hasOwn(row, 'eccentricity'), false);
        if (typeof star.periodYears === 'number') assert.equal(row.periodYears, star.periodYears);
        else assert.equal(Object.hasOwn(row, 'periodYears'), false);
    });
    const worlds = raw.worlds.filter((world) => world && world.type !== 'Empty');
    assert.equal(walk.worlds.length, worlds.length);
    worlds.forEach((world, index) => {
        const row = walk.worlds[index];
        if (typeof world.orbitId === 'number') assert.equal(row.orbitId, world.orbitId);
        else assert.equal(Object.hasOwn(row, 'orbitId'), false);
        const au = typeof world.au === 'number' ? world.au : (typeof world.orbitalRadius === 'number' ? world.orbitalRadius : world.distAU);
        if (typeof au === 'number') {
            assert.equal(row.au, au);
            sawWorldAu = true;
        } else assert.equal(Object.hasOwn(row, 'au'), false);
        if (typeof world.eccentricity === 'number') assert.equal(row.eccentricity, world.eccentricity);
        const belt = String(world.type || '').toLowerCase().includes('belt');
        if (belt) assert.equal(Object.hasOwn(row, 'periodYears'), false);
        else if (typeof world.periodYears === 'number') assert.equal(row.periodYears, world.periodYears);
        const moons = world.moons || world.satellites || [];
        moons.forEach((moon, moonIndex) => {
            const nested = row.moons[moonIndex];
            if (typeof moon.pd === 'number') assert.equal(nested.pd, moon.pd);
            else assert.equal(Object.hasOwn(nested, 'pd'), false);
            if (typeof moon.eccentricity === 'number') assert.equal(nested.eccentricity, moon.eccentricity);
        });
    });
    assert.equal(sawWorldAu, true);
    const label = hand.system.stars[0];
    const shown = formOf(hand).sections.flatMap((section) => section.fields).find((item) => item.id === `${label.id}.classText`);
    assert.equal(shown.permission, 'read');
    assert.equal(shown.label, 'Spectral class');
    assert.equal(typeof shown.value === 'string' && shown.value !== '', true);
    const again = HandEnvelope.parse(JSON.parse(JSON.stringify(hand)));
    again.system.stars[0].sType = 'Q';
    const kept = applyForm(again, [{ id: 'system.name', value: 'Kept' }], []);
    assert.equal(kept.envelope.system.stars[0].sType, 'Q');
    assert.throws(() => applyForm(hand, [{ id: `${label.id}.type`, value: 'Q' }], []), /Choose a Type from the list/);
    const dwarf = applyForm(hand, [{ id: `${label.id}.type`, value: 'D' }], []);
    assert.equal(dwarf.envelope.system.stars[0].sClass, 'D');
    assert.equal(dwarf.envelope.system.stars[0].subType, '0');
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
    assert.equal(once.answer.messages[0].text, 'This field cannot be rolled.');
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
    assert.equal(note.text, 'Removing this star also removes 4 bodies.');
    assert.equal(note.holds, false);
    const worldOnly = applyForm(built, [{ id: 'w.remove', value: true }], []);
    assert.equal(worldOnly.envelope.system.bodies.some((body) => body.id === 'moon'), false);
    assert.equal(worldOnly.envelope.system.bodies.some((body) => body.id === 'w'), false);
    assert.equal(worldOnly.envelope.system.bodies.some((body) => body.id === 'both'), true);
});

test('orbit numbers are optional, order stays a list index, and a belt drops a year', () => {
    const blank = blankEnvelope('spin/2008', 'MgT2E', pinned, {});
    const built = applyForm(blank, [
        { id: 'star.add', value: 's1' },
        { id: 'star.add', value: 'far' },
        { id: 'far.parent', value: 's1' },
        { id: 'body.add', value: 'w' },
        { id: 'body.add', value: 'g' },
        { id: 'g.kind', value: 'gas' },
        { id: 'body.add', value: 'belt' },
        { id: 'belt.kind', value: 'belt' },
        { id: 'body.add', value: 'moon' },
        { id: 'moon.kind', value: 'moon' },
        { id: 'moon.parent', value: 'w' },
    ], []).envelope;
    const placed = applyForm(built, [
        { id: 'far.orbit.id', value: 1.5 },
        { id: 'far.orbit.au', value: 0.55 },
        { id: 'far.orbit.eccentricity', value: 0.1 },
        { id: 'far.orbit.years', value: 0.4 },
        { id: 'far.order', value: 3 },
        { id: 'w.orbit.id', value: 3 },
        { id: 'w.orbit.au', value: 1 },
        { id: 'w.orbit.eccentricity', value: 0.02 },
        { id: 'w.orbit.years', value: 1 },
        { id: 'w.order', value: 9 },
        { id: 'g.orbit.id', value: 3 },
        { id: 'g.orbit.au', value: 1 },
        { id: 'belt.orbit.id', value: 4 },
        { id: 'belt.orbit.au', value: 1.6 },
        { id: 'belt.orbit.years', value: 2 },
        { id: 'belt.orbit.days', value: 700 },
        { id: 'belt.orbit.hours', value: 20 },
        { id: 'moon.orbit.pd', value: 12 },
        { id: 'moon.orbit.eccentricity', value: 0.05 },
    ], [{ id: 'w.profile.roll' }]);
    assert.equal(placed.answer.messages[0].text, 'Rolled size, atmosphere, and hydrographics. Population, government, law, starport, and tech level need another body\'s mainworld profile. Set Type, Subtype, and Class.');
    const far = placed.envelope.system.stars.find((star) => star.id === 'far');
    assert.equal(far.orbitId, 1.5);
    assert.equal(far.orbitAU, 0.55);
    assert.equal(far.periodYears, 0.4);
    assert.equal(far.order, 3);
    const world = placed.envelope.system.bodies.find((body) => body.id === 'w');
    const gas = placed.envelope.system.bodies.find((body) => body.id === 'g');
    const belt = placed.envelope.system.bodies.find((body) => body.id === 'belt');
    const moon = placed.envelope.system.bodies.find((body) => body.id === 'moon');
    assert.equal(world.au, 1);
    assert.equal(world.orbitId, 3);
    assert.equal(world.order, 9);
    assert.equal(gas.orbitId, 3);
    assert.equal(belt.au, 1.6);
    assert.equal(belt.periodYears, undefined);
    assert.equal(moon.pd, 12);
    const ids = placed.answer.form.sections.flatMap((section) => section.fields).map((item) => item.id);
    assert.equal(ids.includes('belt.orbit.years'), false);
    assert.equal(ids.includes('belt.orbit.au'), true);
    assert.equal(ids.includes('moon.orbit.pd'), true);
    assert.equal(ids.includes('moon.orbit.au'), false);
    assert.equal(ids.includes('w.orbit.years'), true);
    const walk = handWalk(placed.envelope.system);
    const companion = walk.stars.find((star) => star.name === '' && star.orbitAU === 0.55);
    assert.equal(companion.orbitId, 1.5);
    assert.equal(companion.separation, 'Companion');
    const drawn = walk.worlds.find((item) => item.au === 1 && item.orbitId === 3 && item.type !== 'Gas Giant');
    assert.equal(drawn.orbitType, 'S-Type');
    assert.equal(drawn.periodYears, 1);
    const beltRow = walk.worlds.find((item) => item.type === 'Planetoid Belt');
    assert.equal(beltRow.au, 1.6);
    assert.equal(Object.hasOwn(beltRow, 'periodYears'), false);
    assert.equal(drawn.moons[0].pd, 12);
    const cleared = applyForm(placed.envelope, [{ id: 'w.orbit.au', value: null }], []);
    assert.equal(cleared.envelope.system.bodies.find((body) => body.id === 'w').au, undefined);
    assert.equal(cleared.envelope.system.bodies.find((body) => body.id === 'w').orbitId, 3);
    const held = stable(placed.envelope);
    assert.throws(() => applyForm(placed.envelope, [{ id: 'w.orbit.au', value: 'near' }], []), /AU cannot hold that/);
    assert.throws(() => applyForm(placed.envelope, [{ id: 'moon.orbit.au', value: 1 }], []), /no field with that name/);
    assert.throws(() => applyForm(placed.envelope, [{ id: 'w.parent', value: 'g' }], []), /Choose a star for this body/);
    const around = applyForm(placed.envelope, [{ id: 'belt.parent', value: 'w' }], []);
    const aroundBelt = around.envelope.system.bodies.find((body) => body.id === 'belt');
    assert.equal(aroundBelt.parentId, 'w');
    assert.equal(aroundBelt.au, undefined);
    assert.equal(aroundBelt.pd, undefined);
    const aroundIds = around.answer.form.sections.flatMap((section) => section.fields).map((item) => item.id);
    assert.equal(aroundIds.includes('belt.orbit.pd'), true);
    assert.equal(aroundIds.includes('belt.orbit.au'), false);
    assert.equal(aroundIds.includes('belt.orbit.years'), false);
    const aroundWalk = handWalk(around.envelope.system);
    const host = aroundWalk.worlds.find((item) => item.type !== 'Gas Giant' && item.type !== 'Planetoid Belt');
    assert.equal(host.moons.some((moon) => moon.type === 'Planetoid Belt' && moon.isMoon !== true), true);
    assert.equal(aroundWalk.worlds.some((item) => item.type === 'Planetoid Belt'), false);
    const removedWorld = applyForm(around.envelope, [{ id: 'w.remove', value: true }], []);
    assert.equal(removedWorld.envelope.system.bodies.some((body) => body.id === 'belt'), false);
    assert.equal(removedWorld.envelope.system.bodies.some((body) => body.id === 'moon'), false);
    assert.equal(stable(placed.envelope), held);
    const old = HandEnvelope.parse({ kind: 'hand', engineVersion: '1.1.0', hexKey: 'spin/2008', system: built.system });
    assert.equal(old.system.bodies[0].au, undefined);
});

test('the MgT2E orbit helper matches the engine table and does not convert a stored field', () => {
    assert.deepEqual([...MGT2E_ORBIT_AU], [...ENGINE_ORBIT_AU]);
    assert.equal(mgt2eOrbitToAu(0), 0);
    assert.equal(mgt2eOrbitToAu(3), 1);
    assert.equal(mgt2eOrbitToAu(3.5), 1.3);
    assert.equal(mgt2eOrbitToAu(20), 78700);
    assert.equal(mgt2eAuToOrbit(1), 3);
    assert.equal(mgt2eAuToOrbit(1.3), 3.5);
    assert.equal(mgt2eAuToOrbit(80000), 20);
    assert.equal(Number.isNaN(mgt2eOrbitToAu(-1)), true);
});
