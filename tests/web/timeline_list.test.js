/**
 * The Campaign timeline list: dated journal entries and dated records, newest first,
 * grouped by year then day, with Today on the campaign date. The view only reads.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_RECORD_TYPES } from '@voyage/shared';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { campaignCrumb } from '../../apps/web/src/workspace/crumb.ts';
import { buildTimeline, todayIndex } from '../../apps/web/src/workspace/timeline.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const view = fs.readFileSync(path.join(root, 'apps/web/src/workspace/TimelineList.vue'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'apps/web/src/workspace/timeline.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'apps/web/src/workspace/CampaignPanel.vue'), 'utf8');
const list = fs.readFileSync(path.join(root, 'apps/web/src/workspace/CampaignList.vue'), 'utf8');
const journalList = fs.readFileSync(path.join(root, 'apps/web/src/workspace/journal/JournalList.vue'), 'utf8');

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

function ids(model) {
    return model.years.flatMap((year) => year.days.flatMap((day) => day.rows.map((row) => row.id)));
}

test('dated rows group by year then day, newest first, and undated rows stay off the list', () => {
    const vessel = record(1, 'vessel', {
        name: 'Beowulf',
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' },
        when: { start: { year: 1106, day: 14 }, end: { year: 1106, day: 20 } },
        createdAt: '2026-03-01T00:00:00.000Z',
        visibility: 'players',
    });
    const person = record(2, 'person', {
        name: 'Voss',
        when: { start: { year: 1107, day: 10 }, end: { year: 1107, day: 10 } },
        createdAt: '2026-04-02T00:00:00.000Z',
        anchor: { kind: 'record', id: vessel.id },
    });
    const gone = record(3, 'event', { deleted: true, when: { start: { year: 1108, day: 1 } } });
    const undated = record(4, 'note', { name: 'Loose note' });
    const session = entry(1, {
        kind: 'session',
        title: 'At Regina',
        sequence: 3,
        when: { year: 1107, day: 10 },
        createdAt: '2026-04-01T00:00:00.000Z',
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' },
        visibility: 'players',
    });
    const rumor = entry(2, { kind: 'rumor', title: 'A whisper', when: { year: 1105, day: 2 } });
    const noDate = entry(3, { title: 'Undated' });
    const dropped = entry(4, { deleted: true, when: { year: 1109, day: 1 } });
    const records = { [vessel.id]: vessel, [person.id]: person, [gone.id]: gone, [undated.id]: undated };
    const model = buildTimeline({
        entries: [session, rumor, noDate, dropped],
        records,
        clockDays: totalDays(1106, 14),
    });

    assert.deepEqual(model.years.map((year) => year.year), [1107, 1106, 1105]);
    assert.equal(model.years[0].days.length, 1);
    assert.equal(model.years[0].days[0].date, '010-1107');
    assert.equal(model.years[0].days[0].rows.length, 2);
    assert.equal(model.years[0].days[0].rows[0].title, 'Voss');
    assert.equal(model.years[0].days[0].rows[0].kind, 'Person');
    assert.equal(model.years[0].days[0].rows[0].place, 'Aboard Beowulf');
    assert.equal(model.years[0].days[0].rows[0].hexKey, 'Spinward_Marches/1910');
    assert.equal(model.years[0].days[0].rows[0].until, null);
    assert.equal(model.years[0].days[0].rows[1].kind, 'Session');
    assert.equal(model.years[0].days[0].rows[1].date, '010-1107');
    assert.equal(model.years[0].days[0].rows[1].icon, 'calendar-star');
    assert.equal(model.years[1].days[0].today, true);
    assert.equal(model.years[1].days[0].rows[0].until, '020-1106');
    assert.equal(model.years[1].days[0].rows[0].date, '014-1106');
    assert.equal(model.years[1].days[0].rows[0].place, 'Spinward Marches 1910 · Regina system');
    assert.equal(model.years[2].days[0].rows[0].kind, 'Rumour');
    assert.equal(model.count, 4);
    assert.ok(!ids(model).includes(noDate.id));
    assert.ok(!ids(model).includes(undated.id));
    assert.ok(!ids(model).includes(gone.id));
    assert.equal(todayIndex(model), 2);
});

test('every record kind uses when.start, and a referee-only row is still listed', () => {
    const records = {};
    CAMPAIGN_RECORD_TYPES.forEach((type, index) => {
        const row = record(index + 1, type, {
            when: { start: { year: 1105, day: index + 1 } },
            visibility: index === 0 ? 'referee' : 'players',
        });
        records[row.id] = row;
    });
    const model = buildTimeline({ entries: [], records, clockDays: null });
    assert.equal(model.count, CAMPAIGN_RECORD_TYPES.length);
    assert.deepEqual(
        model.years[0].days.map((day) => day.rows[0].kind),
        ['Vessel', 'Note', 'Item', 'Event', 'Job', 'Organization', 'Business', 'Place', 'Person'],
    );
    const referee = model.years[0].days.at(-1).rows[0];
    assert.equal(referee.visibility, 'referee');
    assert.equal(referee.kind, 'Person');
    assert.equal(model.years.some((year) => year.days.some((day) => day.today)), false);
});

test('Today is inserted when that day has no row, and a missing clock adds none', () => {
    const row = entry(9, { when: { year: 1105, day: 2 }, title: 'Holiday week' });
    const marked = buildTimeline({
        entries: [row],
        records: {},
        clockDays: totalDays(1107, 200),
    });
    assert.equal(marked.years[0].year, 1107);
    assert.equal(marked.years[0].days[0].today, true);
    assert.equal(marked.years[0].days[0].date, '200-1107');
    assert.equal(marked.years[0].days[0].rows.length, 0);
    assert.equal(marked.count, 1);
    assert.equal(todayIndex(marked), 0);

    const plain = buildTimeline({ entries: [row], records: {}, clockDays: null });
    assert.equal(plain.years.length, 1);
    assert.equal(plain.years[0].days[0].today, false);
});

test('the trail returns to Campaign, and the list is one tab stop that only reads', () => {
    assert.deepEqual(campaignCrumb({ level: 'timeline', beside: true, middle: 'Timeline', pageName: 'Timeline' }), [
        { label: 'Campaign', go: 'campaign' },
        { label: 'Timeline', go: null },
    ]);
    assert.match(view, /tabindex="0"/);
    assert.match(view, /entriesByDate\(\)/);
    assert.match(view, /role="listbox"/);
    assert.match(view, /or set a date on a record/);
    assert.match(view, /Open the Journal/);
    assert.doesNotMatch(view, /setCampaignDate/);
    assert.doesNotMatch(builder, /setCampaignDate/);
    assert.match(panel, /class="camp-timeline"/);
    assert.match(list, /emit\('timeline'\)/);
    assert.doesNotMatch(list, /visibility/);
    assert.doesNotMatch(journalList, /visibility/);
});
