import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodyParts } from '../../apps/web/src/workspace/journal/body.ts';
import { parsePlayed, parseWhen } from '../../apps/web/src/workspace/journal/dates.ts';
import { entryName, filterEntries, kindCounts, readLine, rowFace, visibleRange } from '../../apps/web/src/workspace/journal/list.ts';

const ID = 'cj_11111111-1111-4111-8111-111111111111';
const RECORD = 'cr_22222222-2222-4222-8222-222222222222';

function entry(patch) {
    return {
        id: ID,
        kind: 'note',
        title: '',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: '2026-10-07T00:00:00.000Z',
        updatedAt: '2026-10-07T00:00:00.000Z',
        deleted: false,
        ...patch,
    };
}

test('a row names each kind, an untitled body, and a session with no title', () => {
    const records = {};
    const note = rowFace(entry({ title: 'Voss', body: 'He owes the cutter.' }), records);
    assert.equal(note.chip, 'Note');
    assert.equal(note.icon, 'note-sticky');
    assert.equal(note.name, 'Voss');
    assert.equal(note.summary, 'He owes the cutter.');

    const handout = rowFace(entry({
        id: 'cj_33333333-3333-4333-8333-333333333333',
        kind: 'handout',
        title: 'Port letter',
        visibility: 'players',
        when: { year: 1105, day: 213 },
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' },
    }), records);
    assert.equal(handout.chip, 'Handout');
    assert.equal(handout.meta, 'Players · 213-1105 · Regina 1910');

    const rumour = rowFace(entry({ kind: 'rumor', title: '', body: 'Someone knew the cutter.\nSecond line.' }), records);
    assert.equal(rumour.chip, 'Rumour');
    assert.equal(rumour.name, 'Someone knew the cutter.');
    assert.equal(rumour.soft, true);
    assert.equal(rumour.summary, null);

    const blank = rowFace(entry({ kind: 'note', title: '  ', body: '\n  ' }), records);
    assert.equal(blank.name, 'Untitled note');
    assert.equal(blank.summary, null);

    const session = rowFace(entry({
        kind: 'session',
        title: '',
        sequence: 14,
        when: { year: 1105, day: 213 },
        realDate: '2026-10-04',
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' },
        body: '',
    }), records);
    assert.equal(entryName(session && entry({ kind: 'session', title: '', sequence: 14 })), 'Session 14');
    assert.equal(session.name, 'Session 14');
    assert.equal(session.number, null);
    assert.equal(session.meta, '213-1105 · played 2026-10-04 · Regina 1910');

    const titled = rowFace(entry({ kind: 'session', title: 'The amber courier', sequence: 14, body: 'The papers were amber.' }), records);
    assert.equal(titled.number, '14');
    assert.equal(titled.name, 'The amber courier');
    assert.equal(titled.summary, 'The papers were amber.');
});

