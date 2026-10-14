import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { builderPairReady } from '@voyage/shared';
import {
    accountedBytes,
    applyGenerated,
    applyJobBatch,
    createJob,
    ensurePin,
    generationSeed,
    markJobFailed,
    readHexPage,
    readJob,
    readJobSlice,
    settleJobBytes,
    removeHex,
    restoreHex,
    revertHex,
    stopJob,
    undoJob,
} from '../../apps/api/src/universe/hexes.ts';

const NOW = '2026-10-08T00:00:00.000Z';
const HASH = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const KEY = 'Spinward_Marches/1910';
const KEY_B = 'Spinward_Marches/1911';
const OWN = { seed: 'TravellerMagnus', settings: { generationPopMax: 20 }, truthVersion: null };
const PINNED = { seed: 'TravellerMagnus', settings: { generationPopMax: 20 }, truthVersion: 'v5' };

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
    sql.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`);
    sql.exec(`CREATE TABLE hexes (
        hex_key TEXT PRIMARY KEY, sector_slug TEXT, local_hex TEXT, rev INTEGER, updated_at TEXT,
        deleted INTEGER, base_hash TEXT, tree_hash TEXT, engine_version TEXT, type TEXT, name TEXT,
        uwp TEXT, allegiance TEXT, zone TEXT, bases TEXT, trade_codes TEXT, pbg TEXT, ix INTEGER,
        summary TEXT, provenance TEXT, roll INTEGER NOT NULL DEFAULT 0
    )`);
    sql.exec(`CREATE TABLE hex_history (
        hex_key TEXT NOT NULL, rev INTEGER NOT NULL, at TEXT, action TEXT, actor TEXT,
        tree_hash TEXT, summary TEXT, deleted INTEGER, PRIMARY KEY (hex_key, rev)
    )`);
    sql.exec(`CREATE TABLE jobs (
        id TEXT PRIMARY KEY, kind TEXT, state TEXT, total INTEGER, done INTEGER, failed INTEGER,
        failures TEXT, created_at TEXT, finished_at TEXT
    )`);
    sql.exec(`CREATE TABLE snapshots (
        id TEXT PRIMARY KEY, at TEXT, label TEXT, trigger TEXT, manifest_hash TEXT, bytes INTEGER
    )`);
    return sql;
}

function refusal(fn) {
    try {
        fn();
        return null;
    } catch (err) {
        return err;
    }
}

test('a chart hex kept at rev 0 is the referee\'s, and revert to 0 is the chart', () => {
    const sql = open();
    ensurePin(sql, PINNED);
    const row = applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: HASH_B, roll: 0, baseRev: 0, engineVersion: '1.1.0', action: 'keep',
    }, PINNED, NOW);
    assert.equal(row.state, 'override');
    assert.equal(row.rev, 1);
    assert.equal(row.baseHash, HASH_B);
    const chart = revertHex(sql, KEY, 0, row.rev, PINNED, NOW);
    assert.equal(chart.state, 'truth');
    assert.equal(chart.rev, 0);
    const again = applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: HASH_B, roll: 0, baseRev: 0, engineVersion: '1.1.0', action: 'keep',
    }, PINNED, NOW);
    const removed = removeHex(sql, KEY, again.rev, PINNED, NOW);
    assert.equal(removed.state, 'removed');
    const restored = restoreHex(sql, KEY, removed.rev, PINNED, NOW);
    assert.equal(restored.state, 'truth');
    assert.equal(restored.rev, 0);
});

test('a referee sector hex is own on a pinned universe and remove drops the row', () => {
    const sql = open();
    ensurePin(sql, PINNED);
    const key = `${'~' + '0'.repeat(26)}/1910`;
    const row = applyGenerated(sql, {
        hexKey: key, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, engineVersion: '1.1.0',
    }, PINNED, NOW);
    assert.equal(row.state, 'own');
    const gone = removeHex(sql, key, row.rev, PINNED, NOW);
    assert.equal(gone.state, 'own');
    assert.equal(gone.rev, 0);
    const back = refusal(() => restoreHex(sql, key, 0, PINNED, NOW));
    assert.equal(back.code, 'validation');
    assert.equal(back.details.reason, 'no_chart');
});

test('roll 0 keeps the universe seed', () => {
    assert.equal(generationSeed('TravellerMagnus', 0), 'TravellerMagnus');
    assert.equal(generationSeed('TravellerMagnus', 2), 'TravellerMagnus/roll/2');
    assert.equal(builderPairReady('MgT2E', 'top-down'), true);
    assert.equal(builderPairReady('AoW', 'bottom-up'), true);
    assert.equal(builderPairReady('MgT2E', 'bottom-up'), false);
    assert.equal(builderPairReady('CT', 'top-down'), false);
});

test('a pin is stored once', () => {
    const sql = open();
    assert.deepEqual(ensurePin(sql, OWN).truthVersion, null);
    assert.equal(ensurePin(sql, PINNED).truthVersion, null);
});

test('keep records action keep and revert restores that tree', () => {
    const sql = open();
    ensurePin(sql, OWN);
    applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, engineVersion: '1.0.0',
    }, OWN, NOW);
    const kept = applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH_B, baseHash: null, roll: 0, baseRev: 1, engineVersion: '1.0.0',
        action: 'keep',
    }, OWN, NOW);
    assert.equal(kept.rev, 2);
    assert.equal(kept.treeHash, HASH_B);
    const history = sql.exec(
        `SELECT action, tree_hash FROM hex_history WHERE hex_key = ? ORDER BY rev`,
        KEY,
    );
    assert.equal(history[0].action, 'generate');
    assert.equal(history[1].action, 'keep');
    assert.equal(history[1].tree_hash, HASH_B);
    const other = applyGenerated(sql, {
        hexKey: KEY_B, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, engineVersion: '1.0.0',
        action: 'blank',
    }, OWN, NOW);
    assert.equal(other.rev, 1);
    const labelled = sql.exec(`SELECT action FROM hex_history WHERE hex_key = ?`, KEY_B);
    assert.equal(labelled[0].action, 'generate');
    const back = revertHex(sql, KEY, 1, 2, OWN, NOW);
    assert.equal(back.treeHash, HASH);
    assert.equal(back.rev, 3);
});

test('one hex is written, conflicted, removed and restored', () => {
    const sql = open();
    ensurePin(sql, PINNED);
    const row = applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: HASH_B, roll: 0, baseRev: 0, engineVersion: '1.0.0',
    }, PINNED, NOW);
    assert.equal(row.state, 'override');
    assert.equal(row.rev, 1);
    assert.equal(row.baseHash, HASH_B);
    assert.equal(row.roll, 0);
    const stale = refusal(() => applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: HASH_B, roll: 1, baseRev: 0, engineVersion: '1.0.0',
    }, PINNED, NOW));
    assert.equal(stale.code, 'conflict');
    assert.equal(stale.details.current.rev, 1);
    const again = applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: HASH_B, roll: 1, baseRev: 1, engineVersion: '1.0.0',
    }, PINNED, NOW);
    assert.equal(again.rev, 2);
    assert.equal(again.roll, 1);
    const removed = removeHex(sql, KEY, 2, PINNED, NOW);
    assert.equal(removed.state, 'removed');
    assert.equal(removed.treeHash, null);
    assert.equal(removed.baseHash, HASH_B);
    const back = restoreHex(sql, KEY, 3, PINNED, NOW);
    assert.equal(back.state, 'truth');
    assert.equal(back.rev, 0);
    const page = readHexPage(sql, 'Spinward_Marches', null, 100, PINNED);
    assert.equal(page.items.length, 0);
});

const CHART = {
    tree: HASH,
    type: 'SYSTEM_PRESENT',
    name: 'Regina',
    uwp: 'A788899-C',
    allegiance: 'ImDd',
    zone: '',
    bases: 'NS',
    tradeCodes: ['Ri'],
    pbg: '613',
    ix: 3,
    stars: 'G2 V',
    partial: null,
};

test('an untouched chart hex is removed, restored, and then generated', () => {
    const sql = open();
    ensurePin(sql, PINNED);
    const empty = refusal(() => removeHex(sql, KEY, 0, PINNED, NOW, null));
    assert.equal(empty.code, 'validation');
    assert.equal(empty.details.reason, 'empty');
    const removed = removeHex(sql, KEY, 0, PINNED, NOW, { baseHash: HASH, entry: CHART });
    assert.equal(removed.state, 'removed');
    assert.equal(removed.rev, 1);
    assert.equal(removed.treeHash, null);
    assert.equal(removed.baseHash, HASH);
    assert.equal(removed.entry.name, 'Regina');
    assert.equal(removed.entry.uwp, 'A788899-C');
    const back = restoreHex(sql, KEY, removed.rev, PINNED, NOW);
    assert.equal(back.state, 'truth');
    assert.equal(back.rev, 0);
    const again = removeHex(sql, KEY, 0, PINNED, NOW, { baseHash: HASH, entry: CHART });
    assert.equal(again.state, 'removed');
    const made = applyGenerated(sql, {
        hexKey: KEY,
        treeHash: HASH_B,
        baseHash: HASH,
        roll: 0,
        baseRev: again.rev,
        engineVersion: '1.0.0',
        entry: { ...CHART, tree: HASH_B, name: 'Weinberg', uwp: 'C224325-7' },
    }, PINNED, NOW);
    assert.equal(made.state, 'override');
    assert.equal(made.treeHash, HASH_B);
    assert.equal(made.baseHash, HASH);
    assert.equal(made.entry.name, 'Weinberg');
    assert.equal(made.entry.uwp, 'C224325-7');
});

test('undo of a restore copies the tombstone forward at a new rev', () => {
    const sql = open();
    ensurePin(sql, PINNED);
    applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: HASH_B, roll: 0, baseRev: 0, engineVersion: '1.0.0', entry: CHART,
    }, PINNED, NOW);
    const removed = removeHex(sql, KEY, 1, PINNED, NOW);
    assert.equal(removed.rev, 2);
    assert.equal(removed.state, 'removed');
    const gone = restoreHex(sql, KEY, 2, PINNED, NOW);
    assert.equal(gone.rev, 0);
    const copied = revertHex(sql, KEY, 2, 0, PINNED, NOW);
    assert.equal(copied.rev, 3);
    assert.equal(copied.state, 'removed');
    assert.equal(copied.treeHash, null);
    assert.equal(copied.entry.uwp, 'A788899-C');
});

test('an own map remove deletes the row and cannot restore to a chart', () => {
    const sql = open();
    ensurePin(sql, OWN);
    applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, engineVersion: '1.0.0',
    }, OWN, NOW);
    const gone = removeHex(sql, KEY, 1, OWN, NOW);
    assert.equal(gone.state, 'own');
    assert.equal(gone.rev, 0);
    const refused = refusal(() => restoreHex(sql, KEY, 0, OWN, NOW));
    assert.equal(refused.code, 'validation');
    assert.equal(refused.details.reason, 'no_chart');
});

test('revert copies an older revision forward', () => {
    const sql = open();
    ensurePin(sql, OWN);
    applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, engineVersion: '1.0.0',
    }, OWN, NOW);
    const undone = revertHex(sql, KEY, 0, 1, OWN, NOW);
    assert.equal(undone.rev, 0);
    const restored = revertHex(sql, KEY, 1, 0, OWN, NOW);
    assert.equal(restored.rev, 2);
    assert.equal(restored.treeHash, HASH);
    assert.equal(restored.state, 'own');
});

test('a job keeps a copy and one undo puts the hexes back', () => {
    const sql = open();
    ensurePin(sql, PINNED);
    applyGenerated(sql, {
        hexKey: KEY, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, engineVersion: '1.0.0',
    }, PINNED, NOW);
    createJob(sql, 'job-1', {
        hexKeys: [KEY, KEY_B],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
        seed: 'TravellerMagnus',
        settings: {},
        engineVersion: '1.0.0',
        captured: {},
    }, PINNED, NOW);
    const running = applyJobBatch(sql, 'job-1', 0, [
        { hexKey: KEY, treeHash: HASH_B, baseHash: null, roll: 0, baseRev: 1, capturedRev: 1, engineVersion: '1.0.0' },
        { hexKey: KEY_B, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, capturedRev: 0, engineVersion: '1.0.0' },
    ], [], [], PINNED, NOW, true);
    assert.equal(running.state, 'done');
    assert.equal(running.done, 2);
    const twice = applyJobBatch(sql, 'job-1', 0, [], [], [], PINNED, NOW, true);
    assert.equal(twice.done, 2);
    const undone = undoJob(sql, 'job-1', PINNED, NOW);
    assert.equal(undone.restored, 2);
    assert.deepEqual(undone.conflicts, []);
    const page = readHexPage(sql, 'Spinward_Marches', null, 10, PINNED);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].hexKey, KEY);
    assert.equal(page.items[0].treeHash, HASH);
    const again = refusal(() => undoJob(sql, 'job-1', PINNED, NOW));
    assert.equal(again.details.reason, 'already_undone');
});

test('stop leaves a queued job undone until undo', () => {
    const sql = open();
    ensurePin(sql, OWN);
    const job = createJob(sql, 'job-2', {
        hexKeys: [KEY],
        edition: 'AoW',
        generator: 'bottom-up',
        roll: 1,
        filledToo: false,
        seed: 'TravellerMagnus',
        settings: {},
        engineVersion: '1.0.0',
        captured: {},
    }, OWN, NOW);
    assert.equal(job.state, 'queued');
    const stopped = stopJob(sql, 'job-2', NOW);
    assert.equal(stopped.state, 'stopped');
    const refused = refusal(() => undoJob(sql, 'job-2', OWN, NOW));
    assert.equal(refused, null);
});

test('a density batch counts hexes left empty and lists the ones it wrote', () => {
    const sql = open();
    ensurePin(sql, OWN);
    const empty = 'Spinward_Marches/1912';
    createJob(sql, 'job-density', {
        hexKeys: [KEY, KEY_B, empty],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: false,
        density: 'standard',
        seed: 'TravellerMagnus',
        settings: {},
        engineVersion: '1.0.0',
        captured: {},
    }, OWN, NOW);
    const done = applyJobBatch(sql, 'job-density', 0, [
        { hexKey: KEY, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, capturedRev: 0, engineVersion: '1.0.0' },
    ], [KEY_B], [], OWN, NOW, true, [empty]);
    assert.equal(done.state, 'done');
    assert.equal(done.done, 3);
    assert.equal(done.skipped, 1);
    assert.equal(done.leftEmpty, 1);
    assert.deepEqual(done.placed, [KEY]);
    assert.deepEqual(readJob(sql, 'job-density', 1).placed, []);
    assert.equal(readJob(sql, 'job-density', 0).leftEmpty, 1);
    const undone = undoJob(sql, 'job-density', OWN, NOW);
    assert.equal(undone.restored, 1);
    assert.equal(readHexPage(sql, 'Spinward_Marches', null, 10, OWN).items.length, 0);
});

test('slices that arrive out of order finish once, and a repeat does not count twice', () => {
    const sql = open();
    ensurePin(sql, OWN);
    const keys = ['Spinward_Marches/1910', 'Spinward_Marches/1911', 'Spinward_Marches/1912', 'Spinward_Marches/1913'];
    createJob(sql, 'job-order', {
        hexKeys: keys,
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
        seed: 'TravellerMagnus',
        settings: {},
        engineVersion: '1.0.0',
        captured: {},
    }, OWN, NOW);
    const write = (hexKey) => ({
        hexKey, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, capturedRev: 0, engineVersion: '1.0.0',
    });
    const seen = [];
    const land = (offset, hexKey) => {
        const job = applyJobBatch(sql, 'job-order', offset, [write(hexKey)], [], [], OWN, NOW, offset === 3, [], 10);
        seen.push(job.done);
        return job;
    };
    const tail = land(3, keys[3]);
    assert.equal(tail.state, 'running');
    assert.equal(tail.done, 1);
    const second = land(1, keys[1]);
    const third = land(0, keys[0]);
    const last = land(2, keys[2]);
    assert.equal(second.state, 'running');
    assert.equal(third.state, 'running');
    assert.equal(last.state, 'done');
    assert.equal(last.done, 4);
    assert.deepEqual(seen, [1, 2, 3, 4]);
    const repeated = applyJobBatch(sql, 'job-order', 3, [write(keys[3])], [], [], OWN, NOW, true, [], 10);
    assert.equal(repeated.done, 4);
    assert.equal(accountedBytes(sql, 'job-order'), 40);
    assert.equal(settleJobBytes(sql, 'job-order', 40), 40);
    assert.equal(readJobSlice(sql, 'job-order', 0, 1).job.bytesSettled, 40);
    const slice = readJobSlice(sql, 'job-order', 1, 2);
    assert.deepEqual(slice.spec.hexKeys, [keys[1], keys[2]]);
    assert.deepEqual(slice.job.applied, [3, 1, 0, 2]);
    assert.equal(slice.rows[0].treeHash, HASH);
    const undone = undoJob(sql, 'job-order', OWN, NOW);
    assert.equal(undone.restored, 4);
    assert.equal(readHexPage(sql, 'Spinward_Marches', null, 10, OWN).items.length, 0);
});

test('a busy job ends failed and keeps the sentence on the next hex', () => {
    const sql = open();
    ensurePin(sql, OWN);
    createJob(sql, 'job-busy', {
        hexKeys: [KEY, KEY_B],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
        seed: 'TravellerMagnus',
        settings: {},
        engineVersion: '1.0.0',
        captured: {},
    }, OWN, NOW);
    markJobFailed(sql, 'job-busy', NOW, 'This universe is busy. Generation stopped. Try again in a minute.', KEY);
    const job = readJob(sql, 'job-busy');
    assert.equal(job.state, 'failed');
    assert.equal(job.failures[0].hexKey, KEY);
    assert.equal(job.failures[0].reason, 'This universe is busy. Generation stopped. Try again in a minute.');
    markJobFailed(sql, 'job-busy', NOW, 'again', KEY_B);
    assert.equal(readJob(sql, 'job-busy').failures.length, 1);
});

test('a failed job keeps a sentence that names no hex', () => {
    const sql = open();
    ensurePin(sql, OWN);
    createJob(sql, 'job-cap', {
        hexKeys: ['Spinward_Marches/1910', 'Deneb/0101'],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
        seed: 'TravellerMagnus',
        settings: {},
        engineVersion: '1.0.0',
        captured: {},
    }, OWN, NOW);
    markJobFailed(sql, 'job-cap', NOW, 'The limit is one sector per request.');
    const job = readJob(sql, 'job-cap');
    assert.equal(job.state, 'failed');
    assert.equal(job.failed, 0);
    assert.equal(job.failures.length, 0);
    assert.equal(job.error, 'The limit is one sector per request.');
});

test('two batches posted together both land', async () => {
    const sql = open();
    ensurePin(sql, OWN);
    createJob(sql, 'job-pair', {
        hexKeys: [KEY, KEY_B],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
        seed: 'TravellerMagnus',
        settings: {},
        engineVersion: '1.0.0',
        captured: {},
    }, OWN, NOW);
    const write = (hexKey) => ({
        hexKey, treeHash: HASH, baseHash: null, roll: 0, baseRev: 0, capturedRev: 0, engineVersion: '1.0.0',
    });
    const [first, second] = await Promise.all([
        Promise.resolve().then(() => applyJobBatch(sql, 'job-pair', 1, [write(KEY_B)], [], [], OWN, NOW, true)),
        Promise.resolve().then(() => applyJobBatch(sql, 'job-pair', 0, [write(KEY)], [], [], OWN, NOW, false)),
    ]);
    const done = first.done > second.done ? first : second;
    assert.equal(done.state, 'done');
    assert.equal(done.done, 2);
    assert.deepEqual(done.placed.slice().sort(), [KEY, KEY_B].sort());
    const undone = undoJob(sql, 'job-pair', OWN, NOW);
    assert.equal(undone.restored, 2);
});

