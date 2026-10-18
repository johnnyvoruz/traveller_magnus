import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mentionsOf } from '@voyage/shared';
import { applyCampaignChanges, CampaignRefusal, installCampaignSchema, readCampaign } from '../../apps/api/src/universe/campaign.ts';

const NOW = '2026-10-04T00:00:00.000Z';
const A = 'cr_00000000-0000-4000-8000-000000000001';
const B = 'cr_00000000-0000-4000-8000-000000000002';
const C = 'cr_00000000-0000-4000-8000-000000000003';
const LINK = 'cl_00000000-0000-4000-8000-000000000001';

function rid(n) {
    return `cr_00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function lid(n) {
    return `cl_00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

const J = 'cj_00000000-0000-4000-8000-000000000001';
const J2 = 'cj_00000000-0000-4000-8000-000000000002';

function jid(n) {
    return `cj_00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function entry(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'At the starport',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: NOW,
        updatedAt: NOW,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function record(id, over = {}) {
    return {
        id,
        type: 'person',
        kind: '',
        name: 'Voss',
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
        rev: 0,
        createdAt: NOW,
        updatedAt: NOW,
        deleted: false,
        provenance: null,
        baseRev: 0,
        ...over,
    };
}

function link(id, from, to, over = {}) {
    return {
        id,
        from,
        to,
        kind: 'contact',
        role: '',
        order: 0,
        since: null,
        until: null,
        notes: '',
        visibility: 'referee',
        rev: 0,
        createdAt: NOW,
        updatedAt: NOW,
        deleted: false,
        provenance: null,
        baseRev: 0,
        ...over,
    };
}

function open() {
    const db = new DatabaseSync(':memory:');
    const sql = {
        exec(query, ...params) {
            const statement = query.trim();
            if (/^(begin|commit|rollback)\b/i.test(statement)) {
                db.exec(statement);
                return [];
            }
            const prepared = db.prepare(statement);
            if (/^(select|with|pragma)\b/i.test(statement)) return prepared.all(...params);
            prepared.run(...params);
            return [];
        },
        transaction(fn) {
            db.exec('BEGIN');
            try {
                const result = fn();
                db.exec('COMMIT');
                return result;
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
    };
    installCampaignSchema(sql);
    return { db, sql };
}

function refusal(fn) {
    try {
        fn();
    } catch (err) {
        return err;
    }
    return null;
}

test('campaign changes create, conflict, tombstone, restore, and page', () => {
    const { db, sql } = open();
    const copied = { mode: 'copy', universeId: 'uni', recordId: A, rev: 1, at: NOW };
    const created = applyCampaignChanges(sql, {
        records: [record(A, { name: 'Voss', provenance: copied }), record(B, { name: 'Ada', type: 'person' })],
        links: [link(LINK, A, B, { provenance: copied })],
    }, NOW);
    assert.equal(created.applied.length, 3);
    assert.deepEqual(created.conflicts, []);
    assert.equal(created.applied[0].rev, 1);

    const edited = applyCampaignChanges(sql, {
        records: [record(A, { name: 'Voss Reed', baseRev: 1, rev: 1, provenance: copied })],
    }, NOW);
    assert.equal(edited.applied[0].rev, 2);
    assert.equal(edited.conflicts.length, 0);

    const stale = applyCampaignChanges(sql, {
        records: [record(A, { name: 'Old', baseRev: 1, rev: 1 })],
    }, NOW);
    assert.equal(stale.applied.length, 0);
    assert.equal(stale.conflicts[0].id, A);
    assert.equal(stale.conflicts[0].current.name, 'Voss Reed');
    assert.equal(stale.conflicts[0].current.rev, 2);

    const removed = applyCampaignChanges(sql, {
        records: [{ id: A, baseRev: 2, deleted: true }],
    }, NOW);
    assert.deepEqual(removed.applied.map((row) => row.id).sort(), [A, LINK].sort());
    const hidden = readCampaign(sql, 0, 100);
    const tombstone = hidden.records.find((row) => row.id === A);
    const tombLink = hidden.links.find((row) => row.id === LINK);
    assert.equal(tombstone.deleted, true);
    assert.equal(tombLink.deleted, true);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM campaign_records`).get().n, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM campaign_links`).get().n, 1);
    assert.deepEqual(JSON.parse(db.prepare(`SELECT provenance FROM campaign_records WHERE id = ?`).get(A).provenance), copied);
    assert.equal(db.prepare(`SELECT provenance FROM campaign_records WHERE id = ?`).get(B).provenance, null);
    assert.deepEqual(JSON.parse(db.prepare(`SELECT provenance FROM campaign_links WHERE id = ?`).get(LINK).provenance), copied);
    assert.deepEqual(tombstone.provenance, copied);

    const restored = applyCampaignChanges(sql, {
        records: [record(A, { name: 'Voss Reed', baseRev: tombstone.rev, rev: tombstone.rev, deleted: false, provenance: copied })],
        links: [link(LINK, A, B, { baseRev: tombLink.rev, rev: tombLink.rev, deleted: false, provenance: copied })],
    }, NOW);
    assert.equal(restored.conflicts.length, 0);
    assert.equal(restored.applied.length, 2);
    const back = readCampaign(sql, 0, 100);
    assert.equal(back.records.find((row) => row.id === A).deleted, false);
    assert.equal(back.links.find((row) => row.id === LINK).deleted, false);

    const third = applyCampaignChanges(sql, { records: [record(C, { name: 'Cee' })] }, NOW);
    assert.equal(third.applied.length, 1);
    const first = readCampaign(sql, 0, 2);
    assert.equal(first.records.length + first.links.length, 2);
    assert.equal(first.done, false);
    const second = readCampaign(sql, first.seq, 2);
    assert.equal(second.records.length + second.links.length, 2);
    assert.equal(second.done, true);
    const seen = new Set([...first.records, ...first.links, ...second.records, ...second.links].map((row) => row.id));
    assert.equal(seen.size, 4);
});

test('the campaign clock is set, edited, and a stale baseRev conflicts', () => {
    const { db, sql } = open();
    const empty = readCampaign(sql, 0, 10);
    assert.equal(empty.clock, null);

    const days = 403326.5;
    const created = applyCampaignChanges(sql, { clock: { days, baseRev: 0 } }, NOW);
    assert.deepEqual(created.conflicts, []);
    assert.equal(created.applied.length, 1);
    assert.deepEqual(created.applied[0], { table: 'clock', id: 'campaignTime', rev: 1, seq: created.applied[0].seq });
    const page = readCampaign(sql, 999, 1);
    assert.deepEqual(page.clock, { days, rev: 1 });
    assert.equal(page.records.length, 0);

    const edited = applyCampaignChanges(sql, { clock: { days: days + 7, baseRev: 1 } }, NOW);
    assert.equal(edited.conflicts.length, 0);
    assert.equal(edited.applied[0].rev, 2);
    assert.equal(edited.applied[0].table, 'clock');
    const moved = readCampaign(sql, 0, 10);
    assert.deepEqual(moved.clock, { days: days + 7, rev: 2 });

    const stale = applyCampaignChanges(sql, { clock: { days: 1, baseRev: 1 } }, NOW);
    assert.equal(stale.applied.length, 0);
    assert.equal(stale.conflicts.length, 1);
    assert.equal(stale.conflicts[0].table, 'clock');
    assert.equal(stale.conflicts[0].id, 'campaignTime');
    assert.deepEqual(stale.conflicts[0].current, { days: days + 7, rev: 2 });
    assert.deepEqual(readCampaign(sql, 0, 10).clock, { days: days + 7, rev: 2 });

    const beforeAny = open();
    const missing = applyCampaignChanges(beforeAny.sql, { clock: { days: 3, baseRev: 2 } }, NOW);
    assert.equal(missing.applied.length, 0);
    assert.deepEqual(missing.conflicts, [{ table: 'clock', id: 'campaignTime', current: null }]);
    assert.equal(readCampaign(beforeAny.sql, 0, 10).clock, null);

    const history = db.prepare(`SELECT kind, rev, at, action, payload_hash FROM list_history ORDER BY rev`).all();
    assert.equal(history.length, 2);
    assert.deepEqual(history.map((row) => row.rev), [1, 2]);
    for (const row of history) {
        assert.equal(row.kind, 'campaignTime');
        assert.equal(row.at, NOW);
        assert.equal(row.action, 'set');
        const payload = db.prepare(`SELECT payload FROM lists WHERE kind = 'campaignTime'`).get();
        const stored = JSON.parse(payload.payload);
        if (row.rev === stored.rev) {
            assert.equal(row.payload_hash, createHash('sha256').update(payload.payload).digest('hex'));
        }
    }
    const firstPayload = JSON.stringify({ days, rev: 1 });
    assert.equal(history[0].payload_hash, createHash('sha256').update(firstPayload).digest('hex'));
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM list_history`).get().n, 2);
});

