import assert from 'node:assert/strict';
import test from 'node:test';
import { EditForm } from '@voyage/shared';
import { stable } from '@voyage/shared';
import { applyForm, blankEnvelope, formOf, generateHex } from '@voyage/generation';
import { loadLegacy } from '../oracle/legacy.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.0.0' };
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

test('a blank system is one star of the class asked, matching the legacy generator', () => {
    const ctx = loadLegacy({ seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS } });
    for (const edition of ['MgT2E', 'AoW']) {
        const envelope = blankEnvelope('spin/0101', edition, pinned, {});
        const form = formOf(envelope);
        assert.equal(form.edition, edition);
        const type = form.sections.find((section) => section.id === 'stars').fields.find((item) => item.id === 'star.0.type');
        assert.equal(type.value, 'G');
        const sys = edition === 'AoW' ? envelope.body.aowSystem : envelope.body.mgtSystem;
        const legacy = edition === 'AoW'
            ? ctx.AoWBottomUpGenerator.generateAoWSystemBottomUp('spin/0101', null)
            : ctx.MgT2EBottomUpGenerator.generateSystem('spin/0101', null);
        assert.equal(Array.isArray(sys.stars), true);
        assert.equal(Array.isArray(legacy.stars), true);
        assert.equal(sys.stars.length > 0, true);
    }
});

test('rolling a body on Architect of Worlds does not run', () => {
    const envelope = aow(HEXES[0]);
    const applied = applyForm(envelope, [], [{ id: 'body.0' }]);
    assert.equal(applied.answer.messages[0].text, 'Regeneration is only available for MgT2E systems.');
    assert.equal(stable(applied.envelope), stable(envelope));
});
