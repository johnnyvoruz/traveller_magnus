import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The trade rules (stream Z, ZT0): every row cites assets/trade.txt, and the cited lines hold
// the row's key words and numbers, so nothing in the file is from memory. The draft moved to
// rules/mgt2e_trade.json unchanged on 2026-10-17 (decisions.md 20:27, answer 24); this test reads
// the tracked file (ZF1), the same bytes as findings/rules_drafts/mgt2e_trade.json.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const draft = JSON.parse(readFileSync(path.join(root, 'rules', 'mgt2e_trade.json'), 'utf8'));
const lines = readFileSync(path.join(root, 'assets', 'trade.txt'), 'utf8').split(/\r?\n/);

const SRC = /^assets\/trade\.txt:(\d+)(?:-(\d+))?$/;
const WORD_FIELDS = ['d66', 'type', 'roll', 'result', 'name', 'label', 'dice', 'tons', 'difficulty', 'skill', 'time', 'skillRoll'];
const TEXT_FIELDS = ['text', 'examples'];
const NUMBER_FIELDS = ['basePrice', 'parsecs', 'high', 'middle', 'basic', 'low', 'freightPerTon', 'purchasePercent', 'salePercent', 'feePercent', 'assumed'];

const words = (s) => String(s).toLowerCase().replace(/[\s\-\u2010-\u2015\u2018\u2019\u201c\u201d,.:;()'`"]+/g, ' ').trim();
// The extraction prints some minus signs as en dashes (the DM-3 at line 345).
const raw = (s) => String(s).replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ');
const signed = (n) => `${n >= 0 ? '+' : '-'}${Math.abs(n)}`;

function cited(src) {
    const list = Array.isArray(src) ? src : [src];
    assert.ok(list.length > 0, 'empty _src');
    return list.map((one) => {
        const m = SRC.exec(one);
        assert.ok(m, `bad _src ${one}`);
        const from = Number(m[1]);
        const to = Number(m[2] || m[1]);
        assert.ok(from >= 1 && to >= from && to <= lines.length, `${one}: no such lines (the file has ${lines.length})`);
        const text = lines.slice(from - 1, to).join('\n');
        assert.ok(text.trim(), `${one}: the cited lines are blank`);
        return text;
    }).join('\n');
}

/** Every object inside an array is a row; every top-level section is one too. */
function rows(value, at, out) {
    if (Array.isArray(value)) value.forEach((item, i) => { if (item && typeof item === 'object' && !Array.isArray(item)) out.push([`${at}[${i}]`, item]); rows(item, `${at}[${i}]`, out); });
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!k.startsWith('_')) rows(v, `${at}.${k}`, out);
    return out;
}

test('the trade rules draft parses and every section and row carries _src', () => {
    for (const [key, value] of Object.entries(draft)) {
        if (key.startsWith('_') || !value || typeof value !== 'object') continue;
        assert.ok(value._src || value._readme, `${key} has no _src`);
        if (value._src) cited(value._src);
    }
    const all = rows(draft, 'draft', []);
    assert.ok(all.length > 150, `only ${all.length} rows`);
    for (const [at, row] of all) assert.ok(row._src, `${at} has no _src`);
});

test('every cited line holds the row\'s key words and numbers', () => {
    for (const [at, row] of rows(draft, 'draft', [])) {
        const text = cited(row._src);
        const w = words(text);
        const r = raw(text);
        for (const field of WORD_FIELDS) {
            const v = row[field];
            if (typeof v === 'string') assert.ok(w.includes(words(v)), `${at}.${field} "${v}" is not in ${JSON.stringify(row._src)}`);
        }
        for (const field of TEXT_FIELDS) {
            if (typeof row[field] !== 'string') continue;
            for (const sentence of row[field].split(/\.\s+/)) assert.ok(w.includes(words(sentence)), `${at}.${field} "${sentence}" is not in ${JSON.stringify(row._src)}`);
        }
        for (const field of NUMBER_FIELDS) {
            const n = row[field];
            if (typeof n !== 'number') continue;
            const ok = r.includes(String(n)) || (n % 1000000 === 0 && r.includes(`MCr${n / 1000000}`));
            assert.ok(ok, `${at}.${field} ${n} is not in ${JSON.stringify(row._src)}`);
        }
        if (typeof row.dm === 'number') assert.ok(r.includes(signed(row.dm)), `${at}.dm ${signed(row.dm)} is not in ${JSON.stringify(row._src)}`);
        if (Array.isArray(row.availability)) for (const a of row.availability) assert.ok(w.includes(words(a)), `${at}.availability "${a}" is not in ${JSON.stringify(row._src)}`);
        for (const column of ['purchaseDM', 'saleDM']) {
            if (!row[column]) continue;
            for (const [code, n] of Object.entries(row[column])) {
                assert.ok(w.includes(words(code)), `${at}.${column} "${code}" is not in ${JSON.stringify(row._src)}`);
                assert.ok(r.includes(signed(n)), `${at}.${column} ${code} ${signed(n)} is not in ${JSON.stringify(row._src)}`);
            }
        }
    }
});

// Johnny answered every ZT0 question on 2026-10-17 (streams/Z.md, ZT0b): no question is left open,
// and a null the text does not settle carries his answer, never a guess.
test('every question is settled, and a null left carries Johnny\'s answer', () => {
    const answered = (row) => typeof row._answer === 'string' && row._answer.startsWith('Johnny 2026-10-17 (ZT0 Q');
    for (const [at, row] of [['draft.source', draft.source], ...rows(draft, 'draft', [])]) {
        assert.ok(!('_question' in row), `${at} still has _question ${row._question}`);
        if ('_answer' in row) assert.ok(answered(row), `${at}._answer`);
        const empty = Object.entries(row).filter(([k, v]) => !k.startsWith('_') && v === null).map(([k]) => k);
        if (empty.length) assert.ok(answered(row), `${at} has null ${empty.join(', ')} and no _answer`);
    }
    assert.ok(!('tradeRoutes' in draft), 'tradeRoutes is dropped (Q11)');
    assert.equal(draft.source.pages, null, 'no page numbers (Q10)');
    const exotics = draft.goods.table.find((row) => row.d66 === '66');
    for (const key of ['availability', 'tons', 'basePrice', 'purchaseDM', 'saleDM', 'illegal']) assert.equal(exotics[key], null, `Exotics ${key} (Q4, Q5)`);
    assert.deepEqual(draft.passengers.passages.map((p) => p.name), ['High', 'Middle', 'Basic', 'Low'], 'four passages (Q1)');
    assert.equal(draft.sale.roll, '3D', 'selling is 3D (Q9)');
});

test('the trade goods table has each D66 row from 11 to 66 once', () => {
    const expected = [];
    for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) expected.push(`${a}${b}`);
    assert.deepEqual(draft.goods.table.map((row) => row.d66), expected);
    assert.deepEqual(draft.goods.table.filter((row) => row.illegal === true).map((row) => row.d66), ['61', '62', '63', '64', '65']);
    assert.equal(draft.modifiedPrice.rows.length, 29);
    assert.equal(draft.passengers.traffic.table.length, 20);
    assert.equal(draft.freight.traffic.table.length, 20);
    assert.equal(draft.fares.rows.length, 6);
});
