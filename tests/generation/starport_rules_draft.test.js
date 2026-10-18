import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Which starports sell which fuel (stream Z, Z8): every row cites assets/2eWorldCreation.txt, and the
// cited lines hold the row's words and numbers, so nothing in the draft is from memory.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The drafts live in findings/, which is not committed (ZF1): a fresh checkout skips, with the reason.
const DRAFT = path.join(root, 'findings', 'rules_drafts', 'mgt2e_starports.json');
const TRAVEL = path.join(root, 'findings', 'rules_drafts', 'mgt2e_space_travel.json');
const present = existsSync(DRAFT) && existsSync(TRAVEL);
const skip = present ? false : 'findings/rules_drafts/mgt2e_starports.json or mgt2e_space_travel.json is absent (findings/ is not committed; the starport draft is not in rules/ yet)';
const draft = present ? JSON.parse(readFileSync(DRAFT, 'utf8')) : null;
const lines = readFileSync(path.join(root, 'assets', '2eWorldCreation.txt'), 'utf8').split(/\r?\n/);
const travel = present ? JSON.parse(readFileSync(TRAVEL, 'utf8')) : null;

const SRC = /^assets\/2eWorldCreation\.txt:(\d+)(?:-(\d+))?$/;
const WORD_FIELDS = ['class', 'quality', 'fuel', 'grade', 'base', 'for', 'risk', 'source', 'ships', 'time', 'chapter'];
const words = (s) => String(s).toLowerCase().replace(/[\s\-\u2010-\u2015\u2018\u2019\u201c\u201d,.:;()'`"]+/g, ' ').trim();

function cited(src) {
    const m = SRC.exec(src);
    assert.ok(m, `bad _src ${src}`);
    const from = Number(m[1]);
    const to = Number(m[2] || m[1]);
    assert.ok(from >= 1 && to >= from && to <= lines.length, `${src}: no such lines (the file has ${lines.length})`);
    const text = lines.slice(from - 1, to).join('\n');
    assert.ok(text.trim(), `${src}: the cited lines are blank`);
    return text;
}

function rows(value, at, out) {
    if (Array.isArray(value)) value.forEach((item, i) => { if (item && typeof item === 'object') out.push([`${at}[${i}]`, item]); rows(item, `${at}[${i}]`, out); });
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!k.startsWith('_')) rows(v, `${at}.${k}`, out);
    return out;
}

test('every section and row carries _src, and the cited lines hold its words and numbers', { skip }, () => {
    for (const [key, value] of Object.entries(draft)) {
        if (key.startsWith('_')) continue;
        assert.ok(value._src, `${key} has no _src`);
        cited(value._src);
    }
    const all = rows(draft, 'draft', []);
    assert.ok(all.length >= 15, `only ${all.length} rows`);
    for (const [at, row] of all) {
        assert.ok(row._src, `${at} has no _src`);
        const text = cited(row._src);
        const w = words(text);
        for (const field of WORD_FIELDS) {
            const v = row[field];
            if (typeof v !== 'string' || v === 'none' && field === 'fuel' && /none/i.test(text)) continue;
            assert.ok(w.includes(words(v)), `${at}.${field} "${v}" is not in ${row._src}`);
        }
        if (typeof row.text === 'string') {
            for (const sentence of row.text.split(/\.\s+/)) assert.ok(w.includes(words(sentence)), `${at}.text "${sentence}" is not in ${row._src}`);
        }
        if (typeof row.crPerTon === 'number' && row.crPerTon > 0) assert.ok(text.includes(`Cr${row.crPerTon}`), `${at}.crPerTon ${row.crPerTon} is not in ${row._src}`);
    }
});

test('the classes are A to E and X once each, in the table\'s order, and the grades are the printed words', { skip }, () => {
    assert.deepEqual(draft.classes.rows.map((row) => row.class), ['A', 'B', 'C', 'D', 'E', 'X']);
    assert.deepEqual(draft.classes.rows.map((row) => row.fuel), ['refined', 'refined', 'unrefined', 'unrefined', 'none', 'none']);
    for (const row of draft.classes.rows) {
        const line = lines[Number(SRC.exec(row._src)[1]) - 1];
        assert.ok(line.startsWith(`${row.class} ${row.quality} `), `${row.class}: the row's line starts with its class and quality`);
        assert.ok(line.toLowerCase().includes(row.fuel === 'none' ? 'none' : row.fuel), `${row.class}: the fuel word is on the row's line`);
    }
});

test('the prices agree with the space travel draft (findings/rules_drafts/mgt2e_space_travel.json)', { skip }, () => {
    const byGrade = Object.fromEntries(draft.prices.rows.map((row) => [row.grade, row.crPerTon]));
    assert.equal(byGrade.refined, travel.fuel.refinedCrPerTon);
    assert.equal(byGrade.unrefined, travel.fuel.unrefinedCrPerTon);
});

test('a cell the text does not settle is null with a question, never a guess', { skip }, () => {
    for (const [at, row] of rows(draft, 'draft', [])) {
        if ('_question' in row) assert.ok(Number.isInteger(row._question) && row._question > 0, `${at}._question`);
        const empty = Object.entries(row).filter(([k, v]) => !k.startsWith('_') && v === null).map(([k]) => k);
        if (empty.length) assert.ok(Number.isInteger(row._question), `${at} has null ${empty.join(', ')} and no _question`);
    }
});