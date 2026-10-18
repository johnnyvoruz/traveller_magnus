/**
 * The records list grouped (stream N3): a heading per type with its count, in the type chips'
 * order; folds kept per campaign on this device; a search unfolds; past 200 rows only the
 * window near the view is drawn, with pads that keep the scroll height.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HEAD_GUESS, ROW_GUESS, VIRTUAL_FROM, groupItems, readFolded, windowOf, writeFolded } from '../../apps/web/src/workspace/record_groups.ts';
import { RECORD_TYPES } from '../../apps/web/src/workspace/records.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function record(n, type, name) {
    return { id: `cr_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, type, name, deleted: false };
}

const rows = [record(1, 'vessel', 'Beowulf'), record(2, 'person', 'Voss'), record(3, 'person', 'Kell'), record(4, 'place', 'Highport')];

test('grouped: the types in the chips\' order, each heading with its count, rows in the order given', () => {
    const items = groupItems(rows, true, new Set());
    const order = RECORD_TYPES.map((info) => info.type).filter((type) => rows.some((row) => row.type === type));
    assert.deepEqual(items.filter((item) => item.kind === 'head').map((item) => item.type), order);
    const people = items.findIndex((item) => item.kind === 'head' && item.type === 'person');
    assert.equal(items[people].count, 2);
    assert.deepEqual([items[people + 1].record.name, items[people + 2].record.name], ['Voss', 'Kell']);
    assert.equal(items.length, rows.length + order.length);
});

test('a folded group keeps its heading and count, hides its rows; a search unfolds it; a chosen type has no headings', () => {
    const folded = groupItems(rows, true, new Set(['person']));
    const head = folded.find((item) => item.kind === 'head' && item.type === 'person');
    assert.equal(head.folded, true);
    assert.equal(head.count, 2);
    assert.ok(!folded.some((item) => item.kind === 'row' && item.record.type === 'person'));
    const searching = groupItems(rows, true, new Set(['person']), true);
    assert.equal(searching.filter((item) => item.kind === 'row').length, 4);
    assert.ok(searching.every((item) => item.kind === 'row' || !item.folded));
    const flat = groupItems(rows.filter((row) => row.type === 'person'), false, new Set(['person']));
    assert.deepEqual(flat.map((item) => item.kind), ['row', 'row']);
});

test('folds are kept per campaign on this device; anything unreadable reads as none', () => {
    const store = new Map();
    const fake = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); } };
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    try {
        writeFolded('U1', new Set(['person', 'vessel']));
        assert.deepEqual([...readFolded('U1')].sort(), ['person', 'vessel']);
        assert.deepEqual([...readFolded('U2')], [], 'another campaign keeps its own');
        store.set('voyage.recordGroups.U3', '{broken');
        assert.deepEqual([...readFolded('U3')], []);
        store.set('voyage.recordGroups.U4', JSON.stringify(['person', 'dragon', 7]));
        assert.deepEqual([...readFolded('U4')], ['person'], 'unknown types are dropped');
        assert.deepEqual([...readFolded(null)], []);
    } finally {
        if (had) Object.defineProperty(globalThis, 'localStorage', had);
        else delete globalThis.localStorage;
    }
});

test('the window draws what is near the view; the pads add up to the rest', () => {
    const heights = Array.from({ length: 1000 }, (_, i) => (i % 50 === 0 ? HEAD_GUESS : ROW_GUESS));
    const total = heights.reduce((a, b) => a + b, 0);
    const top = windowOf(heights, 0, 800);
    assert.equal(top.start, 0);
    assert.equal(top.padBefore, 0);
    assert.ok(top.end > 10 && top.end < 40, 'about a view and an overscan of rows');
    const mid = windowOf(heights, 30000, 800);
    assert.ok(mid.start > 0 && mid.end > mid.start);
    let drawn = 0;
    for (let i = mid.start; i < mid.end; i++) drawn += heights[i];
    assert.equal(mid.padBefore + drawn + mid.padAfter, total);
    const below = windowOf(heights, -500, 800);
    assert.equal(below.start, 0, 'a list still below the view draws its top');
    const past = windowOf(heights, total + 5000, 800);
    assert.equal(past.end, heights.length);
    assert.equal(past.padAfter, 0);
    assert.equal(VIRTUAL_FROM, 200);
});

test('the list draws its items through the window, headings fold, arrows reach what was left out', () => {
    const list = fs.readFileSync(path.join(root, 'apps/web/src/workspace/CampaignList.vue'), 'utf8');
    assert.match(list, /<template v-for="item in shownItems" :key="item\.key">/);
    assert.match(list, /class="camp-group-head"\s+:aria-expanded=/);
    assert.match(list, /@click="toggleGroup\(item\.type\)"/);
    assert.match(list, /writeFolded\(campaign\.universeId, next\)/);
    assert.match(list, /if \(index >= 0 && items\.value\[index \+ step\]\) focusItem\(index \+ step\);/);
});
