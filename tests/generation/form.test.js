import assert from 'node:assert/strict';
import test from 'node:test';
import { EditForm } from '@voyage/shared';
import { stable } from '@voyage/shared';
import { applyForm, blankEnvelope, chartEntry, FormRefusal, formOf, generateHex } from '@voyage/generation';
import { loadLegacy } from '../oracle/legacy.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' };
const HEXES = ['spin/1910', 'spin/1911', 'spin/1912', 'spin/1913', 'spin/1914'];

function mgt(hexKey) {
    return generateHex({ hexKey, edition: 'MgT2E', mode: 'top-down', summary: { type: 'SYSTEM_PRESENT' }, pinned });
}
function aow(hexKey) {
    return generateHex({ hexKey, edition: 'AoW', mode: 'bottom-up', summary: { type: 'SYSTEM_PRESENT' }, pinned });
}

test('no changes keep the same bytes', () => {
    for (const hexKey of HEXES) {
        for (const envelope of [mgt(hexKey), aow(hexKey)]) {
            const form = EditForm.parse(formOf(envelope));
            assert.equal(form.sections.at(-1).id, 'rules');
            assert.equal(form.sections.at(-1).fields.length, 7);
            assert.equal(form.sections.at(-1).fields.every((item) => item.value === '' && item.permission === 'read'), true);
            const applied = applyForm(envelope, [], []);
            assert.equal(stable(applied.envelope), stable(envelope));
            assert.deepEqual(applied.answer.changed, []);
            assert.deepEqual(applied.answer.messages, []);
        }
    }
});

test('a chart field writes that field and leaves the stars', () => {
    for (const hexKey of HEXES) {
        for (const envelope of [mgt(hexKey), aow(hexKey)]) {
            const applied = applyForm(envelope, [{ id: 'chart.allegiance', value: 'Im' }], []);
            assert.equal(applied.envelope.body.allegiance, 'Im');
            const edition = applied.answer.form.edition;
            const sys = edition === 'AoW' ? applied.envelope.body.aowSystem : applied.envelope.body.mgtSystem;
            const prior = edition === 'AoW' ? envelope.body.aowSystem : envelope.body.mgtSystem;
            assert.equal(sys.stars.length, prior.stars.length);
            assert.equal(sys.stars[0].type || sys.stars[0].sType, prior.stars[0].type || prior.stars[0].sType);
            const moved = applied.answer.changed.map((item) => item.id);
            assert.equal(moved.includes('chart.allegiance'), true);
            assert.equal(applied.answer.changed.find((item) => item.id === 'chart.allegiance').why, '');
        }
    }
});

test('a profile digit is written into the UWP and does not re-roll', () => {
    const envelope = mgt(HEXES[0]);
    const applied = applyForm(envelope, [{ id: 'profile.s', value: 8 }], []);
    assert.equal(applied.envelope.body.mgt2eData.size, 8);
    assert.equal(applied.envelope.body.mgt2eData.uwp[1], '8');
    assert.equal(stable(applied.envelope.body.mgtSystem.stars), stable(envelope.body.mgtSystem.stars));
});

test('a star type is the type the legacy editor would re-run', () => {
    const ctx = loadLegacy({ seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS } });
    for (const hexKey of HEXES) {
        for (const [edition, envelope] of [['MgT2E', mgt(hexKey)], ['AoW', aow(hexKey)]]) {
            const applied = applyForm(envelope, [{ id: 'star.0.type', value: 'K' }], []);
            const sys = edition === 'AoW' ? applied.envelope.body.aowSystem : applied.envelope.body.mgtSystem;
            assert.equal(sys.stars[0].sType || sys.stars[0].type, 'K');
            const legacy = edition === 'AoW'
                ? ctx.AoWBottomUpGenerator.generateAoWSystemBottomUp(hexKey, { stars: [{ sType: 'K', type: 'K', decimal: 2, subType: 2, sClass: 'V', size: 'V', role: 'Primary', _manualFields: ['sType'] }], worlds: [], _allowAddBodies: false, age: 5 })
                : ctx.MgT2EBottomUpGenerator.generateSystem(hexKey, { stars: [{ sType: 'K', type: 'K', decimal: sys.stars[0].decimal, subType: sys.stars[0].subType, sClass: sys.stars[0].sClass || sys.stars[0].size, size: sys.stars[0].sClass || sys.stars[0].size, role: 'Primary', _manualFields: ['sType'] }], worlds: [], _allowAddBodies: false, age: 5 });
            assert.equal(legacy.stars[0].sType || legacy.stars[0].type, sys.stars[0].sType || sys.stars[0].type);
        }
    }
});

