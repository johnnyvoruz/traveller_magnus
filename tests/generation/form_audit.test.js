/**
 * DH6: the auditor's lines as messages of the draft. `applyForm` runs the engine's auditor over the mainworld
 * as the card shows it (the row's columns over the engine's object, the typed digits in both spellings the
 * auditor reads) and returns its lines as messages that never hold a Keep: a base line at its switch, a size
 * line at the Size cell, the rest at the Profile digits place. Only the mainworld's lines. DF38: the auditor's
 * trade-code line is no message; the editor's "From the digits: … · Use these" (DH5) is the one line there.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { auditMgT2ESystem } from '@voyage/engines';
import { applyForm, generateHex } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' };
const mgt = (hexKey) => generateHex({ hexKey, edition: 'MgT2E', mode: 'top-down', summary: { type: 'SYSTEM_PRESENT' }, pinned });
const SAYS = 'The auditor says: ';
const audits = (answer) => answer.messages.filter((item) => item.text.startsWith(SAYS));
const regina = () => ({ kind: 'tree', engineVersion: '1.1.0', derivation: { kind: 'flesh' }, hexKey: 'spin/1910', body: JSON.parse(readFileSync(new URL('../golden/fixtures/engine_1.2.0/mgt2e_flesh_from_tsv.json', import.meta.url), 'utf8')) });

test('a generated system passes its own auditor: a name change brings no line', () => {
    const applied = applyForm(mgt('spin/1910'), [{ id: 'name', value: 'Ruie Prime' }], []);
    assert.deepEqual(audits(applied.answer), []);
});

test('DF38: trade codes typed away from the digits bring no auditor line; the typed list is kept', () => {
    // A fresh hex is the expanded method, so this world is no longer the old X510538-4 roll.
    // The editor's "From the digits" line is the one under the box; the auditor's trade line is not a message.
    const applied = applyForm(mgt('spin/1910'), [{ id: 'chart.trade', value: 'Ag' }], []);
    assert.deepEqual(applied.answer.messages, []);
    assert.equal(applied.envelope.body.mgtSystem.mainworld.tradeCodes.join(' '), 'Ag', 'the typed list is kept as typed');
    // A digit that changes the codes (Atmosphere 0 adds Va) brings none either.
    assert.deepEqual(audits(applyForm(mgt('spin/1910'), [{ id: 'profile.a', value: '0' }], []).answer), []);
});

test('a digit typed: the auditor reads the typed digits, not the engine\'s stale fields', () => {
    // Size 0 and Hydrographics 1 typed on the elected mainworld. The size rule names the
    // atmosphere the engine stored, not a digit the form did not type.
    const envelope = mgt('spin/1910');
    const atm = envelope.body.mgt2eData.atmCode;
    const typed = applyForm(envelope, [{ id: 'profile.s', value: '0' }, { id: 'profile.h', value: '1' }], []);
    assert.deepEqual(audits(typed.answer), [{ id: 'profile.s', text: SAYS + `Size 0 world has Atm ${atm} and Hydro 1 (Both must be 0).`, holds: false }]);
    assert.equal(typed.answer.messages.some((item) => item.holds), false, 'Keep is never refused by the auditor');
    // Hydrographics set to 0: a Size 0 mainworld may keep its atmosphere, so no line.
    // The elected world does not already have hydrographics 0, so the digit is typed.
    assert.deepEqual(audits(applyForm(mgt('spin/1910'), [{ id: 'profile.s', value: '0' }, { id: 'profile.h', value: '0' }], []).answer), []);
});

test('a naval base on a starport the auditor refuses: the line at the Naval switch', () => {
    // The elected starport is not the old class X. The digit is set to X so the line is the base rule.
    const applied = applyForm(mgt('spin/1910'), [{ id: 'profile.st', value: 'X' }, { id: 'chart.base.naval', value: true }], []);
    assert.deepEqual(audits(applied.answer), [{ id: 'chart.base.naval', text: SAYS + 'Naval Base found on Starport X.', holds: false }]);
});

test('a fleshed chart world: the mainworld reached though it stands beside the worlds list', () => {
    // Regina A788899-C, a moon of its gas giant, kept on `mgtSystem.mainworld` and in no `worlds` entry. Its survey
    // codes differ from the digits' (Ht Ri Sa); the auditor's line for that is no message now (DF38).
    const applied = applyForm(regina(), [{ id: 'chart.zone', value: 'Amber' }], []);
    assert.deepEqual(audits(applied.answer), []);
    // Size 0 typed on Hydrographics 8: the size line comes, so the mainworld beside the list is audited.
    const sized = applyForm(regina(), [{ id: 'profile.s', value: '0' }], []);
    assert.deepEqual(audits(sized.answer).map((item) => item.id), ['profile.s']);
});

test('only the mainworld\'s lines: a subordinate world the auditor would flag brings none to the form', () => {
    const envelope = structuredClone(mgt('spin/1910'));
    const sub = envelope.body.mgtSystem.worlds.find((world) => world.type === 'Terrestrial Planet');
    Object.assign(sub, { size: 0, hydro: 3, hydroCode: 3, atm: 0, atmCode: 0 });
    const direct = auditMgT2ESystem(envelope.body.mgtSystem);
    assert.equal(direct.errors.length, 1, 'the auditor itself flags the subordinate world');
    assert.equal(direct.errors[0].orbitId, sub.orbitId);
    const applied = applyForm(envelope, [{ id: 'name', value: 'Ruie Prime' }], []);
    assert.deepEqual(audits(applied.answer), []);
});

test('the engine\'s why lines are not the auditor\'s', () => {
    const applied = applyForm(mgt('spin/1910'), [{ id: 'chart.trade', value: 'Ag' }], []);
    for (const item of applied.answer.changed) assert.doesNotMatch(item.why, /Audit|FAIL/);
});

test('pins: the auditor runs in applyForm and holds nothing; the editor prints a rule place\'s messages; the route refuses holds alone', () => {
    const form = readFileSync(new URL('../../packages/generation/src/form.ts', import.meta.url), 'utf8');
    assert.match(form, /^\s+auditMgT2ESystem,$/m);
    assert.match(form, /messages\.push\(\.\.\.auditLines\(nextBody, copy\.edition\)\);\n\s+return \{ envelope: next, answer: \{ form, changed, messages \} \};/);
    assert.equal((form.match(/holds: false \};\n/g) || []).length >= 1, true);
    assert.match(form, /if \(TRADE_LINE\.test\(raw\)\) return null;/, 'DF38: the trade line is no message');
    assert.doesNotMatch(form.slice(form.indexOf('function auditMessage'), form.indexOf('export function applyForm(')), /holds: true/, 'no auditor line holds a Keep');
    const editor = readFileSync(new URL('../../apps/web/src/workspace/build/SystemEditor.vue', import.meta.url), 'utf8');
    assert.equal((editor.match(/:aria-hidden="ruleWords\(rule\) \? undefined : 'true'">\{\{ ruleWords\(rule\) \}\}<\/div>/g) || []).length, 3, 'the three rule-place loops');
    assert.match(editor, /messagesFor\(rule\.id, messages\.value\)/);
    const route = readFileSync(new URL('../../apps/api/src/routes/builder.ts', import.meta.url), 'utf8');
    assert.match(route, /applied\.answer\.messages\.some\(\(item\) => item\.holds\)/);
});