test('a member link that cycles an organization is refused', () => {
    const { db, sql } = open();
    applyCampaignChanges(sql, {
        records: [
            record(A, { name: 'House A', type: 'organization' }),
            record(B, { name: 'House B', type: 'organization' }),
        ],
        links: [link(LINK, B, A, { kind: 'member' })],
    }, NOW);
    const err = refusal(() => applyCampaignChanges(sql, {
        links: [link(lid(2), A, B, { kind: 'member' })],
    }, NOW));
    assert.ok(err instanceof CampaignRefusal);
    assert.equal(err.message, 'An organization cannot be its own ancestor.');
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM campaign_links`).get().n, 1);
});

test('campaign limits refuse the value', () => {
    const { sql } = open();
    const longName = refusal(() => applyCampaignChanges(sql, {
        records: [record(A, { name: 'n'.repeat(201) })],
    }, NOW));
    assert.equal(longName.code, 'validation');
    const longSummary = refusal(() => applyCampaignChanges(sql, {
        records: [record(A, { summary: 's'.repeat(501) })],
    }, NOW));
    assert.equal(longSummary.code, 'validation');
    const longDetails = refusal(() => applyCampaignChanges(sql, {
        records: [record(A, { details: 'd'.repeat(20_001) })],
    }, NOW));
    assert.equal(longDetails.code, 'validation');
    const manyTags = refusal(() => applyCampaignChanges(sql, {
        records: [record(A, { tags: Array.from({ length: 33 }, () => 'tag') })],
    }, NOW));
    assert.equal(manyTags.code, 'validation');
    const longTag = refusal(() => applyCampaignChanges(sql, {
        records: [record(A, { tags: ['t'.repeat(41)] })],
    }, NOW));
    assert.equal(longTag.code, 'validation');
    const tooManyRows = refusal(() => applyCampaignChanges(sql, {
        records: Array.from({ length: 201 }, (_, index) => record(rid(index + 1))),
    }, NOW));
    assert.equal(tooManyRows.code, 'too_large');
    const bulky = refusal(() => applyCampaignChanges(sql, {
        records: Array.from({ length: 60 }, (_, index) => record(rid(index + 1), { details: 'd'.repeat(20_000) })),
    }, NOW));
    assert.equal(bulky.code, 'too_large');
});

test('live record and link caps are too_large', () => {
    const { db, sql } = open();
    const insertRecord = db.prepare(`INSERT INTO campaign_records (
        id, type, kind, name, summary, details, tags, anchor, when_json, visibility,
        player_notes, sheet, status, images, provenance, rev, seq, created_at, updated_at, deleted
    ) VALUES (?, 'note', '', 'n', '', '', '[]', NULL, NULL, 'referee', NULL, NULL, NULL, NULL, NULL, 1, ?, ?, ?, 0)`);
    db.exec('BEGIN');
    for (let n = 1; n <= 20_000; n += 1) insertRecord.run(rid(n), n, NOW, NOW);
    db.exec('COMMIT');
    const overRecords = refusal(() => applyCampaignChanges(sql, { records: [record(rid(20_001))] }, NOW));
    assert.equal(overRecords.code, 'too_large');

    const { db: linksDb, sql: linksSql } = open();
    linksDb.prepare(`INSERT INTO campaign_records (
        id, type, kind, name, summary, details, tags, anchor, when_json, visibility,
        player_notes, sheet, status, images, provenance, rev, seq, created_at, updated_at, deleted
    ) VALUES (?, 'person', '', 'n', '', '', '[]', NULL, NULL, 'referee', NULL, NULL, NULL, NULL, NULL, 1, ?, ?, ?, 0)`).run(A, 1, NOW, NOW);
    linksDb.prepare(`INSERT INTO campaign_records (
        id, type, kind, name, summary, details, tags, anchor, when_json, visibility,
        player_notes, sheet, status, images, provenance, rev, seq, created_at, updated_at, deleted
    ) VALUES (?, 'person', '', 'n', '', '', '[]', NULL, NULL, 'referee', NULL, NULL, NULL, NULL, NULL, 1, ?, ?, ?, 0)`).run(B, 2, NOW, NOW);
    const insertLink = linksDb.prepare(`INSERT INTO campaign_links (
        id, from_id, to_id, kind, role, link_order, since_json, until_json, notes, visibility,
        provenance, rev, seq, created_at, updated_at, deleted
    ) VALUES (?, ?, ?, 'contact', '', 0, NULL, NULL, '', 'referee', NULL, 1, ?, ?, ?, 0)`);
    linksDb.exec('BEGIN');
    for (let n = 1; n <= 60_000; n += 1) insertLink.run(lid(n), A, B, n + 2, NOW, NOW);
    linksDb.exec('COMMIT');
    const overLinks = refusal(() => applyCampaignChanges(linksSql, { links: [link(lid(60_001), A, B)] }, NOW));
    assert.equal(overLinks.code, 'too_large');
});

test('journal entries insert, edit, conflict, tombstone, and restore', () => {
    const { db, sql } = open();
    const created = applyCampaignChanges(sql, { journal: [entry(J)] }, NOW);
    assert.deepEqual(created.conflicts, []);
    assert.equal(created.applied.length, 1);
    assert.equal(created.applied[0].table, 'journal');
    assert.equal(created.applied[0].id, J);
    assert.equal(created.applied[0].rev, 1);
    const page = readCampaign(sql, 0, 10);
    assert.equal(page.journal.length, 1);
    assert.equal(page.journal[0].title, 'At the starport');
    assert.equal(page.journal[0].rev, 1);
    assert.equal(page.journal[0].deleted, false);
    assert.equal(page.journal[0].sequence, null);
    assert.deepEqual(page.journal[0].mentions, []);

    const edited = applyCampaignChanges(sql, {
        journal: [entry(J, { title: 'Edited', baseRev: 1, rev: 1 })],
    }, NOW);
    assert.equal(edited.conflicts.length, 0);
    assert.equal(edited.applied[0].table, 'journal');
    assert.equal(edited.applied[0].rev, 2);

    const stale = applyCampaignChanges(sql, {
        journal: [entry(J, { title: 'Old', baseRev: 1, rev: 1 })],
    }, NOW);
    assert.equal(stale.applied.length, 0);
    assert.equal(stale.conflicts.length, 1);
    assert.equal(stale.conflicts[0].table, 'journal');
    assert.equal(stale.conflicts[0].id, J);
    assert.equal(stale.conflicts[0].current.title, 'Edited');
    assert.equal(stale.conflicts[0].current.rev, 2);
    assert.equal(stale.conflicts[0].current.deleted, false);

    const removed = applyCampaignChanges(sql, {
        journal: [{ id: J, baseRev: 2, deleted: true }],
    }, NOW);
    assert.equal(removed.applied.length, 1);
    assert.equal(removed.applied[0].table, 'journal');
    assert.equal(removed.applied[0].rev, 3);
    const hidden = readCampaign(sql, 0, 10);
    const tomb = hidden.journal.find((row) => row.id === J);
    assert.equal(tomb.deleted, true);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM campaign_journal`).get().n, 1);

    const restored = applyCampaignChanges(sql, {
        journal: [entry(J, { title: 'Edited', baseRev: tomb.rev, rev: tomb.rev, deleted: false })],
    }, NOW);
    assert.equal(restored.conflicts.length, 0);
    assert.equal(restored.applied[0].rev, tomb.rev + 1);
    assert.equal(restored.applied[0].table, 'journal');
    const back = readCampaign(sql, 0, 10);
    const live = back.journal.find((row) => row.id === J);
    assert.equal(live.deleted, false);
    assert.equal(live.title, 'Edited');
});

