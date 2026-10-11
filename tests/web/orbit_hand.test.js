import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyHandProfile } from '@voyage/shared';
import { handWalk } from '@voyage/generation';
import { overviewModel } from '../../apps/web/src/dossier/model.ts';
import { cardFor } from '../../apps/web/src/orbit/card.ts';
import { yearFigure } from '../../apps/web/src/orbit/daynight.ts';
import { presentHand, presentTree } from '../../apps/web/src/orbit/hand_present.ts';
import { layoutScene, moonOrbitRadius, planSystem } from '../../apps/web/src/orbit/layout.ts';
import { DEFAULT_LAYERS, orbitPicture } from '../../apps/web/src/orbit/picture.ts';
import { normalizeSystem } from '../../apps/web/src/orbit/system.ts';

const profile = emptyHandProfile();

test('a hand document is presented as the walk the dossier already reads', () => {
    const system = {
        name: 'Hand',
        notes: '',
        stars: [
            { id: 's0', name: 'Primary', sType: 'G', subType: '2', sClass: 'V', parentId: null, order: 0 },
            { id: 's1', name: 'Far', sType: 'M', subType: '5', sClass: 'V', parentId: 's0', order: 1 },
        ],
        bodies: [
            { id: 'b0', kind: 'world', name: 'Prime', parentId: 's0', order: 0, mainworld: true, profile, notes: '', bases: '', zone: '', allegiance: '', trade: '' },
            { id: 'm0', kind: 'moon', name: 'Lune', parentId: 'b0', order: 0, mainworld: false, profile, notes: '', bases: '', zone: '', allegiance: '', trade: '' },
        ],
    };
    assert.deepEqual(presentHand(system), handWalk(system));
    const tree = presentTree({ kind: 'hand', hexKey: 'spin/2008', system });
    const drawn = normalizeSystem(tree.body);
    assert.equal(drawn.edition, 'hand');
    assert.equal(drawn.stars.length, 2);
    assert.equal(drawn.stars[1].orbitAU, undefined);
    assert.equal(drawn.worlds[0].au, undefined);
    assert.equal(drawn.worlds[0].moons.length, 1);
});

test('a world that orbits two stars keeps their names and is not drawn', () => {
    const system = {
        name: 'Hand',
        notes: '',
        stars: [
            { id: 's1', name: 'Aster', sType: 'G', subType: '2', sClass: 'V', parentId: null, order: 0 },
            { id: 's2', name: 'Aster B', sType: 'M', subType: '4', sClass: 'V', parentId: 's1', order: 1 },
        ],
        bodies: [
            { id: 'b1', kind: 'world', name: 'Both', parentId: 's1', alsoParentId: 's2', order: 0, mainworld: false, profile, notes: '', bases: '', zone: '', allegiance: '', trade: '' },
        ],
    };
    assert.deepEqual(presentHand(system), handWalk(system));
    const walked = presentHand(system).worlds[0];
    assert.equal(walked.orbitType, 'P-Type');
    assert.equal(walked.parentStarIdx, 0);
    assert.equal(walked.pairStarIdx, 1);
    assert.equal(Object.hasOwn(walked, 'au'), false);
    const tree = presentTree({ kind: 'hand', hexKey: 'own/0101', system });
    const plan = planSystem(normalizeSystem(tree.body), 'own/0101');
    assert.equal(plan.sets.every((set) => set.length === 0), true);
    assert.equal(plan.worlds[0].au, 0);
    const model = overviewModel({
        sectorName: 'Far Home',
        subsectorName: '',
        hex: '0101',
        entry: { name: 'Hand', hex: '0101', uwp: '', tree: 'h' },
        tree,
    });
    const row = model.tree.rows.find((item) => item.name === 'Both');
    assert.ok(row.facts.includes('orbits Aster and Aster B'));
});

function body(over) {
    return {
        id: 'b0',
        kind: 'world',
        name: 'Prime',
        parentId: 's0',
        order: 0,
        mainworld: false,
        profile,
        notes: '',
        bases: '',
        zone: '',
        allegiance: '',
        trade: '',
        ...over,
    };
}