test('each typed chart field on five hexes changes only that column', () => {
    const samples = [
        ['chart.notes', 'A note from the referee'],
        ['chart.zone', 'Amber'],
        ['chart.trade', 'Ag Ri'],
        ['name', 'Kept Name'],
        ['chart.base.naval', true],
    ];
    for (const hexKey of HEXES) {
        for (const envelope of [mgt(hexKey), aow(hexKey)]) {
            for (const [id, value] of samples) {
                const applied = applyForm(envelope, [{ id, value }], []);
                const field = applied.answer.form.sections.flatMap((section) => section.fields).find((item) => item.id === id);
                if (id === 'chart.base.naval') assert.equal(field.value, true);
                else if (id === 'chart.trade') assert.equal(field.value, 'Ag Ri');
                else assert.equal(field.value, value);
            }
        }
    }
});

test('a blank system is empty and does not run the generator', () => {
    for (const edition of ['MgT2E', 'AoW']) {
        const envelope = blankEnvelope('spin/2008', edition, pinned, { sType: 'K', subType: 4, sClass: 'IV' });
        assert.equal(envelope.kind, 'hand');
        assert.equal(envelope.system.name, '');
        assert.equal(envelope.system.stars.length, 0);
        assert.equal(envelope.system.bodies.length, 0);
        assert.equal(JSON.stringify(envelope).includes('Lesotho'), false);
        const form = formOf(envelope);
        assert.equal(form.mode, 'hand');
        assert.equal(form.edition, edition);
        const added = applyForm(envelope, [{ id: 'star.add', value: true }, { id: 'body.add', value: true }], []);
        assert.equal(added.envelope.system.name, '');
        assert.equal(added.envelope.system.bodies.length, 1);
        assert.equal(added.envelope.system.bodies[0].profile.st, '');
        assert.equal(JSON.stringify(added.envelope).includes('Lesotho'), false);
        assert.equal(added.answer.changed.some((item) => item.id !== 'star.add' && item.id !== 'body.add' && String(item.id).includes('profile') && item.why), false);
    }
    const bare = blankEnvelope('spin/0101', undefined, pinned, { sType: 'G', subType: 2, sClass: 'V' });
    assert.equal(Object.hasOwn(bare, 'edition'), false);
    assert.equal(bare.system.stars.length, 0);
    assert.equal(formOf(bare).edition, undefined);
    assert.equal(formOf(bare).mode, 'hand');
});

function fieldOf(form, id) {
    return form.sections.flatMap((section) => section.fields).find((item) => item.id === id);
}

