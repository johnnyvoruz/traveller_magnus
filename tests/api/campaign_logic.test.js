import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
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