test('stored orbit numbers are copied, and a body without them is unchanged', () => {
    const bare = {
        name: 'Hand',
        notes: '',
        stars: [
            { id: 's0', name: 'Primary', sType: 'G', subType: '2', sClass: 'V', parentId: null, order: 0 },
        ],
        bodies: [body({})],
    };
    const walked = presentHand(bare);
    assert.equal(Object.hasOwn(walked.stars[0], 'orbitAU'), false);
    assert.equal(Object.hasOwn(walked.worlds[0], 'au'), false);
    assert.equal(Object.hasOwn(walked.worlds[0], 'orbitType'), false);
    assert.deepEqual(presentHand(bare), handWalk(bare));

    const placed = {
        name: 'Hand',
        notes: '',
        stars: [
            { id: 's0', name: 'Primary', sType: 'G', subType: '2', sClass: 'V', parentId: null, order: 0 },
            {
                id: 's1', name: 'Far', sType: 'M', subType: '5', sClass: 'V', parentId: 's0', order: 1,
                orbitId: 11, orbitAU: 19.4, eccentricity: 0.2, periodYears: 80,
            },
        ],
        bodies: [
            body({ id: 'w0', name: 'Inner', order: 0, orbitId: 3, au: 0.5, eccentricity: 0.01, periodYears: 0.35 }),
            body({ id: 'w1', kind: 'gas', name: 'Giant', order: 1, orbitId: 8, au: 5.2, eccentricity: 0.04, periodYears: 11.8 }),
            body({
                id: 'belt', kind: 'belt', name: 'Dust', order: 2, orbitId: 4, au: 2.8, eccentricity: 0,
                periodYears: 4.7, periodDays: 1700, periodHours: 40000, siderealHours: 9, solarDayHours: 10,
            }),
            body({ id: 'm0', kind: 'moon', name: 'Lune', parentId: 'w0', order: 0, pd: 25, eccentricity: 0.03 }),
        ],
    };
    assert.deepEqual(presentHand(placed), handWalk(placed));
    const star = presentHand(placed).stars[1];
    assert.equal(star.separation, 'Companion');
    assert.equal(star.orbitAU, 19.4);
    assert.equal(star.orbitId, 11);
    assert.equal(star.periodYears, 80);
    const worlds = presentHand(placed).worlds;
    assert.equal(worlds[0].orbitType, 'S-Type');
    assert.equal(worlds[0].parentStarIdx, 0);
    assert.equal(worlds[0].au, 0.5);
    assert.equal(worlds[0].periodYears, 0.35);
    assert.equal(worlds[1].au, 5.2);
    assert.equal(worlds[1].periodYears, 11.8);
    const belt = worlds[2];
    assert.equal(belt.type, 'Planetoid Belt');
    assert.equal(belt.au, 2.8);
    assert.equal(belt.orbitType, 'S-Type');
    assert.equal(Object.hasOwn(belt, 'periodYears'), false);
    assert.equal(Object.hasOwn(belt, 'periodDays'), false);
    assert.equal(Object.hasOwn(belt, 'periodHours'), false);
    assert.equal(Object.hasOwn(belt, 'siderealHours'), false);
    assert.equal(Object.hasOwn(belt, 'solarDayHours'), false);
    assert.equal(worlds[0].moons[0].pd, 25);
    assert.equal(worlds[0].moons[0].eccentricity, 0.03);
    const plan = planSystem(normalizeSystem(presentTree({ kind: 'hand', hexKey: 'own/0102', system: placed }).body), 'own/0102');
    const drawn = plan.worlds.filter((world) => world.name === 'Inner' || world.name === 'Giant');
    assert.deepEqual(drawn.map((world) => world.au), [0.5, 5.2]);
    assert.equal(drawn[0].au < drawn[1].au, true);
    const beltWorld = plan.worlds.find((world) => world.name === 'Dust');
    const card = cardFor(plan, 'belt', beltWorld.key, 0);
    assert.equal(card.lines.some((line) => /year|period/i.test(line.label)), false);
    assert.equal(yearFigure({ type: 'Planetoid Belt', yearHours: 41172, periodYears: 4.7 }), null);
    assert.ok(yearFigure({ type: 'World', yearHours: 8766 }));
});

