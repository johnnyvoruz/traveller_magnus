import assert from 'node:assert/strict';
import { test } from 'node:test';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import {
    deleteEntry,
    draftNote,
    draftSession,
    entriesAtHex,
    entriesByDate,
    entriesMentioning,
    entriesNewestFirst,
    nextSessionNumber,
    rebuildJournalIndex,
    restoreEntry,
    saveEntry,
} from '../../apps/web/src/campaign/journal.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';

const memory = new Map();
globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(String(key), String(value)); },
    removeItem(key) { memory.delete(key); },
};

const VESSEL = 'cr_11111111-1111-1111-1111-111111111111';
const PERSON = 'cr_22222222-2222-2222-2222-222222222222';
const HEX = 'Spinward_Marches/1910';
const OTHER = 'Spinward_Marches/1911';

function idFor(n) {
    return `cj_00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

function entry(n, over = {}) {
    return {
        id: idFor(n),
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

function vessel() {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name: 'Beowulf',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
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
    };
}

function settings(party) {
    return {
        party: party || { vesselId: null, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
}

function hold(entries, records = {}, days = null) {
    resetCampaign();
    Object.assign(campaign.journal, entries);
    Object.assign(campaign.records, records);
    campaign.clock = days == null ? null : { days, rev: 1 };
    rebuildJournalIndex(campaign.journal, campaign.records, days);
}

function localDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
}

test('the journal lists by updatedAt, and the timeline keeps the date order', () => {
    const rows = {
        [idFor(1)]: entry(1, { when: { year: 1105, day: 10 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' }),
        [idFor(2)]: entry(2, { when: { year: 1105, day: 40 }, createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }),
        [idFor(3)]: entry(3, { kind: 'rumor', when: { year: 1106, day: 1 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }),
        [idFor(4)]: entry(4, { createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }),
        [idFor(5)]: entry(5, { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }),
        [idFor(6)]: entry(6, { when: { year: 1105, day: 40 }, createdAt: '2026-05-02T00:00:00.000Z', updatedAt: '2026-05-02T00:00:00.000Z' }),
        [idFor(7)]: entry(7, { when: { year: 1105, day: 40 }, createdAt: '2026-05-02T00:00:00.000Z', updatedAt: '2026-05-02T00:00:00.000Z' }),
        [idFor(8)]: entry(8, { when: { year: 1105, day: 10 }, updatedAt: '2026-12-01T00:00:00.000Z', deleted: true }),
    };
    hold(rows);
    const dated = [idFor(3), idFor(6), idFor(7), idFor(2), idFor(1), idFor(4), idFor(5)];
    assert.deepEqual(entriesByDate().map((item) => item.id), dated);
    assert.deepEqual(entriesByDate('rumor').map((item) => item.id), [idFor(3)]);
    assert.deepEqual(entriesByDate('session'), []);
    assert.deepEqual(entriesNewestFirst().map((item) => item.id), [
        idFor(4), idFor(5), idFor(6), idFor(7), idFor(1), idFor(2), idFor(3),
    ]);
    assert.deepEqual(entriesNewestFirst('rumor').map((item) => item.id), [idFor(3)]);
    assert.deepEqual(entriesNewestFirst('session'), []);
});

test('entries at a hex follow the anchor, and mentions are the stored list', () => {
    const rows = {
        [idFor(1)]: entry(1, { anchor: { kind: 'system', hexKey: HEX }, createdAt: '2026-02-01T00:00:00.000Z' }),
        [idFor(2)]: entry(2, {
            anchor: { kind: 'record', id: VESSEL },
            createdAt: '2026-03-01T00:00:00.000Z',
            mentions: [PERSON, 'hex:' + HEX],
        }),
        [idFor(3)]: entry(3, { anchor: { kind: 'system', hexKey: OTHER }, mentions: [PERSON] }),
        [idFor(4)]: entry(4, { anchor: { kind: 'system', hexKey: HEX }, deleted: true, mentions: [PERSON] }),
    };
    hold(rows, { [VESSEL]: vessel() }, totalDays(1105, 2));
    assert.deepEqual(entriesAtHex(HEX).map((item) => item.id), [idFor(2), idFor(1)]);
    assert.deepEqual(entriesAtHex(OTHER).map((item) => item.id), [idFor(3)]);
    assert.deepEqual(entriesMentioning(PERSON).map((item) => item.id), [idFor(2), idFor(3)]);
    assert.deepEqual(entriesMentioning('hex:' + HEX).map((item) => item.id), [idFor(2)]);
});

test('a deleted session number is not reused, and restoring it leaves two different numbers', () => {
    hold({
        [idFor(1)]: entry(1, { kind: 'session', sequence: 1, title: 'Session 1' }),
        [idFor(14)]: entry(14, { kind: 'session', sequence: 14, title: 'Session 14' }),
    });
    campaign.status = 'ready';
    campaign.universeId = 'uni-1';
    transport.schedule = () => () => {};
    assert.equal(nextSessionNumber(), 15);
    assert.equal(deleteEntry(idFor(14)), true);
    assert.equal(nextSessionNumber(), 15);
    const added = draftSession();
    assert.equal(added.sequence, 15);
    assert.equal(saveEntry(added), true);
    assert.equal(restoreEntry(idFor(14)), true);
    assert.equal(campaign.journal[idFor(14)].sequence, 14);
    assert.equal(campaign.journal[added.id].sequence, 15);
});

test('a session draft takes the clock and the party, and a note draft takes neither', () => {
    resetCampaign();
    const bare = draftSession();
    assert.equal(bare.kind, 'session');
    assert.equal(bare.sequence, 1);
    assert.equal(bare.title, 'Session 1');
    assert.equal(bare.when, null);
    assert.equal(bare.realDate, localDate());
    assert.equal(bare.anchor, null);
    assert.equal(bare.body, '');
    assert.equal(bare.author, 'referee');
    assert.equal(bare.visibility, 'referee');
    assert.equal(campaign.journal[bare.id], undefined);

    campaign.clock = { days: totalDays(1105, 35), rev: 2 };
    const dated = draftSession();
    assert.deepEqual(dated.when, { year: 1105, day: 35 });
    assert.equal(dated.anchor, null);

    campaign.settings = settings({
        vesselId: VESSEL,
        memberIds: [],
        anchor: { kind: 'system', hexKey: OTHER },
    });
    campaign.records[VESSEL] = vessel();
    const aboard = draftSession();
    assert.deepEqual(aboard.anchor, { kind: 'system', hexKey: HEX, locationLabel: 'Regina' });

    campaign.settings = settings({
        vesselId: null,
        memberIds: [],
        anchor: { kind: 'system', hexKey: OTHER },
    });
    campaign.clock = null;
    const parked = draftSession();
    assert.equal(parked.when, null);
    assert.deepEqual(parked.anchor, { kind: 'system', hexKey: OTHER });

    const note = draftNote();
    assert.equal(note.kind, 'note');
    assert.equal(note.title, '');
    assert.equal(note.when, null);
    assert.equal(note.realDate, null);
    assert.equal(note.sequence, null);
    assert.equal(note.anchor, null);
    assert.equal(campaign.journal[note.id], undefined);
});

test('saveEntry derives mentions, and signed out it holds nothing', () => {
    resetCampaign();
    campaign.status = 'ready';
    campaign.universeId = 'uni-1';
    transport.schedule = () => () => {};
    const note = draftNote();
    note.body = `[[${PERSON}|Captain Voss]] [[hex:${HEX}|Regina]] [[${PERSON}]] [[something else]]`;
    assert.equal(saveEntry(note), true);
    assert.deepEqual(campaign.journal[note.id].mentions, [PERSON, 'hex:' + HEX]);
    assert.equal(Object.hasOwn(campaign.journal[note.id], 'baseRev'), false);

    resetCampaign();
    assert.equal(campaign.status, 'signed-out');
    assert.deepEqual(campaign.journal, {});
    const again = draftNote();
    assert.equal(saveEntry(again), false);
    assert.equal(deleteEntry(again.id), false);
    assert.equal(campaign.journal[again.id], undefined);
});
