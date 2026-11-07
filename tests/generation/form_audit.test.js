/**
 * DH6: the auditor's lines as messages of the draft. `applyForm` runs the engine's auditor over the mainworld
 * as the card shows it (the row's columns over the engine's object, the typed digits in both spellings the
 * auditor reads) and returns its lines as messages that never hold a Keep: the trade-code line at the Trade
 * codes box, a base line at its switch, the rest at the Profile digits place. Only the mainworld's lines.
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

test('trade codes typed away from the digits: one line at the Trade codes box, nothing held', () => {
    // spin/1910 at the truth seed is X510538-4, whose digits earn Lt Ni (the engine wrote the same).
    const applied = applyForm(mgt('spin/1910'), [{ id: 'chart.trade', value: 'Ag' }], []);
    assert.deepEqual(applied.answer.messages, [{ id: 'chart.trade', text: SAYS + 'Trade codes from the digits are Lt Ni; the world has Ag.', holds: false }]);
    assert.equal(applied.answer.messages.some((item) => item.holds), false, 'Keep is never refused by the auditor');
    assert.equal(applied.envelope.body.mgtSystem.mainworld.tradeCodes.join(' '), 'Ag', 'the typed list is kept as typed');
});

test('a digit typed: the auditor reads the new digit, not the engine\'s stale code field', () => {
    // Atmosphere 0 on the same world adds Va; the engine's object still carries atmCode 1.
    const applied = applyForm(mgt('spin/1910'), [{ id: 'profile.a', value: '0' }], []);
    assert.deepEqual(audits(applied.answer), [{ id: 'chart.trade', text: SAYS + 'Trade codes from the digits are Lt Ni Va; the world has Lt Ni.', holds: false }]);
});

test('a naval base on a starport the auditor refuses: the line at the Naval switch', () => {
    const applied = applyForm(mgt('spin/1910'), [{ id: 'chart.base.naval', value: true }], []);
    assert.deepEqual(audits(applied.answer), [{ id: 'chart.base.naval', text: SAYS + 'Naval Base found on Starport X.', holds: false }]);
});

test('a fleshed chart world: the survey\'s codes against the digits, the mainworld reached though it stands beside the worlds list', () => {
    // Regina A788899-C, a moon of its gas giant, kept on `mgtSystem.mainworld` and in no `worlds` entry.
    const applied = applyForm(regina(), [{ id: 'chart.zone', value: 'Amber' }], []);
    assert.deepEqual(audits(applied.answer), [{ id: 'chart.trade', text: SAYS + 'Trade codes from the digits are Ht Ri Sa; the world has (Amindii)2 An Asla0 Cp Pa Ph Ri Sa Varg0.', holds: false }]);
    // Use these (DH5) puts the digits' codes in the box: the line goes.
    const used = applyForm(regina(), [{ id: 'chart.trade', value: 'Ht Ri Sa' }], []);
    assert.deepEqual(audits(used.answer), []);
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
    assert.equal((form.match(/holds: false \};\n/g) || []).length >= 2, true);
    assert.doesNotMatch(form.slice(form.indexOf('function auditMessage'), form.indexOf('export function applyForm(')), /holds: true/, 'no auditor line holds a Keep');
    const editor = readFileSync(new URL('../../apps/web/src/workspace/build/SystemEditor.vue', import.meta.url), 'utf8');
    assert.equal((editor.match(/:aria-hidden="ruleWords\(rule\) \? undefined : 'true'">\{\{ ruleWords\(rule\) \}\}<\/div>/g) || []).length, 3, 'the three rule-place loops');
    assert.match(editor, /messagesFor\(rule\.id, messages\.value\)/);
    const route = readFileSync(new URL('../../apps/api/src/routes/builder.ts', import.meta.url), 'utf8');
    assert.match(route, /applied\.answer\.messages\.some\(\(item\) => item\.holds\)/);
});
