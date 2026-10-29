import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
    applyCampaignChanges,
    CampaignRefusal,
    installCampaignSchema,
    parseJournalRead,
    readCampaign,
    readPlayersCampaign,
} from '../../apps/api/src/universe/campaign.ts';

const NOW = '2026-10-27T00:00:00.000Z';
const ENTRY = 'cj_00000000-0000-4000-8000-000000000001';
const REPLY = 'cj_00000000-0000-4000-8000-000000000002';
const NEST = 'cj_00000000-0000-4000-8000-000000000003';
const HIDDEN = 'cj_00000000-0000-4000-8000-000000000004';
const GONE = 'cj_00000000-0000-4000-8000-000000000009';
const LATE = 'cj_00000000-0000-4000-8000-000000000005';
const MEMBER = 'user-member';

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
    return { db, sql };
}

function note(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'At the starport',
        body: 'The berth is paid.',
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

function refusal(fn) {
    try {
        fn();
    } catch (err) {
        return err;
    }
    return null;
}

test('an older journal table gains parent and does not lose a column', () => {
    const { db, sql } = open();
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
        deleted INTEGER NOT NULL,
        images TEXT,
        author_id TEXT
    )`);
    installCampaignSchema(sql);
    const names = db.prepare(`SELECT name FROM pragma_table_info('campaign_journal')`).all().map((row) => row.name);
    assert.equal(names.includes('parent'), true);
    assert.equal(names.includes('author_id'), true);
    assert.equal(names.includes('images'), true);
    assert.equal(names.filter((name) => name === 'parent').length, 1);
});

test('a reply is a players note under a live entry', () => {
    const { sql } = open();
    installCampaignSchema(sql);
    applyCampaignChanges(sql, { journal: [note(ENTRY, { title: 'Briefing' })] }, NOW);
    applyCampaignChanges(sql, {
        journal: [note(REPLY, { parent: ENTRY, title: 'We saw it', body: 'Nora was there.' })],
    }, NOW, false, { userId: MEMBER });

    const poll = readCampaign(sql, 0, 10);
    assert.deepEqual(poll.journal.map((row) => row.id), [ENTRY]);
    assert.equal(poll.journal[0].parent, null);
    assert.equal(poll.journal[0].replies, 1);

    const replies = readCampaign(sql, 0, 10, false, { parent: ENTRY });
    assert.deepEqual(replies.records, []);
    assert.deepEqual(replies.links, []);
    assert.equal(replies.journal.length, 1);
    assert.equal(replies.journal[0].id, REPLY);
    assert.equal(replies.journal[0].parent, ENTRY);
    assert.equal(replies.journal[0].kind, 'note');
    assert.equal(replies.journal[0].author, 'players');
    assert.equal(replies.journal[0].visibility, 'players');
    assert.equal(replies.journal[0].replies, 0);
    assert.equal('authorId' in replies.journal[0], false);

    const member = readPlayersCampaign(sql, 0, 10, { userId: MEMBER, handles: { [MEMBER]: 'nora' } });
    assert.deepEqual(member.journal.map((row) => row.id), [ENTRY]);
    assert.equal(member.journal[0].replies, 1);
    assert.equal(member.visible.journal.includes(REPLY), true);

    const memberReplies = readPlayersCampaign(sql, 0, 10, { userId: MEMBER, handles: { [MEMBER]: 'nora' } }, ENTRY);
    assert.deepEqual(memberReplies.records, []);
    assert.deepEqual(memberReplies.links, []);
    assert.equal(memberReplies.visible, undefined);
    assert.equal(memberReplies.journal.length, 1);
    assert.equal(memberReplies.journal[0].id, REPLY);
    assert.equal(memberReplies.journal[0].authorName, 'nora');
    assert.equal(memberReplies.journal[0].body, 'Nora was there.');

    const whole = readCampaign(sql, 0, 10, false, 'all');
    assert.deepEqual(whole.journal.map((row) => row.id), [ENTRY, REPLY]);
});

test('a dead parent is refused, and deleting the parent tombstones the replies', () => {
    const { sql } = open();
    installCampaignSchema(sql);
    applyCampaignChanges(sql, { journal: [note(ENTRY), note(HIDDEN, { visibility: 'referee', author: 'referee' })] }, NOW);
    const missing = refusal(() => applyCampaignChanges(sql, { journal: [note(REPLY, { parent: GONE })] }, NOW, false, { userId: MEMBER }));
    assert.ok(missing instanceof CampaignRefusal);
    assert.equal(missing.code, 'validation');
    assert.equal(missing.message, 'Invalid request.');

    const session = refusal(() => applyCampaignChanges(sql, {
        journal: [note(REPLY, { parent: ENTRY, kind: 'session', sequence: 1, author: 'referee', visibility: 'referee' })],
    }, NOW));
    assert.ok(session instanceof CampaignRefusal);
    assert.equal(session.message, 'Invalid request.');

    applyCampaignChanges(sql, { journal: [note(REPLY, { parent: HIDDEN })] }, NOW, false, { userId: MEMBER });
    applyCampaignChanges(sql, { journal: [note(NEST, { parent: REPLY, title: 'And then' })] }, NOW);

    const moved = refusal(() => applyCampaignChanges(sql, {
        journal: [note(REPLY, { parent: ENTRY, baseRev: 1, rev: 1 })],
    }, NOW, false, { userId: MEMBER }));
    assert.ok(moved instanceof CampaignRefusal);
    assert.equal(moved.message, 'Invalid request.');

    applyCampaignChanges(sql, { journal: [{ id: HIDDEN, baseRev: 1, deleted: true }] }, NOW);
    const gone = readCampaign(sql, 0, 20, false, { parent: HIDDEN });
    const reply = gone.journal.find((row) => row.id === REPLY);
    assert.equal(reply.deleted, true);
    assert.equal(reply.rev, 2);
    const nested = readCampaign(sql, 0, 20, false, { parent: REPLY });
    assert.equal(nested.journal[0].id, NEST);
    assert.equal(nested.journal[0].deleted, true);
    assert.equal(nested.journal[0].rev, 2);
    const hidden = readCampaign(sql, 0, 20).journal.find((row) => row.id === HIDDEN);
    assert.equal(hidden.replies, 0);

    const again = refusal(() => applyCampaignChanges(sql, { journal: [note(LATE, { parent: HIDDEN, title: 'Too late' })] }, NOW));
    assert.ok(again instanceof CampaignRefusal);
});

test('the journal read parses parent and the export scope', () => {
    assert.equal(parseJournalRead(null, null), 'top');
    assert.deepEqual(parseJournalRead(ENTRY, null), { parent: ENTRY });
    assert.equal(parseJournalRead(null, 'all'), 'all');
    assert.deepEqual(parseJournalRead(ENTRY, 'all'), { parent: ENTRY });
    assert.equal(parseJournalRead('not-a-journal-id', null), null);
    assert.equal(parseJournalRead(null, 'some'), null);
});
