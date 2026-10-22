import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { accountSettledBytes, chargeObjectBytes } from '../../apps/api/src/jobs/object_charge.ts';

/**
 * D1 batch runs both statements in one transaction. This stand-in does the same
 * with node:sqlite, and rolls both back when the add throws.
 */
function open(options = {}) {
    const withCharges = options.charges !== false;
    const db = new DatabaseSync(':memory:');
    db.exec(`
        CREATE TABLE universes (id TEXT PRIMARY KEY, object_bytes INTEGER NOT NULL);
        INSERT INTO universes (id, object_bytes) VALUES ('u', 10);
    `);
    if (withCharges) {
        db.exec(`
            CREATE TABLE object_byte_charges (
                job_id TEXT PRIMARY KEY NOT NULL,
                universe_id TEXT NOT NULL,
                bytes INTEGER NOT NULL
            );
        `);
    }
    const gate = { failUpdate: false, failMissing: false };
    const api = {
        prepare(sql) {
            return {
                bind(...values) {
                    return {
                        sql,
                        values,
                        async run() {
                            db.prepare(sql).run(...values);
                        },
                    };
                },
                async first() {
                    return db.prepare(sql).get();
                },
            };
        },
        async batch(statements) {
            db.exec('BEGIN');
            try {
                for (const statement of statements) {
                    if (gate.failMissing && statement.sql.startsWith('INSERT')) {
                        throw new Error('no such table: object_byte_charges');
                    }
                    if (gate.failUpdate && statement.sql.startsWith('UPDATE')) throw new Error('disk');
                    db.prepare(statement.sql).run(...statement.values);
                }
                db.exec('COMMIT');
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
        bytes() {
            return db.prepare(`SELECT object_bytes AS n FROM universes WHERE id = 'u'`).get().n;
        },
        charges() {
            return db.prepare(`SELECT COUNT(*) AS n FROM object_byte_charges`).get().n;
        },
        createCharges() {
            db.exec(`
                CREATE TABLE object_byte_charges (
                    job_id TEXT PRIMARY KEY NOT NULL,
                    universe_id TEXT NOT NULL,
                    bytes INTEGER NOT NULL
                );
            `);
        },
        gate,
    };
    return api;
}

test('a crash after the byte add retries the settled mark and counts once', async () => {
    const db = open();
    let marks = 0;
    await assert.rejects(() => accountSettledBytes(db, 'u', 'job-1', 40, async () => {
        marks += 1;
        throw new Error('crash');
    }), /crash/);
    assert.equal(db.bytes(), 50);
    assert.equal(marks, 1);
    await accountSettledBytes(db, 'u', 'job-1', 40, async () => {
        marks += 1;
    });
    assert.equal(db.bytes(), 50);
    assert.equal(db.charges(), 1);
    assert.equal(marks, 2);
});

test('a repeated object-byte charge adds the bytes once', async () => {
    const db = open();
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 50);
    assert.equal(db.charges(), 1);
});

test('a failed add rolls the charge row back so a retry can add', async () => {
    const db = open();
    db.gate.failUpdate = true;
    await assert.rejects(() => chargeObjectBytes(db, 'u', 'job-1', 40), /disk/);
    assert.equal(db.bytes(), 10);
    assert.equal(db.charges(), 0);
    db.gate.failUpdate = false;
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 50);
    assert.equal(db.charges(), 1);
});

test('a non-positive object-byte charge writes nothing', async () => {
    const db = open();
    await chargeObjectBytes(db, 'u', 'job-1', 0);
    assert.equal(db.bytes(), 10);
    assert.equal(db.charges(), 0);
});

test('a missing charge table adds the bytes once and does not throw', async () => {
    const db = open({ charges: false });
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 50);
});

test('a charge table that arrives is used on the next add', async () => {
    const db = open({ charges: false });
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 50);
    db.createCharges();
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 90);
    assert.equal(db.charges(), 1);
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 90);
    assert.equal(db.charges(), 1);
});

test('a batch that reports a missing charge table adds the bytes once', async () => {
    const db = open();
    db.gate.failMissing = true;
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 50);
    assert.equal(db.charges(), 0);
    await chargeObjectBytes(db, 'u', 'job-1', 40);
    assert.equal(db.bytes(), 90);
});