test('a session with no sequence is validation', () => {
    const { sql } = open();
    const err = refusal(() => applyCampaignChanges(sql, {
        journal: [entry(J, { kind: 'session', sequence: null })],
    }, NOW));
    assert.ok(err instanceof CampaignRefusal);
    assert.equal(err.code, 'validation');
    assert.equal(err.message, 'That request could not be read. Try again.');
});

test('the 20001st live journal entry is too_large', () => {
    const { db, sql } = open();
    const insert = db.prepare(`INSERT INTO campaign_journal (
        id, kind, title, body, when_json, real_date, sequence, author, visibility,
        anchor, mentions, rev, seq, created_at, updated_at, deleted
    ) VALUES (?, 'note', 'n', '', NULL, NULL, NULL, 'referee', 'referee', NULL, '[]', 1, ?, ?, ?, 0)`);
    db.exec('BEGIN');
    for (let n = 1; n <= 20_000; n += 1) insert.run(jid(n), n, NOW, NOW);
    db.exec('COMMIT');
    const over = refusal(() => applyCampaignChanges(sql, { journal: [entry(jid(20_001))] }, NOW));
    assert.ok(over instanceof CampaignRefusal);
    assert.equal(over.code, 'too_large');
    assert.equal(over.message, '20,000 live entries per universe.');
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM campaign_journal WHERE deleted = 0`).get().n, 20_000);
});

test('stored journal mentions are mentionsOf the body', () => {
    const { db, sql } = open();
    const body = `Met [[${A}|Voss]] at [[hex:Spinward_Marches/1910|Regina]] and [[${A}|again]].`;
    const forged = [B];
    const created = applyCampaignChanges(sql, {
        journal: [entry(J, { body, mentions: forged })],
    }, NOW);
    assert.equal(created.conflicts.length, 0);
    const stored = JSON.parse(db.prepare(`SELECT mentions FROM campaign_journal WHERE id = ?`).get(J).mentions);
    assert.deepEqual(stored, mentionsOf(body));
    assert.deepEqual(readCampaign(sql, 0, 10).journal[0].mentions, mentionsOf(body));

    const nextBody = `Only [[hex:Spinward_Marches/1910|Regina]].`;
    const edited = applyCampaignChanges(sql, {
        journal: [entry(J, { body: nextBody, mentions: forged, baseRev: 1, rev: 1 })],
    }, NOW);
    assert.equal(edited.applied[0].rev, 2);
    const again = JSON.parse(db.prepare(`SELECT mentions FROM campaign_journal WHERE id = ?`).get(J).mentions);
    assert.deepEqual(again, mentionsOf(nextBody));
});

test('journal pages merge with records and links, and an empty universe returns journal []', () => {
    const bare = open();
    assert.deepEqual(readCampaign(bare.sql, 0, 10).journal, []);

    const { sql } = open();
    applyCampaignChanges(sql, { records: [record(A, { name: 'Voss' })] }, NOW);
    applyCampaignChanges(sql, { journal: [entry(J, { title: 'One' })] }, NOW);
    applyCampaignChanges(sql, { records: [record(B, { name: 'Ada' })] }, NOW);
    applyCampaignChanges(sql, { links: [link(LINK, A, B)] }, NOW);
    applyCampaignChanges(sql, { journal: [entry(J2, { title: 'Two' })] }, NOW);

    const first = readCampaign(sql, 0, 2);
    assert.equal(first.done, false);
    assert.deepEqual(first.records.map((row) => row.id), [A]);
    assert.deepEqual(first.journal.map((row) => row.id), [J]);
    assert.deepEqual(first.links, []);

    const second = readCampaign(sql, first.seq, 2);
    assert.equal(second.done, false);
    assert.ok(second.seq > first.seq);
    assert.deepEqual(second.records.map((row) => row.id), [B]);
    assert.deepEqual(second.links.map((row) => row.id), [LINK]);
    assert.deepEqual(second.journal, []);

    const third = readCampaign(sql, second.seq, 2);
    assert.equal(third.done, true);
    assert.deepEqual(third.journal.map((row) => row.id), [J2]);
    assert.deepEqual(third.records, []);
    assert.deepEqual(third.links, []);

    const whole = readCampaign(sql, 0, 100);
    assert.deepEqual(whole.records.map((row) => row.id), [A, B]);
    assert.deepEqual(whole.links.map((row) => row.id), [LINK]);
    assert.deepEqual(whole.journal.map((row) => row.id), [J, J2]);
    assert.equal(whole.done, true);
});

test('deleting a record leaves a journal entry anchored to it', () => {
    const { db, sql } = open();
    applyCampaignChanges(sql, {
        records: [record(A), record(B, { anchor: { kind: 'record', id: A } })],
        journal: [entry(J, { anchor: { kind: 'record', id: A } })],
    }, NOW);
    const removed = applyCampaignChanges(sql, {
        records: [{ id: A, baseRev: 1, deleted: true }],
    }, NOW);
    assert.equal(removed.applied.some((row) => row.table === 'journal'), false);
    const page = readCampaign(sql, 0, 10);
    const anchored = page.records.find((row) => row.id === B);
    const note = page.journal.find((row) => row.id === J);
    assert.equal(page.records.find((row) => row.id === A).deleted, true);
    assert.equal(anchored.deleted, false);
    assert.deepEqual(anchored.anchor, { kind: 'record', id: A });
    assert.equal(note.deleted, false);
    assert.deepEqual(note.anchor, { kind: 'record', id: A });
    assert.equal(db.prepare(`SELECT deleted FROM campaign_journal WHERE id = ?`).get(J).deleted, 0);
});

function picture(letter) {
    const thumb = String.fromCharCode(letter.charCodeAt(0) + 1);
    return { hash: letter.repeat(64), thumbHash: thumb.repeat(64), width: 4, height: 4, bytes: 8 };
}

test('a journal entry keeps its images, and a patch that omits them leaves them', () => {
    const { sql } = open();
    const images = [picture('a'), picture('c')];
    const created = applyCampaignChanges(sql, { journal: [entry(J, { images })] }, NOW);
    assert.equal(created.conflicts.length, 0);
    const stored = readCampaign(sql, 0, 10).journal[0];
    assert.deepEqual(stored.images, images);
    const titled = applyCampaignChanges(sql, {
        journal: [entry(J, { title: 'Renamed', baseRev: stored.rev, rev: stored.rev })],
    }, NOW);
    assert.equal(titled.conflicts.length, 0);
    const kept = readCampaign(sql, 0, 10).journal.find((row) => row.id === J);
    assert.equal(kept.title, 'Renamed');
    assert.deepEqual(kept.images, images);
    const cleared = applyCampaignChanges(sql, {
        journal: [entry(J, { images: null, baseRev: kept.rev, rev: kept.rev })],
    }, NOW);
    assert.equal(cleared.conflicts.length, 0);
    assert.equal(readCampaign(sql, 0, 10).journal.find((row) => row.id === J).images, null);
    const again = open();
    const carried = { ...stored, baseRev: 0, rev: 0 };
    applyCampaignChanges(again.sql, { journal: [carried] }, NOW);
    assert.deepEqual(readCampaign(again.sql, 0, 10).journal[0].images, images);
    const bare = entry(J2);
    delete bare.images;
    applyCampaignChanges(sql, { journal: [bare] }, NOW);
    assert.equal(readCampaign(sql, 0, 10).journal.find((row) => row.id === J2).images, null);
    const over = refusal(() => applyCampaignChanges(sql, {
        journal: [entry(jid(9), { images: Array.from({ length: 13 }, () => picture('e')) })],
    }, NOW));
    assert.ok(over instanceof CampaignRefusal);
    assert.equal(over.code, 'validation');
    assert.equal(over.message, 'An entry can hold 12 images.');
});

test('an old journal table gains the images column and reads null', () => {
    const db = new DatabaseSync(':memory:');
    const sql = {
        exec(query, ...params) {
            const statement = query.trim();
            if (/^(begin|commit|rollback)\b/i.test(statement)) {
                db.exec(statement);
                return [];
            }
            const prepared = db.prepare(statement);
            if (/^(select|with|pragma)\b/i.test(statement)) return prepared.all(...params);
            prepared.run(...params);
            return [];
        },
        transaction(fn) {
            db.exec('BEGIN');
            try {
                const result = fn();
                db.exec('COMMIT');
                return result;
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
    };
    db.exec(`CREATE TABLE campaign_journal (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        when_json TEXT,
        real_date TEXT,
        sequence INTEGER,
        author TEXT NOT NULL,
        visibility TEXT NOT NULL,
        anchor TEXT,
        mentions TEXT NOT NULL,
        rev INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL
    )`);
    db.prepare(`INSERT INTO campaign_journal (
        id, kind, title, body, when_json, real_date, sequence, author, visibility,
        anchor, mentions, rev, seq, created_at, updated_at, deleted
    ) VALUES (?, 'note', 'Old', '', NULL, NULL, NULL, 'referee', 'referee', NULL, '[]', 1, 1, ?, ?, 0)`).run(J, NOW, NOW);
    installCampaignSchema(sql);
    const names = db.prepare(`SELECT name FROM pragma_table_info('campaign_journal')`).all().map((row) => row.name);
    assert.equal(names.includes('images'), true);
    const page = readCampaign(sql, 0, 10);
    assert.equal(page.journal[0].images, null);
    const saved = applyCampaignChanges(sql, {
        journal: [entry(J, { title: 'Old', baseRev: 1, rev: 1, images: [picture('a')] })],
    }, NOW);
    assert.equal(saved.conflicts.length, 0, JSON.stringify(saved));
    assert.deepEqual(readCampaign(sql, 0, 10).journal.find((row) => row.id === J).images, [picture('a')]);
});

test('an old journal table gains author_id and the owner read leaves it off', () => {
    const db = new DatabaseSync(':memory:');
    const sql = {
        exec(query, ...params) {
            const statement = query.trim();
            if (/^(begin|commit|rollback)\b/i.test(statement)) {
                db.exec(statement);
                return [];
            }
            const prepared = db.prepare(statement);
            if (/^(select|with|pragma)\b/i.test(statement)) return prepared.all(...params);
            prepared.run(...params);
            return [];
        },
        transaction(fn) {
            db.exec('BEGIN');
            try {
                const result = fn();
                db.exec('COMMIT');
                return result;
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
    };
    db.exec(`CREATE TABLE campaign_journal (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        when_json TEXT,
        real_date TEXT,
        sequence INTEGER,
        author TEXT NOT NULL,
        visibility TEXT NOT NULL,
        anchor TEXT,
        mentions TEXT NOT NULL,
        rev INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL
    )`);
    db.prepare(`INSERT INTO campaign_journal (
        id, kind, title, body, when_json, real_date, sequence, author, visibility,
        anchor, mentions, rev, seq, created_at, updated_at, deleted
    ) VALUES (?, 'note', 'Old', '', NULL, NULL, NULL, 'referee', 'referee', NULL, '[]', 1, 1, ?, ?, 0)`).run(J, NOW, NOW);
    installCampaignSchema(sql);
    const names = db.prepare(`SELECT name FROM pragma_table_info('campaign_journal')`).all().map((row) => row.name);
    assert.equal(names.includes('author_id'), true);
    assert.equal(names.includes('images'), true);
    const version = db.prepare(`SELECT value FROM meta WHERE key = 'schemaVersion'`).get();
    assert.equal(version.value, '3');
    db.prepare(`UPDATE campaign_journal SET author_id = ? WHERE id = ?`).run('user_player', J);
    const page = readCampaign(sql, 0, 10);
    assert.equal(page.journal[0].images, null);
    assert.equal('authorId' in page.journal[0], false);
    const clash = applyCampaignChanges(sql, {
        journal: [entry(J, { title: 'Old', baseRev: 0, rev: 0 })],
    }, NOW);
    assert.equal(clash.conflicts.length, 1);
    assert.equal('authorId' in clash.conflicts[0].current, false);
    const fresh = open();
    const created = fresh.db.prepare(`SELECT name FROM pragma_table_info('campaign_journal')`).all().map((row) => row.name);
    assert.equal(created.includes('author_id'), true);
    const made = applyCampaignChanges(fresh.sql, { journal: [entry(J2)] }, NOW);
    assert.equal(made.applied.length, 1);
    fresh.db.prepare(`UPDATE campaign_journal SET author_id = ? WHERE id = ?`).run('user_player', J2);
    const again = readCampaign(fresh.sql, 0, 10);
    assert.equal('authorId' in again.journal[0], false);
});

