/**
 * The Player Pack leak gate. Every referee-only string in the fixture is a
 * unique marker. None of them may appear in the file.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_RECORD_TYPES, CAMPAIGN_ENTRY_KINDS } from '@voyage/shared';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { buildPlayerPack, packFileName } from '../../apps/web/src/pack/build.ts';
import { planPack } from '../../apps/web/src/pack/plan.ts';

const PAINT = {
    bg: 'black',
    surface: 'black',
    text: 'white',
    muted: 'silver',
    line: 'silver',
    signal: 'teal',
    onSignal: 'black',
};

function rid(prefix, n) {
    return prefix + '11111111-1111-4111-8111-' + n.toString(16).padStart(12, '0');
}

function record(n, type, players, over = {}) {
    const marker = (players ? 'ZPLAY_' : 'ZREF_') + type + n;
    return {
        id: rid('cr_', n),
        type,
        kind: marker + '_KIND',
        name: marker + '_NAME',
        summary: marker + '_SUMMARY',
        details: marker + '_DETAILS',
        tags: [marker + '_TAG'],
        anchor: null,
        when: { start: { year: 1105, day: 50 } },
        visibility: players ? 'players' : 'referee',
        playerNotes: marker + '_NOTES',
        sheet: { line: marker + '_SHEET' },
        status: { note: marker + '_STATUS' },
        images: [{
            hash: 'ab'.repeat(32),
            thumbHash: 'cd'.repeat(32),
            width: 8,
            height: 8,
            bytes: 8,
            caption: marker + '_CAPTION',
        }],
        provenance: {
            mode: 'copy',
            universeId: marker + '_PROV',
            recordId: rid('cr_', 9000),
            rev: 1,
            at: '2026-10-12T00:00:00.000Z',
        },
        rev: 1,
        createdAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z',
        deleted: false,
        ...over,
    };
}

function entry(n, kind, players, over = {}) {
    const marker = (players ? 'ZPLAY_' : 'ZREF_') + kind + n;
    return {
        id: rid('cj_', n),
        kind,
        title: marker + '_TITLE',
        body: marker + '_BODY',
        when: { year: 1105, day: 40 },
        realDate: '2026-10-01',
        sequence: kind === 'session' ? 1 : null,
        author: 'referee',
        visibility: players ? 'players' : 'referee',
        anchor: null,
        mentions: [],
        rev: 1,
        createdAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z',
        deleted: false,
        ...over,
    };
}

function fixture() {
    const records = {};
    const journal = {};
    let n = 1;
    const play = {};
    const ref = {};
    for (const type of CAMPAIGN_RECORD_TYPES) {
        play[type] = record(n, type, true);
        records[play[type].id] = play[type];
        n += 1;
        ref[type] = record(n, type, false);
        records[ref[type].id] = ref[type];
        n += 1;
    }
    play.person.anchor = { kind: 'record', id: ref.place.id };
    play.place.anchor = {
        kind: 'system',
        hexKey: 'Bare_Sector/0101',
        locationLabel: 'ZPLAY_PLACE_LABEL',
    };
    const future = record(n, 'event', true, {
        name: 'ZPLAY_FUTURE_NAME',
        when: { start: { year: 1105, day: 200 } },
    });
    n += 1;
    records[future.id] = future;
    const deleted = record(n, 'note', false, { name: 'ZREF_DELETED_NAME', deleted: true });
    records[deleted.id] = deleted;

    const playEntry = {};
    const refEntry = {};
    let e = 1;
    for (const kind of CAMPAIGN_ENTRY_KINDS) {
        playEntry[kind] = entry(e, kind, true);
        journal[playEntry[kind].id] = playEntry[kind];
        e += 1;
        refEntry[kind] = entry(e, kind, false);
        journal[refEntry[kind].id] = refEntry[kind];
        e += 1;
    }
    playEntry.note.body = 'See [[' + ref.person.id + '|ZREF_MENTION_LABEL]] and [['
        + play.person.id + '|ZREF_STALE_LABEL]] plus [[hex:Ref_Sector/1910|Public hex label]] and [[hex:Bare_Sector/0101]].';
    playEntry.note.mentions = [ref.person.id, play.person.id, 'hex:Ref_Sector/1910', 'hex:Bare_Sector/0101'];
    playEntry.note.anchor = { kind: 'record', id: ref.vessel.id };
    const futureEntry = entry(e, 'handout', true, {
        title: 'ZPLAY_FUTURE_ENTRY',
        when: { year: 1105, day: 220 },
    });
    journal[futureEntry.id] = futureEntry;

    const links = {};
    const shown = {
        id: rid('cl_', 1),
        from: play.person.id,
        to: play.organization.id,
        kind: 'member',
        role: 'ZREF_LINK_ROLE',
        order: 0,
        since: null,
        until: null,
        notes: 'ZREF_LINK_NOTES',
        visibility: 'referee',
        provenance: null,
        rev: 1,
        createdAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z',
        deleted: false,
    };
    const hidden = {
        ...shown,
        id: rid('cl_', 2),
        to: ref.organization.id,
        role: 'ZREF_HIDDEN_ROLE',
        notes: 'ZREF_HIDDEN_NOTES',
    };
    links[shown.id] = shown;
    links[hidden.id] = hidden;

    return {
        playEntry,
        input: {
            name: 'ZPLAY Campaign',
            clockDays: totalDays(1105, 100),
            records,
            links,
            journal,
            settings: {
                party: {
                    vesselId: ref.vessel.id,
                    memberIds: [play.person.id, ref.person.id, deleted.id],
                    anchor: { kind: 'system', hexKey: 'Secret_Sector/9999', locationLabel: 'ZREF_PARTY_PLACE' },
                },
                kinds: { person: ['ZREF_KIND_LIST'] },
                calendar: { dateFormat: 'imperial' },
                rev: 1,
            },
        },
        play,
        ref,
    };
}

test('the file contains no referee-only marker', () => {
    const { input, play, playEntry } = fixture();
    const file = buildPlayerPack(input, PAINT);
    const leaked = file.html.indexOf('ZREF_');
    assert.equal(leaked, -1, leaked < 0 ? '' : file.html.slice(leaked, leaked + 80));
    assert.equal(file.html.includes(play.person.name), true);
    assert.equal(file.html.includes(play.vessel.name), true);
    assert.equal(file.html.includes(playEntry.note.title), true);
    assert.equal(file.html.includes('a record'), true);
    assert.equal(file.html.includes('Public hex label'), true);
    assert.equal(file.html.includes('Bare_Sector/0101'), true);
    assert.equal(file.html.includes('ZREF_STALE_LABEL'), false);
    assert.equal(file.html.includes(play.person.sheet.line), true);
    assert.equal(file.html.includes(play.vessel.sheet.line), false);
    assert.equal(file.html.includes(play.person.images[0].caption), false);
    assert.equal(file.html.includes(play.person.provenance.universeId), false);
    assert.equal(file.html.includes('Member of'), true);
    assert.equal(file.html.includes(play.organization.name), true);
    assert.equal(file.plan.counts.linksLeftOut >= 1, true);
    assert.equal(file.plan.counts.linkTextLeftOff >= 1, true);
    assert.equal(file.plan.counts.mentions >= 1, true);
    assert.equal(file.plan.counts.places >= 1, true);
    assert.equal(file.plan.counts.partyMembers >= 1, true);
    assert.equal(file.plan.counts.ship, 1);
    assert.equal(file.plan.counts.timeline, 2);
    assert.equal(file.plan.leftOut, file.plan.counts.recordsLeftOut + file.plan.counts.entriesLeftOut);
    assert.equal(file.plan.includedRecords, CAMPAIGN_RECORD_TYPES.length + 1);
    assert.equal(file.plan.includedEntries, CAMPAIGN_ENTRY_KINDS.length + 1);
    assert.match(file.html, /Campaign date: 100-1105/);
    assert.equal(file.fileName, 'ZPLAY Campaign - Player Pack - 100-1105.html');
    const timeline = file.html.slice(file.html.indexOf('id="timeline"'), file.html.indexOf('id="r-'));
    assert.equal(timeline.includes('ZPLAY_FUTURE_NAME'), false);
    assert.equal(timeline.includes('ZPLAY_FUTURE_ENTRY'), false);
    assert.equal(file.html.includes('ZPLAY_FUTURE_NAME'), true);
});

test('no date keeps every dated player row and says so', () => {
    const { input } = fixture();
    const plan = planPack({ ...input, clockDays: null });
    assert.equal(plan.clockLabel, 'no date');
    assert.equal(plan.counts.timeline, 0);
    assert.equal(plan.timeline.some((row) => row.title === 'ZPLAY_FUTURE_NAME'), true);
});

test('a file name drops characters a file system refuses', () => {
    assert.equal(packFileName('A/B:C', 'no date'), 'ABC - Player Pack - no date.html');
});

test('ten copies of the fixture build a file and report its size', () => {
    const { input } = fixture();
    const records = { ...input.records };
    const journal = { ...input.journal };
    const baseRecords = Object.values(input.records).filter((row) => row.visibility === 'players' && !row.deleted);
    const baseEntries = Object.values(input.journal).filter((row) => row.visibility === 'players' && !row.deleted);
    for (let copy = 1; copy <= 10; copy += 1) {
        for (const row of baseRecords) {
            const id = rid('cr_', 1000 + copy * 50 + Number(row.id.slice(-3)));
            records[id] = { ...row, id, name: row.name + ' copy ' + copy };
        }
        for (const row of baseEntries) {
            const id = rid('cj_', 1000 + copy * 50 + Number(row.id.slice(-3)));
            journal[id] = { ...row, id, title: row.title + ' copy ' + copy };
        }
    }
    const started = Date.now();
    const file = buildPlayerPack({ ...input, records, journal }, PAINT);
    const ms = Date.now() - started;
    assert.equal(file.html.includes('ZREF_'), false);
    assert.ok(file.bytes > 0);
    console.log('player pack 10x bytes ' + file.bytes + ' ms ' + ms + ' records ' + file.plan.includedRecords);
});