test('a belt around a world is nested like the walk, drawn as a belt, and has no year', () => {
    const system = {
        name: 'Hand',
        notes: '',
        stars: [
            { id: 's0', name: 'Primary', sType: 'G', subType: '2', sClass: 'V', parentId: null, order: 0 },
        ],
        bodies: [
            { id: 'b0', kind: 'world', name: 'Rock', parentId: 's0', order: 0, au: 1, mainworld: true, profile, notes: '', bases: '', zone: '', allegiance: '', trade: '' },
            { id: 'm0', kind: 'moon', name: 'Lune', parentId: 'b0', order: 0, pd: 12, mainworld: false, profile, notes: '', bases: '', zone: '', allegiance: '', trade: '' },
            { id: 'd0', kind: 'belt', name: 'Dust', parentId: 'b0', order: 1, pd: 25, eccentricity: 0.1, periodYears: 4, mainworld: false, profile, notes: '', bases: '', zone: '', allegiance: '', trade: '' },
        ],
    };
    assert.deepEqual(presentHand(system), handWalk(system));
    const host = presentHand(system).worlds[0];
    assert.equal(host.name, 'Rock');
    assert.equal(host.moons.length, 2);
    assert.equal(host.moons[0].isMoon, true);
    assert.equal(host.moons[1].type, 'Planetoid Belt');
    assert.equal(host.moons[1].pd, 25);
    assert.equal(Object.hasOwn(host.moons[1], 'isMoon'), false);
    assert.equal(Object.hasOwn(host.moons[1], 'periodYears'), false);
    const plan = planSystem(normalizeSystem(presentTree({ kind: 'hand', hexKey: 'own/0102', system }).body), 'own/0102');
    const world = plan.worlds[0];
    assert.equal(world.moons.length, 1);
    assert.equal(world.moons[0].name, 'Lune');
    assert.equal(world.hostedBelts.length, 1);
    assert.equal(world.hostedBelts[0].name, 'Dust');
    const view = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false, moons: true, jump: true };
    const picture = orbitPicture(plan, layoutScene(plan, view, 0), DEFAULT_LAYERS, view.z);
    const drawn = picture.layers.flatMap((layer) => layer.worlds).find((at) => at.world.key === world.key);
    const band = picture.layers.flatMap((layer) => layer.paths).find((path) => path.key === world.hostedBelts[0].key);
    const orbit = picture.layers.flatMap((layer) => layer.paths).find((path) => path.key === world.key && path.style !== 'belt');
    assert.equal(band.style, 'belt');
    assert.equal(band.cx, drawn.x);
    assert.equal(band.cy, drawn.y);
    assert.equal(band.r, moonOrbitRadius(drawn.r, world.hostedBelts[0].index, world.ringed, view.z));
    assert.equal(orbit.r > band.r * 4, true);
    const beltCard = cardFor(plan, 'belt', world.hostedBelts[0].key, 0);
    assert.equal(beltCard.sub, 'Planetoid Belt');
    assert.equal(beltCard.lines.some((line) => line.label === 'Distance' && line.value.includes('PD')), true);
    assert.equal(beltCard.lines.some((line) => /year|period|day/i.test(line.label)), false);
    const rock = cardFor(plan, 'world', world.key, 0);
    assert.equal(rock.lines.find((line) => line.label === 'Moons').value, '1');
});

test('an empty hand document is not an orbit model', () => {
    const system = { name: '', notes: '', stars: [], bodies: [] };
    const tree = presentTree({ kind: 'hand', hexKey: 'spin/2008', system });
    assert.equal(normalizeSystem(tree.body), null);
    assert.equal(tree.body.handSystem.stars.length, 0);
});