test('each profile cell changes one character and keeps the dash', () => {
    const envelope = mgt('spin/2009');
    const uwp = envelope.body.mgt2eData.uwp;
    assert.equal(uwp.length, 9);
    assert.equal(uwp[7], '-');
    const cells = [
        ['profile.st', 0],
        ['profile.s', 1],
        ['profile.a', 2],
        ['profile.h', 3],
        ['profile.p', 4],
        ['profile.g', 5],
        ['profile.l', 6],
        ['profile.tl', 8],
    ];
    for (const [id, at] of cells) {
        const next = uwp[at] === '7' ? '8' : '7';
        const value = id === 'profile.st' ? next : Number(next);
        const applied = applyForm(envelope, [{ id, value }], []);
        const written = applied.envelope.body.mgt2eData.uwp;
        assert.equal(written.length, uwp.length, id);
        assert.equal(written[7], '-', id);
        assert.equal(written[at], next, id);
        for (let i = 0; i < written.length; i += 1) {
            if (i !== at) assert.equal(written[i], uwp[i], `${id} at ${i}`);
        }
        assert.equal(stable(applied.envelope.body.mgtSystem.stars), stable(envelope.body.mgtSystem.stars), id);
    }
    const before = stable(envelope);
    assert.throws(() => applyForm(envelope, [{ id: 'profile.st', value: '77' }]), (err) => {
        assert.ok(err instanceof FormRefusal);
        assert.match(err.message, /profile\.st/);
        return true;
    });
    assert.throws(() => applyForm(envelope, [{ id: 'profile.s', value: '' }]), (err) => {
        assert.match(err.message, /profile\.s/);
        return true;
    });
    assert.equal(stable(envelope), before);
});

test('a name change changes the name and leaves the bases string', () => {
    for (const envelope of [mgt('spin/1911'), mgt('spin/2009'), aow('spin/1911')]) {
        const applied = applyForm(envelope, [{ id: 'name', value: 'Kept Name' }], []);
        assert.deepEqual(applied.answer.changed.map((item) => item.id), ['name']);
        assert.equal(fieldOf(applied.answer.form, 'name').value, 'Kept Name');
    }
    const envelope = mgt('spin/1911');
    const data = envelope.body.mgt2eData;
    data.bases = 'MS';
    data.militaryBase = true;
    data.scoutBase = true;
    const before = chartEntry(envelope.body, null).bases;
    const applied = applyForm(envelope, [{ id: 'name', value: 'Kept Name' }], []);
    assert.deepEqual(applied.answer.changed.map((item) => item.id), ['name']);
    assert.equal(fieldOf(applied.answer.form, 'chart.base.scout').value, true);
    assert.equal(fieldOf(applied.answer.form, 'chart.base.military').value, true);
    assert.equal(fieldOf(applied.answer.form, 'chart.base.merchant').value, false);
    assert.equal(chartEntry(applied.envelope.body, null).bases, before);
    assert.equal(applied.envelope.body.mgt2eData.bases, 'MS');
});

test('a star type keeps the system name and the fields typed in the draft', () => {
    for (const envelope of [mgt('spin/1911'), aow('spin/1911')]) {
        const prior = fieldOf(formOf(envelope), 'name').value;
        const starOnly = applyForm(envelope, [{ id: 'star.0.type', value: 'K' }], []);
        assert.equal(fieldOf(starOnly.answer.form, 'name').value, prior);
        assert.equal(fieldOf(starOnly.answer.form, 'star.0.type').value, 'K');
        const typed = applyForm(envelope, [
            { id: 'star.0.type', value: 'K' },
            { id: 'name', value: 'Referee Name' },
            { id: 'chart.notes', value: 'A note' },
            { id: 'profile.s', value: 4 },
        ], []);
        assert.equal(fieldOf(typed.answer.form, 'name').value, 'Referee Name');
        assert.equal(fieldOf(typed.answer.form, 'chart.notes').value, 'A note');
        assert.equal(fieldOf(typed.answer.form, 'profile.s').value, 4);
        assert.equal(fieldOf(typed.answer.form, 'star.0.type').value, 'K');
        const uwp = (typed.envelope.body.mgt2eData || {}).uwp || '';
        if (uwp.length >= 2) assert.equal(uwp[1], '4');
    }
});

test('rolling a body on Architect of Worlds does not run', () => {
    const envelope = aow(HEXES[0]);
    const applied = applyForm(envelope, [], [{ id: 'body.0' }]);
    assert.equal(applied.answer.messages[0].text, 'Regeneration is only available for MgT2E systems.');
    assert.equal(stable(applied.envelope), stable(envelope));
});