test('a row reads a token as its label and never shows the id', () => {
    const far = 'cr_e90c5bad-3539-4ea8-8afa-f028d0116f7a';
    const hex = 'hex:Spinward_Marches/1910';
    const names = (target) => (target === far ? 'Far Margin' : target === hex ? 'Regina' : null);
    assert.equal(readLine('Met [[' + far + '|the courier]]', names), 'Met the courier');
    assert.equal(readLine('At [[' + hex + '|Regina]]', () => 'Somewhere'), 'At Regina');
    assert.equal(readLine('Aboard [[' + far + ']]', names), 'Aboard Far Margin');
    assert.equal(readLine('See [[' + RECORD + ']] today', () => null), 'See today');
    assert.equal(readLine('[[' + far + '|One]] [[' + hex + '|Two]]', names), 'One Two');
    assert.equal(readLine('[[' + far + '|One]][[' + hex + '|Two]]', names), 'OneTwo');
    assert.equal(readLine('[[' + hex + '|Regina]]', names), 'Regina');
    assert.equal(readLine('[[' + RECORD + ']]', () => null), '');

    const records = { [far]: { name: 'Far Margin', deleted: false } };
    const session = rowFace(entry({
        kind: 'session',
        title: 'Amber run',
        sequence: 3,
        body: 'The courier reached [[' + far + ']].',
    }), records);
    assert.equal(session.summary, 'The courier reached Far Margin.');
    assert.equal(session.summary.includes('[['), false);
    assert.equal(session.summary.includes(far), false);

    const named = rowFace(entry({ kind: 'note', title: '', body: '[[' + far + '|Far Margin]] owes the cutter.' }), {});
    assert.equal(named.name, 'Far Margin owes the cutter.');
    assert.equal(named.summary, null);

    const unknown = rowFace(entry({ kind: 'note', title: '', body: '[[' + RECORD + ']]' }), {});
    assert.equal(unknown.name, 'Untitled note');

    const found = entry({ id: 'cj_dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: '', body: 'Ask [[' + far + ']]' });
    assert.deepEqual(filterEntries([found], { kind: 'all', query: 'margin', hexIds: null, nameOf: names }).map((item) => item.id), [found.id]);
    assert.deepEqual(filterEntries([found], { kind: 'all', query: far.slice(0, 12), hexIds: null }).map((item) => item.id), [found.id]);
});

test('the filter keeps the store order and the search reads title and body', () => {
    const older = entry({ id: 'cj_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'session', title: 'Down', sequence: 13, body: 'the well' });
    const newer = entry({ id: 'cj_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'note', title: '', body: 'Ask at the scout base' });
    const rumour = entry({ id: 'cj_cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'rumor', title: 'Scandium', body: 'A ship is buying.' });
    const list = [newer, older, rumour];
    assert.deepEqual(filterEntries(list, { kind: 'all', query: '', hexIds: null }).map((item) => item.id), list.map((item) => item.id));
    assert.deepEqual(filterEntries(list, { kind: 'session', query: '', hexIds: null }).map((item) => item.title), ['Down']);
    assert.deepEqual(filterEntries(list, { kind: 'all', query: 'scout', hexIds: null }).map((item) => item.id), [newer.id]);
    assert.deepEqual(filterEntries(list, { kind: 'all', query: 'scandium ship', hexIds: null }).map((item) => item.id), [rumour.id]);
    assert.deepEqual(filterEntries(list, { kind: 'note', query: 'well', hexIds: null }), []);
    const here = new Set([older.id]);
    assert.deepEqual(filterEntries(list, { kind: 'all', query: '', hexIds: here }).map((item) => item.id), [older.id]);
    assert.deepEqual(kindCounts(list), { all: 3, session: 1, note: 1, handout: 0, rumor: 1 });
});

test('a long list draws the rows in the scrollport', () => {
    assert.deepEqual(visibleRange(0, 0, 400, 64), { start: 0, end: 0 });
    assert.deepEqual(visibleRange(2000, 0, 400, 64), { start: 0, end: 13 });
    assert.deepEqual(visibleRange(2000, 6400, 400, 64), { start: 94, end: 113 });
    assert.deepEqual(visibleRange(2000, 2000 * 64, 400, 64).end, 2000);
});

test('a body draws a record chip, a hex chip, and leaves an unknown token and a script as text', () => {
    const text = 'See [[cr_22222222-2222-4222-8222-222222222222|Captain Voss]] at [[hex:Spinward_Marches/1910|Regina]]. [[not a token]] <script>alert(1)</script>';
    const parts = bodyParts(text, (target) => (target === RECORD ? 'Captain Voss' : null));
    assert.deepEqual(parts.map((part) => part.kind), ['text', 'record', 'text', 'hex', 'text']);
    const record = parts[1];
    const hex = parts[3];
    assert.equal(record.kind === 'record' && record.label, 'Captain Voss');
    assert.equal(hex.kind === 'hex' && hex.hexKey, 'Spinward_Marches/1910');
    const tail = parts[4];
    assert.equal(tail.kind, 'text');
    assert.match(tail.kind === 'text' ? tail.text : '', /\[\[not a token\]\]/);
    assert.match(tail.kind === 'text' ? tail.text : '', /<script>alert\(1\)<\/script>/);
    const renamed = bodyParts('[[cr_22222222-2222-4222-8222-222222222222|Old]]', () => 'Beowulf');
    assert.equal(renamed[0].kind === 'record' && renamed[0].label, 'Beowulf');
});

test('the two date fields accept DDD-YYYY and YYYY-MM-DD and refuse a script', () => {
    assert.deepEqual(parseWhen('213-1105'), { year: 1105, day: 213 });
    assert.equal(parseWhen('213'), null);
    assert.equal(parseWhen('<script>'), null);
    assert.equal(parsePlayed('2026-10-04'), '2026-10-04');
    assert.equal(parsePlayed('2026-02-31'), null);
    assert.equal(parsePlayed(''), null);
});
