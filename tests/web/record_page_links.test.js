/**
 * The record page's "Mentioned in" and "On the timeline" (manifesto: Connected): the entries
 * that mention a record, newest first, capped with "Show all"; the record's own timeline rows,
 * read from buildTimeline; both hidden when empty.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { entriesMentioning, rebuildJournalIndex } from '../../apps/web/src/campaign/journal.ts';
import { MENTIONS_SHOWN, mentionRows, recordTimelineRows, shownMentions } from '../../apps/web/src/workspace/record_links.ts';
import { buildTimeline } from '../../apps/web/src/workspace/timeline.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, 'apps/web/src/workspace', file), 'utf8');
const page = read('RecordPage.vue');
const mentions = read('RecordMentions.vue');
const timeline = read('RecordTimeline.vue');

function entry(n, over = {}) {
    return {
        id: `cj_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        kind: 'note',
        title: 'Note ' + n,
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        images: null,
        rev: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deleted: false,
        ...over,
    };
}

function record(n, type, over = {}) {
    return {
        id: `cr_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        type,
        kind: '',
        name: type + ' ' + n,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deleted: false,
        ...over,
    };
}

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));

test('the entries that mention a record come newest first, undated last, deleted ones left out', () => {
    const voss = record(1, 'person', { name: 'Voss' });
    const other = record(2, 'person', { name: 'Kell' });
    const old = entry(1, { kind: 'session', title: 'At Regina', sequence: 1, when: { year: 1105, day: 10 }, mentions: [voss.id] });
    const late = entry(2, { kind: 'rumor', title: 'A whisper', when: { year: 1106, day: 2 }, mentions: [other.id, voss.id] });
    const loose = entry(3, { title: '', body: 'Met [[' + voss.id + ']] again', mentions: [voss.id] });
    const gone = entry(4, { deleted: true, when: { year: 1107, day: 1 }, mentions: [voss.id] });
    const elsewhere = entry(5, { when: { year: 1108, day: 1 }, mentions: [other.id] });
    rebuildJournalIndex(byId([old, late, loose, gone, elsewhere]), byId([voss, other]), null);

    const rows = mentionRows(entriesMentioning(voss.id), (id) => (id === voss.id ? 'Voss' : null));
    assert.deepEqual(rows.map((row) => row.id), [late.id, old.id, loose.id]);
    assert.equal(rows[0].title, 'A whisper');
    assert.equal(rows[0].kindWord, 'Rumour');
    assert.equal(rows[0].date, '002-1106');
    assert.equal(rows[1].icon, 'calendar-star');
    assert.equal(rows[2].date, null);
    assert.equal(rows[2].title, 'Met Voss again', 'a title-less note reads as the journal list reads it');

    const nobody = record(9, 'place');
    assert.deepEqual(mentionRows(entriesMentioning(nobody.id)), []);
});

test('the list stops at the cap until "Show all"', () => {
    const many = Array.from({ length: MENTIONS_SHOWN + 7 }, (_, at) => entry(at + 1, { when: { year: 1105, day: at + 1 } }));
    const rows = mentionRows(many);
    const capped = shownMentions(rows, false);
    assert.equal(MENTIONS_SHOWN, 20);
    assert.equal(capped.rows.length, 20);
    assert.equal(capped.hidden, 7);
    assert.equal(capped.rows[0].id, many[0].id);
    const open = shownMentions(rows, true);
    assert.equal(open.rows.length, 27);
    assert.equal(open.hidden, 0);
    assert.equal(shownMentions(rows.slice(0, 20), false).hidden, 0);
});

test('a record lists its own timeline rows, as the timeline builds them', () => {
    const ship = record(1, 'vessel', {
        name: 'Beowulf',
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' },
        when: { start: { year: 1106, day: 14 }, end: { year: 1106, day: 20 } },
    });
    const undated = record(2, 'person', { name: 'Voss' });
    const sameDay = entry(1, { id: ship.id.replace('cr_', 'cj_'), when: { year: 1106, day: 14 } });
    const model = buildTimeline({ entries: [sameDay], records: byId([ship, undated]), clockDays: totalDays(1106, 14) });

    const rows = recordTimelineRows(ship.id, model);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].row.date, '014-1106');
    assert.equal(rows[0].row.until, '020-1106');
    assert.equal(rows[0].row.place, 'Spinward Marches 1910 · Regina system');
    assert.equal(rows[0].today, true);
    assert.equal(typeof rows[0].weekday, 'string');
    assert.deepEqual(recordTimelineRows(undated.id, model), [], 'a record with no date is not on the timeline');
});

test('the page carries both sections, hidden when empty, linking to the entry and the timeline', () => {
    assert.match(page, /<RecordMentions :id="id" \/>/);
    assert.match(page, /<RecordTimeline :id="id" \/>/);
    assert.match(mentions, /<section v-if="rows\.length"/);
    assert.match(mentions, /kind: 'journal', entry: entryId/);
    assert.match(mentions, /Show all/);
    assert.match(timeline, /<section v-if="rows\.length"/);
    assert.match(timeline, /buildTimeline\(/, 'the rows come from the timeline itself, not a copy');
    assert.match(timeline, /timelineAt\.value = rowId/);
});

test('a row on the record page opens the timeline at that row, then the ask is cleared', () => {
    const panel = read('CampaignPanel.vue');
    const list = read('TimelineList.vue');
    assert.match(panel, /import \{ timelineAt \} from '\.\/timeline_focus\.ts';/);
    assert.match(panel, /watch\(timelineAt, \(id\) => \{ if \(id\) openTimeline\(\); \}\);/);
    assert.match(list, /bindKeys\(\);\s+openAtAsked\(\);/);
    assert.match(list, /const asked = timelineAt\.value;\s+timelineAt\.value = null;/, 'the ask is read once');
    assert.match(list, /const wanted = asked \|\| props\.row;/, 'a cold load uses the address row');
    assert.match(list, /if \(!wanted \|\| at < 0\) \{\s+openAtToday\(\);/, 'no row, or a row that is gone: Today, as before');
});

test('the Where heading is a kicker on every screen that uses it', () => {
    assert.match(read('WhereBlock.vue'), /<h3 class="ui-heading ui-kicker">\{\{ heading \}\}<\/h3>/);
});

test('an opened timeline takes the keyboard, unless a field is being typed in (stream N5)', () => {
    const list = read('TimelineList.vue');
    assert.match(list, /function takeFocus\(root: HTMLElement\): void \{/);
    assert.match(list, /if \(tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'\) return;/);
    assert.equal((list.match(/takeFocus\(root\);/g) || []).length, 2, 'at Today and at an asked row');
});
