import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyHandProfile } from '@voyage/shared';
import { handWalk } from '@voyage/generation';
import { overviewModel } from '../../apps/web/src/dossier/model.ts';
import { presentHand, presentTree } from '../../apps/web/src/orbit/hand_present.ts';
import { planSystem } from '../../apps/web/src/orbit/layout.ts';
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

test('an empty hand document is not an orbit model', () => {
    const system = { name: '', notes: '', stars: [], bodies: [] };
    const tree = presentTree({ kind: 'hand', hexKey: 'spin/2008', system });
    assert.equal(normalizeSystem(tree.body), null);
    assert.equal(tree.body.handSystem.stars.length, 0);
});
