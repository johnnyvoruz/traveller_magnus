/**
 * P2b1 pure cases from reports/x_players_review.md §5.
 * Case 27 is the log mask (built in B4). Case 29 is the per-player note guard.
 * The assertions are the contract. Do not weaken them to go green.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyCampaignChanges, CampaignRefusal, installCampaignSchema, readPlayersCampaign } from '../../apps/api/src/universe/campaign.ts';
import { loggedRoute } from '../../apps/api/src/http.ts';

const NOW = '2026-10-04T00:00:00.000Z';
const MEMBER = 'player-m1';
const NOTE_CAP = 65_535;
const NOTE_SENTENCE = 'You have 65,535 notes in this campaign, the most one player can keep.';

function jid(n) {
    return `cj_00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function entry(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'A note',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'players',
        visibility: 'players',
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

test('the request log masks join and claim tokens', () => {
    const join = JSON.stringify({ route: loggedRoute('/join/abc') });
    const claim = JSON.stringify({ route: loggedRoute('/claim/abc') });
    assert.equal(join.includes('/join/<token>'), true);
    assert.equal(claim.includes('/claim/<token>'), true);
    assert.equal(join.includes('abc'), false);
    assert.equal(claim.includes('abc'), false);
    const apiJoin = JSON.stringify({ route: loggedRoute('/api/join/abc') });
    assert.equal(loggedRoute('/api/join'), '/api/join/<token>');
    assert.equal(apiJoin.includes('/api/join/<token>'), true);
    assert.equal(apiJoin.includes('abc'), false);
});

test("a member's 65536th live note is refused", () => {
    const { db, sql } = open();
    const columns = db.prepare('PRAGMA table_info(campaign_journal)').all().map((row) => row.name);
    assert.equal(columns.includes('author_id'), true, 'a player note is counted by campaign_journal.author_id');
    const insert = db.prepare(`INSERT INTO campaign_journal (
        id, kind, title, body, when_json, real_date, sequence, author, visibility,
        anchor, mentions, rev, seq, created_at, updated_at, deleted, author_id
    ) VALUES (?, 'note', 'n', '', NULL, NULL, NULL, 'players', 'players', NULL, '[]', 1, ?, ?, ?, 0, ?)`);
    db.exec('BEGIN');
    for (let n = 1; n <= NOTE_CAP; n += 1) insert.run(jid(n), n, NOW, NOW, MEMBER);
    db.exec('COMMIT');
    const over = refusal(() => applyCampaignChanges(sql, {
        journal: [entry(jid(NOTE_CAP + 1))],
    }, NOW, false, { userId: MEMBER }));
    assert.ok(over instanceof CampaignRefusal);
    assert.equal(over.code, 'too_large');
    assert.equal(over.message, NOTE_SENTENCE);
    db.prepare('UPDATE campaign_journal SET deleted = 1 WHERE id = ?').run(jid(1));
    const again = applyCampaignChanges(sql, {
        journal: [entry(jid(NOTE_CAP + 1))],
    }, NOW, false, { userId: MEMBER });
    assert.equal(again.applied.length, 1);
    assert.equal(again.conflicts.length, 0);
});

const PLACE = 'cr_00000000-0000-4000-8000-000000000010';
const HIDDEN = 'cr_00000000-0000-4000-8000-000000000011';

function record(id, over = {}) {
    return {
        id,
        type: 'place',
        kind: '',
        name: 'Port',
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

test('a member writes only their own players note', () => {
    const { db, sql } = open();
    applyCampaignChanges(sql, {
        records: [record(PLACE, { visibility: 'players' }), record(HIDDEN)],
    }, NOW);
    const made = applyCampaignChanges(sql, { journal: [entry(jid(1))] }, NOW, false, { userId: MEMBER });
    assert.equal(made.applied.length, 1);
    assert.equal(db.prepare('SELECT author_id FROM campaign_journal WHERE id = ?').get(jid(1)).author_id, MEMBER);
    const stolen = refusal(() => applyCampaignChanges(sql, {
        journal: [entry(jid(1), { title: 'Stolen', baseRev: 0 })],
    }, NOW, false, { userId: 'other-player' }));
    assert.ok(stolen instanceof CampaignRefusal);
    assert.equal(stolen.code, 'forbidden');
    assert.equal(stolen.message, 'You cannot change that.');
    const session = refusal(() => applyCampaignChanges(sql, {
        journal: [entry(jid(2), { kind: 'session', sequence: 1 })],
    }, NOW, false, { userId: MEMBER }));
    assert.equal(session.code, 'forbidden');
    const hidden = refusal(() => applyCampaignChanges(sql, {
        journal: [entry(jid(3), { anchor: { kind: 'record', id: HIDDEN } })],
    }, NOW, false, { userId: MEMBER }));
    const missing = refusal(() => applyCampaignChanges(sql, {
        journal: [entry(jid(4), { anchor: { kind: 'record', id: 'cr_00000000-0000-4000-8000-000000000099' } })],
    }, NOW, false, { userId: MEMBER }));
    assert.equal(hidden.code, 'validation');
    assert.equal(missing.code, 'validation');
    assert.equal(hidden.message, missing.message);
    assert.equal(hidden.message, 'Invalid request.');
    const placed = applyCampaignChanges(sql, {
        journal: [entry(jid(5), { anchor: { kind: 'record', id: PLACE } })],
    }, NOW, false, { userId: MEMBER });
    assert.equal(placed.applied.length, 1);
    const system = applyCampaignChanges(sql, {
        journal: [entry(jid(6), { anchor: { kind: 'system', hexKey: 'spin/1910' } })],
    }, NOW, false, { userId: MEMBER });
    assert.equal(system.applied.length, 1);
});

test('a member read projects the live set and keeps visible when seq moves', () => {
    const { sql } = open();
    applyCampaignChanges(sql, {
        records: [record(PLACE, { visibility: 'players', name: 'Port' }), record(HIDDEN, { name: 'Vault' })],
    }, NOW);
    applyCampaignChanges(sql, { journal: [entry(jid(1))] }, NOW, false, { userId: MEMBER });
    const page = readPlayersCampaign(sql, 0, 1000, { userId: MEMBER, handles: { [MEMBER]: 'mara' } });
    assert.equal(page.records.length, 1);
    assert.equal(page.records[0].id, PLACE);
    assert.equal(page.records[0].rev, undefined);
    const note = page.journal.find((row) => row.id === jid(1));
    assert.equal(note.authorName, 'mara');
    assert.equal(note.rev, 1);
    assert.equal(page.visible.journal.includes(jid(1)), true);
    assert.equal(page.visible.records.includes(HIDDEN), false);
    const quiet = readPlayersCampaign(sql, page.seq, 1000, { userId: MEMBER, handles: {} });
    assert.equal(quiet.journal.length, 0);
    assert.equal(quiet.visible, undefined);
    applyCampaignChanges(sql, { records: [record(HIDDEN, { name: 'Vault', baseRev: 1, visibility: 'referee' })] }, NOW);
    const climbed = readPlayersCampaign(sql, page.seq, 1000, { userId: MEMBER, handles: { [MEMBER]: 'mara' } });
    assert.deepEqual(climbed.records, []);
    assert.equal(climbed.visible.records.includes(PLACE), true);
    assert.equal(climbed.visible.records.includes(HIDDEN), false);
    assert.equal(climbed.seq > page.seq, true);
});
