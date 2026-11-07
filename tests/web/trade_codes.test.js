/**
 * DH5: trade codes from the digits. Every row of the rules table (rules/mgt2e_data.js `tradeCodes`, the text's
 * Trade Codes table) is read back: a world built to meet a row earns its code and a world one step outside
 * does not; a known chart world earns what the engine's auditor would; the words; the offer never writes
 * without the press (pinned on the editor).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';
import { digitNumber, digitsOf, fromDigitsWords, meets, sameCodes, tableCodes, tradeCodesOf } from '../../apps/web/src/workspace/build/trade_codes.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
const table = MgT2EData.tradeCodes;

/** A world that meets one row: every bound at its minimum, a listed atmosphere's first, a range's first. */
function worldFor(condition) {
    const pick = (min, max) => (min !== undefined ? min : max !== undefined ? max : 0);
    const out = {
        size: pick(condition.minSize, condition.maxSize),
        atm: condition.validAtms ? condition.validAtms[0] : condition.atmRanges ? condition.atmRanges[0][0] : pick(condition.minAtm, condition.maxAtm),
        hydro: pick(condition.minHydro, condition.maxHydro),
        pop: pick(condition.minPop, condition.maxPop),
        gov: pick(condition.minGov, condition.maxGov),
        law: pick(condition.minLaw, condition.maxLaw),
        tl: pick(condition.minTl, condition.maxTl),
    };
    return out;
}

test('every row of the table: a world built to its bounds earns the code, one step past a bound does not', () => {
    assert.equal(tableCodes().length, 18, 'the text\'s eighteen codes');
    for (const [code, condition] of Object.entries(table)) {
        const world = worldFor(condition);
        assert.ok(meets(condition, world), code + ' met at its bounds: ' + JSON.stringify(world));
        assert.ok(tradeCodesOf(world).includes(code), code + ' earned');
        // One digit past a maximum, or under a minimum, loses the code.
        const bounds = [['size', 'maxSize', 'minSize'], ['atm', 'maxAtm', 'minAtm'], ['hydro', 'maxHydro', 'minHydro'], ['pop', 'maxPop', 'minPop'], ['gov', 'maxGov', 'minGov'], ['law', 'maxLaw', 'minLaw'], ['tl', 'maxTl', 'minTl']];
        for (const [key, maxKey, minKey] of bounds) {
            if (condition[maxKey] !== undefined) assert.equal(meets(condition, { ...world, [key]: condition[maxKey] + 1 }), false, code + ' past ' + maxKey);
            if (condition[minKey] !== undefined && condition[minKey] > 0) assert.equal(meets(condition, { ...world, [key]: condition[minKey] - 1 }), false, code + ' under ' + minKey);
        }
        if (condition.validAtms) assert.equal(meets(condition, { ...world, atm: 99 }), false, code + ' with an atmosphere off its list');
        if (condition.atmRanges) assert.equal(meets(condition, { ...world, atm: condition.atmRanges[0][1] + 1 }), false, code + ' between its ranges');
    }
});

test('a chart world: Regina A788899-C earns Ht and Ri, as the engine\'s auditor recomputes it (less Sa, which is a moon\'s, not a digit\'s)', () => {
    const regina = { size: 7, atm: 8, hydro: 8, pop: 8, gov: 9, law: 9, tl: 12 };
    assert.deepEqual(tradeCodesOf(regina), ['Ht', 'Ri']);
    const desert = { size: 4, atm: 3, hydro: 0, pop: 2, gov: 1, law: 2, tl: 7 };
    assert.deepEqual(tradeCodesOf(desert), ['De', 'Lo', 'Po']);
    // The table's Ba row: population, government and law all 0; its Lt row asks a population of 1 or more, so an empty world is not Lt.
    const empty = { size: 5, atm: 6, hydro: 5, pop: 0, gov: 0, law: 0, tl: 0 };
    assert.deepEqual(tradeCodesOf(empty), ['Ba']);
    assert.equal(tradeCodesOf({ size: null, atm: null, hydro: null, pop: null, gov: null, law: null, tl: null }).length, 0, 'nothing typed, nothing earned');
});

test('the digits from the form\'s cells, the words, and whether the typed list already says it', () => {
    const f = (id, value) => ({ id, label: id, kind: 'text', permission: 'type', value, options: [] });
    const cells = [f('profile.st', 'A'), f('profile.s', 7), f('profile.a', 8), f('profile.h', 8), f('profile.p', 8), f('profile.g', 9), f('profile.l', 9), f('profile.tl', 12), f('chart.trade', 'Ri')];
    assert.deepEqual(digitsOf(cells), { size: 7, atm: 8, hydro: 8, pop: 8, gov: 9, law: 9, tl: 12 });
    assert.deepEqual(digitsOf([f('body_2.profile.s', 'A'), f('body_2.profile.tl', '')]), { size: 10, atm: null, hydro: null, pop: null, gov: null, law: null, tl: null });
    assert.equal(digitNumber('C'), 12);
    assert.equal(digitNumber(12), 12);
    assert.equal(digitNumber(''), null);
    assert.equal(digitNumber(null), null);
    assert.equal(fromDigitsWords(['Ht', 'Ri']), 'From the digits: Ht Ri');
    assert.equal(fromDigitsWords([]), 'From the digits: none');
    assert.equal(sameCodes('Ri Ht', ['Ht', 'Ri']), true, 'the same codes in any order');
    assert.equal(sameCodes('Ri Pa Ph An Cp (Amindii)2 Varg0 Asla0 Sa', ['Ht', 'Ri']), false, 'the survey\'s list is not the digits\' list');
    assert.equal(sameCodes('', []), true);
});

test('pins: the line under Trade codes on the World card, the press writes the field, nothing is written without it', () => {
    const editor = src('workspace/build/SystemEditor.vue');
    assert.match(editor, /<div v-if="field\.id === 'chart\.trade'" class="sysed-from-digits" data-from-digits>/);
    assert.match(editor, /data-use-codes :disabled="busy \|\| fromDigits\.same"[^>]*@click="set\('chart\.trade', fromDigits\.codes\.join\(' '\)\)"/);
    assert.match(editor, /const fromDigits = computed\(/);
    assert.doesNotMatch(editor, /watch\([^)]*fromDigits/, 'no watcher writes the codes on its own');
    const module = src('workspace/build/trade_codes.ts');
    assert.match(module, /generated\/rules\/mgt2e_data\.js/, 'the table through the wrapper');
    assert.doesNotMatch(module, /'Ag'|'Ri'|minPop: \d/, 'no row of the table typed into the code');
});
