/**
 * BC1b. The Durable Object summary row, and the isolate's D1 upsert gates.
 * The worker suite is campaign_summary.test.js.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyCampaignChanges, installCampaignSchema } from '../../apps/api/src/universe/campaign.ts';
import { liftSummary, noteSummaryUpsert, resetSummaryUpserts, summaryUpsertDue } from '../../apps/api/src/universe/summary_sync.ts';

const NOW = '2026-10-04T00:00:00.000Z';
const LATER = '2026-10-04T00:05:00.000Z';
const SHIP = 'cr_00000000-0000-4000-8000-0000000000a1';
const PERSON = 'cr_00000000-0000-4000-8000-0000000000a2';
const GONE = 'cr_00000000-0000-4000-8000-0000000000a3';
const NOTE = 'cj_00000000-0000-4000-8000-0000000000a1';

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

function party(over = {}) {
    return {
        party: {
            vesselIds: [SHIP, GONE],
            aboard: {},
            memberIds: [PERSON, GONE],
            anchor: null,
        },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
        baseRev: 0,
        ...over,
    };
}

function note(over = {}) {
    return {
        id: NOTE,
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

function stored(db) {
    const row = db.prepare(`SELECT vessels, aboard, clock_days AS clockDays, record_count AS records, changed_at AS changedAt FROM campaign_summary WHERE id = 1`).get();
    return {
        vessels: JSON.parse(row.vessels),
        aboard: row.aboard,
        clockDays: row.clockDays,
        records: row.records,
        changedAt: row.changedAt,
    };
}

test('a stored change writes the summary, and a conflict leaves it', () => {
    const { db, sql } = open();
    assert.equal(db.prepare(`SELECT value FROM meta WHERE key = 'schemaVersion'`).get().value, '3');
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM campaign_summary`).get().n, 0);

    const created = applyCampaignChanges(sql, {
        records: [
            record(SHIP, { type: 'vessel', name: 'Far Trader' }),
            record(PERSON, { name: 'Ada' }),
        ],
    }, NOW);
    assert.equal(created.applied.length, 2);
    assert.deepEqual(created.summary, {
        vessels: [],
        aboard: 0,
        clockDays: null,
        records: 2,
        changedAt: NOW,
    });

    const placed = applyCampaignChanges(sql, { settings: party() }, LATER);
    assert.equal(placed.applied.length, 1);
    assert.deepEqual(placed.summary.vessels, ['Far Trader']);
    assert.equal(placed.summary.aboard, 1);
    assert.equal(placed.summary.records, 2);
    assert.equal(placed.summary.changedAt, LATER);

    const clock = applyCampaignChanges(sql, { clock: { days: 12.5, baseRev: 0 } }, '2026-10-04T00:06:00.000Z');
    assert.equal(clock.summary.clockDays, 12.5);

    const removed = applyCampaignChanges(sql, {
        records: [{ id: SHIP, baseRev: 1, deleted: true }],
    }, '2026-10-04T00:07:00.000Z');
    assert.deepEqual(removed.summary.vessels, []);
    assert.equal(removed.summary.aboard, 1);
    assert.equal(removed.summary.records, 1);

    const before = stored(db).changedAt;
    const stale = applyCampaignChanges(sql, { settings: party({ baseRev: 0 }) }, '2026-10-04T00:08:00.000Z');
    assert.equal(stale.applied.length, 0);
    assert.equal(stale.summary, undefined);
    assert.equal(stored(db).changedAt, before);

    const noted = applyCampaignChanges(sql, { journal: [note()] }, '2026-10-04T00:09:00.000Z', false, { userId: 'player-m1' });
    assert.equal(noted.applied.length, 1);
    assert.equal(noted.summary.records, 1);
    assert.equal(noted.summary.changedAt, '2026-10-04T00:09:00.000Z');
});

test('the D1 upsert waits a minute unless the values are unchanged', () => {
    resetSummaryUpserts();
    const first = { vessels: ['Far Trader'], aboard: 1, clockDays: null, records: 2, changedAt: NOW };
    const second = { ...first, records: 3, changedAt: LATER };
    assert.equal(summaryUpsertDue('uni-a', first, 1_000), true);
    noteSummaryUpsert('uni-a', first, 1_000);
    assert.equal(summaryUpsertDue('uni-a', first, 30_000), false);
    assert.equal(summaryUpsertDue('uni-a', second, 30_000), false);
    assert.equal(summaryUpsertDue('uni-a', second, 61_000), true);
    assert.equal(summaryUpsertDue('uni-b', second, 30_000), true);

    const body = { applied: [], summary: first };
    assert.deepEqual(liftSummary(body), first);
    assert.equal('summary' in body, false);
    assert.equal(liftSummary({ applied: [] }), null);
});
