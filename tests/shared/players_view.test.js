/**
 * The players projection (Epic P, decision 3). The leak markers are the ones
 * in tests/web/player_pack.test.js: a referee-only string starts with ZREF_.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_ENTRY_KINDS, CAMPAIGN_RECORD_TYPES, CampaignPage, CampaignRecord, playersObjectHashes, playersView } from '@voyage/shared';

const STAMP = '2026-10-12T00:00:00.000Z';

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
            hash: (players ? 'ab' : 'ef').repeat(32),
            thumbHash: (players ? 'cd' : '11').repeat(32),
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
            at: STAMP,
        },
        rev: 4,
        createdAt: STAMP,
        updatedAt: STAMP,
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
        images: null,
        rev: 4,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function packFixture() {
    const records = [];
    const journal = [];
    let n = 1;
    const play = {};
    const ref = {};
    for (const type of CAMPAIGN_RECORD_TYPES) {
        play[type] = record(n, type, true);
        records.push(play[type]);
        n += 1;
        ref[type] = record(n, type, false);
        records.push(ref[type]);
        n += 1;
    }
    play.person.anchor = { kind: 'record', id: ref.place.id };
    play.place.anchor = { kind: 'system', hexKey: 'Bare_Sector/0101', locationLabel: 'ZPLAY_PLACE_LABEL' };
    const deleted = record(n, 'note', false, { name: 'ZREF_DELETED_NAME', deleted: true });
    records.push(deleted);

    const playEntry = {};
    let e = 1;
    for (const kind of CAMPAIGN_ENTRY_KINDS) {
        playEntry[kind] = entry(e, kind, true);
        journal.push(playEntry[kind]);
        e += 1;
        journal.push(entry(e, kind, false));
        e += 1;
    }
    playEntry.note.body = 'See [[' + ref.person.id + '|ZREF_MENTION_LABEL]] and [['
        + play.person.id + '|ZREF_STALE_LABEL]] plus [[hex:Ref_Sector/1910|Public hex label]] and [[hex:Bare_Sector/0101]].';
    playEntry.note.mentions = [ref.person.id, play.person.id, 'hex:Ref_Sector/1910', 'hex:Bare_Sector/0101'];
    playEntry.note.anchor = { kind: 'record', id: ref.vessel.id };
    const publicEntry = entry(e, 'note', true, {
        visibility: 'public',
        title: 'ZPUBLIC_TITLE',
        body: 'ZPUBLIC_BODY',
    });
    journal.push(publicEntry);

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
        rev: 4,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
    };
    const hidden = {
        ...shown,
        id: rid('cl_', 2),
        to: ref.organization.id,
        role: 'ZREF_HIDDEN_ROLE',
        notes: 'ZREF_HIDDEN_NOTES',
    };
    return {
        play,
        ref,
        playEntry,
        publicEntry,
        shown,
        hidden,
        read: {
            records,
            links: [shown, hidden],
            journal,
            settings: {
                party: {
                    vesselIds: [ref.vessel.id],
                    aboard: {},
                    memberIds: [play.person.id, ref.person.id, deleted.id],
                    anchor: { kind: 'system', hexKey: 'Secret_Sector/9999', locationLabel: 'ZREF_PARTY_PLACE' },
                },
                kinds: { person: ['ZREF_KIND_LIST'] },
                calendar: { dateFormat: 'imperial' },
                rev: 9,
            },
            clock: { days: 1105 * 365 + 100 - 1, rev: 3 },
        },
    };
}

function hasOwn(value, key) {
    if (Array.isArray(value)) return value.some((item) => hasOwn(item, key));
    if (value && typeof value === 'object') {
        if (Object.prototype.hasOwnProperty.call(value, key)) return true;
        return Object.values(value).some((item) => hasOwn(item, key));
    }
    return false;
}

test('a withheld row leaves no marker, and a hidden mention reads "a record"', () => {
    const { read, play, ref, playEntry, publicEntry, shown, hidden } = packFixture();
    const view = playersView(read);
    const raw = JSON.stringify(view);
    for (const type of CAMPAIGN_RECORD_TYPES) {
        assert.equal(raw.includes('ZREF_' + type), false, type);
    }
    for (const kind of CAMPAIGN_ENTRY_KINDS) {
        assert.equal(raw.includes('ZREF_' + kind), false, kind);
    }
    assert.equal(raw.includes('ZREF_MENTION_LABEL'), false);
    assert.equal(raw.includes('ZREF_STALE_LABEL'), false);
    assert.equal(raw.includes('ZREF_DELETED_NAME'), false);
    assert.equal(raw.includes('ZREF_HIDDEN'), false);
    assert.equal(raw.includes('_PROV'), false);
    assert.equal(hasOwn(view, 'rev'), false);
    assert.equal(hasOwn(view, 'provenance'), false);
    assert.equal(raw.includes(play.person.name), true);
    assert.equal(raw.includes('a record'), true);
    assert.equal(raw.includes(play.person.name), true);
    const note = view.journal.find((row) => row.id === playEntry.note.id);
    assert.ok(note);
    assert.match(note.body, /a record/);
    assert.match(note.body, new RegExp(play.person.name));
    assert.match(note.body, /Public hex label/);
    assert.match(note.body, /Bare_Sector\/0101/);
    assert.equal(note.mentions.includes(ref.person.id), false);
    assert.equal(note.mentions.includes(play.person.id), true);
    assert.equal(note.anchor, null);
    const person = view.records.find((row) => row.id === play.person.id);
    assert.equal(person.anchor, null);
    assert.equal(view.records.some((row) => row.id === ref.person.id), false);
    assert.equal(view.links.some((row) => row.id === hidden.id), false);
    assert.equal(view.links.some((row) => row.id === shown.id), true);
    assert.equal(view.journal.some((row) => row.id === publicEntry.id), true);
    assert.equal(view.journal.some((row) => row.visibility === 'referee'), false);
    assert.equal(view.settings.kinds.person[0], 'ZREF_KIND_LIST');
    assert.equal(view.settings.party.anchor.locationLabel, 'ZREF_PARTY_PLACE');
    assert.deepEqual(view.settings.party.memberIds, [play.person.id]);
    assert.deepEqual(view.settings.party.vesselIds, []);
    assert.equal(view.clock.days, read.clock.days);
    const hashes = playersObjectHashes(view);
    assert.equal(hashes.includes('ab'.repeat(32)), true);
    assert.equal(hashes.includes('cd'.repeat(32)), true);
    assert.equal(hashes.includes('ef'.repeat(32)), false);
    assert.equal(hashes.includes('11'.repeat(32)), false);
});

test('a tombstone is out, and a public entry is in', () => {
    const live = record(1, 'person', true);
    const gone = record(2, 'note', true, { deleted: true, name: 'ZREF_TOMB' });
    const note = entry(1, 'note', false, { visibility: 'public', title: 'Open', body: 'Open body' });
    const view = playersView({
        records: [live, gone],
        links: [],
        journal: [note],
        settings: null,
        clock: null,
    });
    assert.deepEqual(view.records.map((row) => row.id), [live.id]);
    assert.equal(view.journal[0].title, 'Open');
    assert.equal(view.settings, null);
    assert.equal(view.clock, null);
    assert.equal(JSON.stringify(view).includes('ZREF_TOMB'), false);
});

function asPage(view) {
    return {
        records: view.records.map((row) => ({ ...row, rev: 0, provenance: null })),
        links: view.links.map((row) => ({ ...row, rev: 0, provenance: null })),
        journal: view.journal.map((row) => ({ ...row, rev: row.rev ?? 0 })),
        settings: view.settings ? { ...view.settings, rev: 0 } : null,
        clock: view.clock ? { days: view.clock.days, rev: 0 } : null,
        seq: 1,
        done: true,
    };
}

test('the party lists keep visible ids, a hidden leg shows the hex, and a hidden cargo id is dropped', () => {
    const hid = rid('cr_', 1);
    const ship = rid('cr_', 2);
    const pc = rid('cr_', 3);
    const refpc = rid('cr_', 4);
    const place = record(1, 'place', false, { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'ZREF_PLACE', bodyKey: 'w3' } });
    const vessel = record(2, 'vessel', true, {
        status: {
            track: [{
                from: { kind: 'system', hexKey: 'Spinward_Marches/1912' },
                to: { kind: 'record', id: hid },
                departs: 1,
                arrives: 2,
                mode: 'jump',
                note: 'Bound for ' + hid,
            }],
            cargo: [{ itemId: hid, label: 'crate', tons: 1 }],
            passengers: [{ personId: refpc, label: 'a name', class: 'middle' }, { personId: pc, label: 'kept', class: 'high' }],
        },
    });
    const person = record(3, 'person', true);
    const hiddenPerson = record(4, 'person', false);
    const keptPlace = record(5, 'place', true);
    const view = playersView({
        records: [place, vessel, person, hiddenPerson, keptPlace],
        links: [],
        journal: [],
        settings: {
            party: {
                vesselIds: [ship, rid('cr_', 9)],
                aboard: { [pc]: ship, [refpc]: ship, [keptPlace.id]: rid('cr_', 9) },
                memberIds: [pc, refpc, keptPlace.id],
                anchor: { kind: 'record', id: hid },
            },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
            rev: 3,
        },
        clock: { days: 10, rev: 2 },
    });
    assert.deepEqual(view.settings.party.memberIds, [pc, keptPlace.id]);
    assert.deepEqual(view.settings.party.vesselIds, [ship]);
    assert.deepEqual(view.settings.party.aboard, { [pc]: ship });
    assert.deepEqual(view.settings.party.anchor, { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w3' });
    assert.equal(JSON.stringify(view.settings.party.anchor).includes('ZREF_PLACE'), false);
    const shown = view.records.find((row) => row.id === ship);
    assert.deepEqual(shown.status.track[0].to, { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w3' });
    assert.equal(JSON.stringify(shown.status).includes('ZREF_PLACE'), false);
    assert.equal(shown.status.track[0].note.includes(hid), false);
    assert.equal(Object.prototype.hasOwnProperty.call(shown.status.cargo[0], 'itemId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(shown.status.passengers[0], 'personId'), false);
    assert.equal(shown.status.passengers[1].personId, pc);
    const keptEnd = record(2, 'vessel', true, {
        status: {
            track: [{
                from: { kind: 'record', id: keptPlace.id },
                to: { kind: 'record', id: hid },
                departs: 1,
                arrives: 2,
                mode: 'jump',
            }],
        },
    });
    const keptView = playersView({
        records: [place, keptEnd, keptPlace],
        links: [],
        journal: [],
        settings: null,
        clock: null,
    });
    const leg = keptView.records.find((row) => row.id === ship).status.track[0];
    assert.deepEqual(leg.from, { kind: 'record', id: keptPlace.id });
    assert.deepEqual(leg.to, { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w3' });
    const blank = record(6, 'place', false, { anchor: null });
    const blankView = playersView({
        records: [blank],
        links: [],
        journal: [],
        settings: {
            party: {
                vesselIds: [],
                aboard: {},
                memberIds: [],
                anchor: { kind: 'record', id: blank.id },
            },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
            rev: 1,
        },
        clock: null,
    });
    assert.equal(blankView.settings.party.anchor, null);
});

test('an owner anchor to a hidden person is dropped', () => {
    const hid = rid('cr_', 4);
    const keptId = rid('cr_', 3);
    const ship = rid('cr_', 2);
    const vessel = record(2, 'vessel', true, {
        status: {
            owners: [
                { holder: { kind: 'record', id: hid }, shares: 25 },
                { holder: { kind: 'record', id: keptId }, shares: 50 },
                { holder: 'party', shares: 25 },
            ],
            fuelTons: 31,
            fuelMark: 'naval',
            payment: { amountCr: 4800, everyDays: 30, nextDueDay: { year: 1105, day: 40 } },
        },
    });
    assert.equal(CampaignRecord.safeParse(vessel).success, true);
    assert.equal(CampaignRecord.safeParse({
        ...vessel,
        status: { ...vessel.status, fuelMark: 'corsair' },
    }).success, false);
    const view = playersView({
        records: [vessel, record(3, 'person', true), record(4, 'person', false)],
        links: [],
        journal: [],
        settings: null,
        clock: null,
    });
    const shown = view.records.find((row) => row.id === ship);
    assert.deepEqual(shown.status.owners, [
        { holder: { kind: 'record', id: keptId }, shares: 50 },
        { holder: 'party', shares: 25 },
    ]);
    assert.equal(shown.status.fuelTons, 31);
    assert.equal(shown.status.payment.amountCr, 4800);
    assert.equal(Object.hasOwn(shown.status, 'fuelMark'), false);
    assert.equal(JSON.stringify(shown.status).includes('naval'), false);
    assert.equal(JSON.stringify(shown.status).includes(hid), false);
});

test('a players read with rev and provenance put back parses as a campaign page', () => {
    const { read } = packFixture();
    const view = playersView(read);
    const parsed = CampaignPage.safeParse(asPage(view));
    assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues[0]));
    const hid = rid('cr_', 1);
    const ship = rid('cr_', 2);
    const pc = rid('cr_', 3);
    const refpc = rid('cr_', 4);
    const probe = playersView({
        records: [
            record(1, 'place', false, { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' } }),
            record(2, 'vessel', true, {
                status: {
                    track: [{
                        from: { kind: 'system', hexKey: 'Spinward_Marches/1912' },
                        to: { kind: 'record', id: hid },
                        departs: 1,
                        arrives: 2,
                        mode: 'jump',
                    }],
                    cargo: [{ itemId: hid, label: 'crate', tons: 1 }],
                },
            }),
            record(3, 'person', true),
            record(4, 'person', false),
        ],
        links: [],
        journal: [],
        settings: {
            party: {
                vesselIds: [ship],
                aboard: { [pc]: ship, [refpc]: ship },
                memberIds: [pc, refpc],
                anchor: { kind: 'record', id: hid },
            },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
            rev: 3,
        },
        clock: { days: 10, rev: 2 },
    });
    const probePage = CampaignPage.safeParse(asPage(probe));
    assert.equal(probePage.success, true, probePage.success ? '' : JSON.stringify(probePage.error.issues[0]));
});

test("a link's own visibility is not read; the rule is both ends", () => {
    const from = record(1, 'person', true);
    const to = record(2, 'organization', true);
    const hidden = record(3, 'organization', false);
    const link = (n, end, visibility) => ({
        id: rid('cl_', n),
        from: from.id,
        to: end,
        kind: 'member',
        role: '',
        order: 0,
        since: null,
        until: null,
        notes: '',
        visibility,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
    });
    const view = playersView({
        records: [from, to, hidden],
        links: [link(1, to.id, 'referee'), link(2, to.id, 'players'), link(3, hidden.id, 'players')],
        journal: [],
        settings: null,
        clock: null,
    });
    assert.deepEqual(view.links.map((row) => row.id), [rid('cl_', 1), rid('cl_', 2)]);
});

test('a hash written in a body does not open an object', () => {
    const pasted = 'ab'.repeat(32);
    const image = 'cd'.repeat(32);
    const thumb = 'ef'.repeat(32);
    const person = record(1, 'person', true, {
        details: pasted,
        images: [{ hash: image, thumbHash: thumb, width: 8, height: 8, bytes: 8 }],
    });
    const note = entry(1, 'note', true, { body: pasted, images: null });
    const view = playersView({
        records: [person],
        links: [],
        journal: [note],
        settings: null,
        clock: null,
    });
    assert.equal(view.records[0].details, pasted);
    assert.deepEqual(playersObjectHashes(view), [image, thumb].sort());
});

test('only own notes carry rev, and a note names its author', () => {
    const mine = entry(1, 'note', true, { authorId: 'user-m1', rev: 7 });
    const theirs = entry(2, 'note', true, { authorId: 'user-m2', rev: 3 });
    const unsigned = entry(3, 'note', true, { rev: 9 });
    const missing = entry(4, 'note', true, { authorId: 'user-x', rev: 2 });
    const view = playersView({
        records: [],
        links: [],
        journal: [mine, theirs, unsigned, missing],
        settings: null,
        clock: null,
    }, {
        userId: 'user-m1',
        handles: { 'user-m1': 'ada', 'user-m2': 'bea' },
    });
    const byId = Object.fromEntries(view.journal.map((row) => [row.id, row]));
    assert.equal(byId[mine.id].rev, 7);
    assert.equal(byId[mine.id].authorName, 'ada');
    assert.equal(Object.prototype.hasOwnProperty.call(byId[mine.id], 'authorId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(byId[theirs.id], 'rev'), false);
    assert.equal(byId[theirs.id].authorName, 'bea');
    assert.equal(Object.prototype.hasOwnProperty.call(byId[unsigned.id], 'rev'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(byId[unsigned.id], 'authorName'), false);
    assert.equal(byId[missing.id].authorName, '');
    assert.equal(Object.prototype.hasOwnProperty.call(byId[missing.id], 'rev'), false);
    const raw = JSON.stringify(view);
    assert.equal(raw.includes('user-m1'), false);
    assert.equal(raw.includes('user-m2'), false);
    assert.equal(hasOwn(view.records, 'rev'), false);
    assert.equal(hasOwn(view.links, 'rev'), false);
    assert.equal(hasOwn(view.settings, 'rev'), false);
});

test('a referee block is absent for players, and an unclosed one takes the rest of the field', () => {
    const outside = 'The port is open.';
    const inside = 'The password is nightfall.';
    const hidden = record(9, 'person', false);
    const closed = outside + '\n:::referee\n' + inside + ' ' + hidden.id + '\n:::\nStill ' + outside;
    const unclosed = outside + '\n:::referee\n' + inside + '\nStill ' + outside;
    const person = record(1, 'person', true, { details: closed, summary: closed, playerNotes: closed, sheet: { line: closed } });
    const open = record(2, 'person', true, { details: unclosed });
    const note = entry(1, 'note', true, { title: closed, body: closed });
    const openNote = entry(2, 'note', true, { body: unclosed });
    const view = playersView({
        records: [person, hidden, open],
        links: [],
        journal: [note, openNote],
        settings: null,
        clock: null,
    });
    const raw = JSON.stringify(view);
    assert.equal(raw.includes(inside), false);
    assert.equal(raw.includes(hidden.id), false);
    assert.equal(raw.includes(':::referee'), false);
    assert.equal(raw.includes('\n:::'), false);
    const shown = view.records.find((row) => row.id === person.id);
    const dropped = view.records.find((row) => row.id === open.id);
    assert.ok(shown);
    assert.ok(dropped);
    assert.match(shown.details, /The port is open\./);
    assert.match(shown.details, /Still The port is open\./);
    assert.match(shown.summary, /Still The port is open\./);
    assert.match(shown.playerNotes, /Still The port is open\./);
    assert.match(shown.sheet.line, /Still The port is open\./);
    assert.equal(dropped.details.includes('Still'), false);
    assert.match(dropped.details, /The port is open\./);
    const keptNote = view.journal.find((row) => row.id === note.id);
    const lostNote = view.journal.find((row) => row.id === openNote.id);
    assert.match(keptNote.title, /Still The port is open\./);
    assert.match(keptNote.body, /Still The port is open\./);
    assert.equal(lostNote.body.includes(inside), false);
    assert.equal(lostNote.body.includes('Still'), false);
    const inline = record(3, 'person', true, { details: 'Say :::referee in a sentence. ' + outside });
    const inlineView = playersView({ records: [inline], links: [], journal: [], settings: null, clock: null });
    assert.match(inlineView.records[0].details, /Say :::referee in a sentence/);
    assert.match(inlineView.records[0].details, /The port is open\./);
});

test('a referee block with CR or CRLF breaks is absent, and a bare id matches in any case', () => {
    const outside = 'The port is open.';
    const inside = 'The password is nightfall.';
    const hidden = record(9, 'person', false);
    const upper = hidden.id.toUpperCase();
    const cr = outside + '\r:::referee\r' + inside + '\r:::\rStill ' + outside;
    const crlf = outside + '\r\n:::referee\r\n' + inside + '\r\n:::\r\nStill ' + outside;
    const person = record(1, 'person', true, {
        details: cr,
        summary: crlf,
        playerNotes: 'See ' + upper + ' in the margin.',
    });
    const view = playersView({
        records: [person, hidden],
        links: [],
        journal: [],
        settings: null,
        clock: null,
    });
    const raw = JSON.stringify(view);
    assert.equal(raw.includes(inside), false);
    assert.equal(raw.includes(':::referee'), false);
    assert.equal(raw.includes(hidden.id), false);
    assert.equal(raw.includes(upper), false);
    const shown = view.records.find((row) => row.id === person.id);
    assert.ok(shown);
    assert.match(shown.details, /Still The port is open\./);
    assert.match(shown.summary, /Still The port is open\./);
    assert.match(shown.playerNotes, /See a record in the margin\./);
});
