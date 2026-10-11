import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyJobBatch, writeGenerated } from '../../apps/api/src/universe/hexes.ts';
import { commitGenerate, resolveMadeSectors, respondSectors } from '../../apps/api/src/universe/sectors.ts';

const NOW = '2026-10-08T00:00:00.000Z';
const PIN = { seed: 'TravellerMagnus', settings: { generationPopMax: 20 }, truthVersion: null };
const ID = `~${'0'.repeat(26)}`;
const ID_B = `~${'1'.repeat(26)}`;

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
    sql.exec(`CREATE TABLE sectors (
        sector_slug TEXT PRIMARY KEY, display_name TEXT, x INTEGER, y INTEGER, source TEXT,
        subsectors TEXT NOT NULL DEFAULT '', rev INTEGER NOT NULL DEFAULT 1,
        deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT
    )`);
    sql.exec(`CREATE UNIQUE INDEX referee_sectors_slot ON sectors(x, y) WHERE deleted = 0 AND source = 'referee'`);
    sql.exec(`CREATE TABLE sector_history (
        sector_slug TEXT NOT NULL, rev INTEGER NOT NULL, at TEXT, action TEXT, payload TEXT,
        PRIMARY KEY (sector_slug, rev)
    )`);
    sql.exec(`CREATE TABLE hexes (
        hex_key TEXT PRIMARY KEY, sector_slug TEXT, local_hex TEXT, rev INTEGER, updated_at TEXT,
        deleted INTEGER, base_hash TEXT, tree_hash TEXT, engine_version TEXT, type TEXT, name TEXT,
        uwp TEXT, allegiance TEXT, zone TEXT, bases TEXT, trade_codes TEXT, pbg TEXT, ix INTEGER,
        summary TEXT, provenance TEXT, roll INTEGER NOT NULL DEFAULT 0
    )`);
    return sql;
}

async function call(sql, method, path, body) {
    const response = await respondSectors(sql, new Request(`https://universe.internal${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }), NOW, PIN);
    return { status: response.status, body: await response.json() };
}

test('a referee sector is named, moved, and undone without moving its hex key', async () => {
    const sql = open();
    const made = await call(sql, 'POST', '/sectors', { id: ID, name: 'Far Reach', slot: { x: 3, y: 120 }, charted: false });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.data.id, ID);
    assert.equal(made.body.data.rev, 1);
    assert.equal(made.body.data.subsectors.length, 16);
    const taken = await call(sql, 'POST', '/sectors', { id: ID_B, name: 'Other', slot: { x: 3, y: 120 }, charted: false });
    assert.equal(taken.status, 409, JSON.stringify(taken.body));
    const charted = await call(sql, 'POST', '/sectors', { id: ID_B, name: 'Other', slot: { x: 4, y: 120 }, charted: true });
    assert.equal(charted.status, 400, JSON.stringify(charted.body));
    assert.equal(charted.body.error.details.reason, 'charted');
    const named = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/subsectors/A`, { name: 'Cronor', baseRev: 1 });
    assert.equal(named.status, 200, JSON.stringify(named.body));
    assert.equal(named.body.data.subsectors[0], 'Cronor');
    const moved = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/move`, {
        slot: { x: 4, y: 121 }, baseRev: named.body.data.rev, charted: false,
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual(moved.body.data.slot, { x: 4, y: 121 });
    sql.exec(
        `INSERT INTO hexes (hex_key, sector_slug, local_hex, rev, updated_at, deleted, tree_hash, type, name, uwp, roll)
         VALUES (?, ?, '0101', 1, ?, 0, ?, 'SYSTEM_PRESENT', '', '', 0)`,
        `${ID}/0101`, ID, NOW, 'a'.repeat(64),
    );
    const cleared = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/subsectors/A/clear`, { baseRev: moved.body.data.rev });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.equal(cleared.body.data.removed, 1);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`).length, 0);
    const back = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/undo`, {
        toRev: cleared.body.data.sector.rev, baseRev: cleared.body.data.sector.rev,
    });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`)[0].hex_key, `${ID}/0101`);
    const deleted = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/delete`, { baseRev: back.body.data.rev });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal(deleted.body.data.deleted, true);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`).length, 0);
    const restored = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/undo`, {
        toRev: deleted.body.data.rev, baseRev: deleted.body.data.rev,
    });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.data.deleted, false);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`)[0].hex_key, `${ID}/0101`);
    const page = await call(sql, 'GET', '/sectors');
    assert.equal(page.body.data.items.length, 1);
    assert.equal(page.body.data.items[0].name, 'Far Reach');
});

function openAll() {
    const sql = open();
    sql.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`);
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

const TREE = 'a'.repeat(64);
const TREE_B = 'b'.repeat(64);
const TREE_C = 'c'.repeat(64);
const ID_C = `~${'2'.repeat(26)}`;

function hexWrite(hexKey, treeHash, baseRev) {
    return { hexKey, treeHash, baseHash: null, roll: 0, baseRev, engineVersion: '1.1.0' };
}

test('one hex and its sector share the delete history, and undoing that delete brings both back', async () => {
    const sql = openAll();
    const hexKey = `${ID}/1910`;
    const made = await call(sql, 'POST', '/sectors/generate', {
        sectors: [{ id: ID, name: 'Far Reach', x: 3, y: 120, charted: false }],
        hex: hexWrite(hexKey, TREE, 0),
        job: null,
    });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    assert.equal(made.body.data.sectors[0].rev, 1);
    assert.equal(made.body.data.hex.hexKey, hexKey);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`)[0].hex_key, hexKey);
    const undone = await call(sql, 'POST', '/sectors/undo-generate', { sectorId: ID, baseRev: 1 });
    assert.equal(undone.status, 200, JSON.stringify(undone.body));
    assert.equal(undone.body.data.restored, 1);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`).length, 0);
    assert.equal(sql.exec(`SELECT deleted FROM sectors WHERE sector_slug = ?`, ID)[0].deleted, 1);
    const history = sql.exec(`SELECT payload FROM sector_history WHERE sector_slug = ? AND action = 'delete'`, ID)[0];
    const payload = JSON.parse(history.payload);
    assert.equal(payload.hexes[0].hex_key, hexKey);
    const back = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/undo`, {
        toRev: undone.body.data.sectors[0].toRev,
        baseRev: undone.body.data.sectors[0].baseRev,
    });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(back.body.data.deleted, false);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`)[0].hex_key, hexKey);
});

test('a refused inline write leaves no sector, and a charted slot writes nothing', async () => {
    const sql = openAll();
    assert.throws(() => commitGenerate(sql, {
        sectors: [{ id: ID, name: 'Far Reach', x: 1, y: 1, charted: false }],
        hex: hexWrite(`${ID}/0101`, TREE, 5),
        job: null,
    }, PIN, NOW), /The hex changed/);
    assert.equal(sql.exec(`SELECT sector_slug FROM sectors`).length, 0);
    const charted = await call(sql, 'POST', '/sectors/generate', {
        sectors: [{ id: ID, name: 'Far Reach', x: 4, y: 4, charted: true }],
        hex: hexWrite(`${ID}/0101`, TREE, 0),
        job: null,
    });
    assert.equal(charted.status, 400, JSON.stringify(charted.body));
    assert.equal(charted.body.error.message, 'That slot holds a charted sector.');
    assert.equal(charted.body.error.details.reason, 'charted');
    assert.equal(sql.exec(`SELECT sector_slug FROM sectors`).length, 0);
});

test('undo-generate stops a running job, and undoing the delete puts the hexes back', async () => {
    const sql = openAll();
    const keys = [`${ID}/0101`, `${ID_B}/0102`];
    const committed = commitGenerate(sql, {
        sectors: [
            { id: ID, name: 'One', x: 1, y: 2, charted: false },
            { id: ID_B, name: 'Two', x: 2, y: 2, charted: false },
        ],
        hex: null,
        job: {
            id: 'job-run',
            spec: {
                hexKeys: keys, edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: false,
                seed: PIN.seed, settings: PIN.settings, engineVersion: '1.1.0', captured: {},
            },
        },
    }, PIN, NOW);
    assert.equal(committed.jobId, 'job-run');
    applyJobBatch(sql, 'job-run', 0, [
        { ...hexWrite(keys[0], TREE, 0), capturedRev: 0 },
    ], [], [], PIN, NOW, false);
    assert.equal(sql.exec(`SELECT state FROM jobs WHERE id = ?`, 'job-run')[0].state, 'running');
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`).length, 1);
    const undone = await call(sql, 'POST', '/sectors/undo-generate', { jobId: 'job-run' });
    assert.equal(undone.status, 200, JSON.stringify(undone.body));
    assert.equal(undone.body.data.sectors.length, 2);
    assert.equal(undone.body.data.restored, 1);
    assert.equal(undone.body.data.hexes.length, 0);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`).length, 0);
    const job = sql.exec(`SELECT state, failures FROM jobs WHERE id = ?`, 'job-run')[0];
    assert.equal(job.state, 'stopped');
    assert.equal(JSON.parse(job.failures).undone, true);
    applyJobBatch(sql, 'job-run', 1, [
        { ...hexWrite(keys[0], TREE_C, 0), capturedRev: 0 },
    ], [], [], PIN, NOW, true);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`).length, 0);
    const back = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/undo`, {
        toRev: undone.body.data.sectors[0].toRev,
        baseRev: undone.body.data.sectors[0].baseRev,
    });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(sql.exec(`SELECT hex_key FROM hexes WHERE sector_slug = ?`, ID).length, 1);
    const again = await call(sql, 'POST', '/sectors/undo-generate', { jobId: 'job-run' });
    assert.equal(again.status, 400, JSON.stringify(again.body));
    assert.equal(again.body.error.message, 'Already undone.');
});

test('a moved sector rev or a moved hex rev writes nothing', async () => {
    const sql = openAll();
    const hexKey = `${ID}/1910`;
    await call(sql, 'POST', '/sectors/generate', {
        sectors: [{ id: ID, name: 'Far Reach', x: 3, y: 120, charted: false }],
        hex: hexWrite(hexKey, TREE, 0),
        job: null,
    });
    const renamed = await call(sql, 'POST', `/sectors/${encodeURIComponent(ID)}/rename`, { name: 'Moved', baseRev: 1 });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    const staleSector = await call(sql, 'POST', '/sectors/undo-generate', { sectorId: ID, baseRev: 1 });
    assert.equal(staleSector.status, 409, JSON.stringify(staleSector.body));
    assert.equal(staleSector.body.error.message, 'The sector changed.');
    assert.equal(sql.exec(`SELECT deleted FROM sectors WHERE sector_slug = ?`, ID)[0].deleted, 0);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes`).length, 1);

    const jobSql = openAll();
    const keys = [`${ID}/0101`, `${ID_B}/0102`];
    commitGenerate(jobSql, {
        sectors: [
            { id: ID, name: 'One', x: 1, y: 2, charted: false },
            { id: ID_B, name: 'Two', x: 2, y: 2, charted: false },
        ],
        hex: null,
        job: {
            id: 'job-stale',
            spec: {
                hexKeys: keys, edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: false,
                seed: PIN.seed, settings: PIN.settings, engineVersion: '1.1.0', captured: {},
            },
        },
    }, PIN, NOW);
    applyJobBatch(jobSql, 'job-stale', 0, [
        { ...hexWrite(keys[0], TREE, 0), capturedRev: 0 },
    ], [], [], PIN, NOW, false);
    jobSql.exec(`UPDATE hexes SET rev = 9 WHERE hex_key = ?`, keys[0]);
    const staleHex = await call(jobSql, 'POST', '/sectors/undo-generate', { jobId: 'job-stale' });
    assert.equal(staleHex.status, 409, JSON.stringify(staleHex.body));
    assert.equal(staleHex.body.error.message, 'The hex changed.');
    assert.equal(jobSql.exec(`SELECT state FROM jobs WHERE id = ?`, 'job-stale')[0].state, 'running');
    assert.equal(jobSql.exec(`SELECT deleted FROM sectors WHERE sector_slug = ?`, ID)[0].deleted, 0);
    assert.equal(jobSql.exec(`SELECT hex_key FROM hexes`).length, 1);
});

test('slot names are rewritten, and a bad box is refused with nothing stored', async () => {
    const ids = [ID, ID_B];
    const planned = resolveMadeSectors(
        ['Spinward_Marches/1910', '~slot_3_120/0101', '~slot_-1_-2/0102'],
        [{ name: 'Far', slot: { x: 3, y: 120 } }, { name: 'Near', slot: { x: -1, y: -2 } }],
        ids,
    );
    assert.deepEqual(planned.hexKeys, ['Spinward_Marches/1910', `${ID}/0101`, `${ID_B}/0102`]);
    assert.throws(() => resolveMadeSectors(
        ['~slot_1_1/0101', '~slot_1_1/0102'],
        [{ name: 'A', slot: { x: 1, y: 1 } }, { name: 'B', slot: { x: 1, y: 1 } }],
        ids,
    ), /That slot is named twice/);
    assert.throws(() => resolveMadeSectors(
        ['~slot_9_9/0101'],
        [{ name: 'A', slot: { x: 1, y: 1 } }],
        [ID],
    ), /A hex names a slot that is not being made/);
    assert.throws(() => resolveMadeSectors(
        ['~slot_1_1/0101'],
        [{ name: 'A', slot: { x: 1, y: 1 } }, { name: 'B', slot: { x: 2, y: 2 } }],
        ids,
    ), /A new sector has no hexes/);
    const sql = openAll();
    await call(sql, 'POST', '/sectors', { id: ID, name: 'Taken', slot: { x: 3, y: 120 }, charted: false });
    const taken = await call(sql, 'POST', '/sectors/generate', {
        sectors: [{ id: ID_B, name: 'Other', x: 3, y: 120, charted: false }],
        hex: hexWrite(`${ID_B}/0101`, TREE, 0),
        job: null,
    });
    assert.equal(taken.status, 409, JSON.stringify(taken.body));
    assert.equal(taken.body.error.message, 'That slot is in use.');
    assert.equal(sql.exec(`SELECT sector_slug FROM sectors WHERE deleted = 0`).length, 1);
});

test('one job covers an existing hex and two new sectors, and one undo takes all three back', async () => {
    const sql = openAll();
    await call(sql, 'POST', '/sectors', { id: ID, name: 'Home', slot: { x: 8, y: 8 }, charted: false });
    const existing = `${ID}/1910`;
    writeGenerated(sql, hexWrite(existing, TREE, 0), PIN, NOW);
    const fresh = [`${ID_B}/0101`, `${ID_C}/0102`];
    commitGenerate(sql, {
        sectors: [
            { id: ID_B, name: 'Left', x: 9, y: 8, charted: false },
            { id: ID_C, name: 'Right', x: 10, y: 8, charted: false },
        ],
        hex: null,
        job: {
            id: 'job-box',
            spec: {
                hexKeys: [existing, ...fresh], edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: true,
                seed: PIN.seed, settings: PIN.settings, engineVersion: '1.1.0', captured: {},
            },
        },
    }, PIN, NOW);
    applyJobBatch(sql, 'job-box', 0, [
        { ...hexWrite(existing, TREE_B, 1), capturedRev: 1 },
        { ...hexWrite(fresh[0], TREE_C, 0), capturedRev: 0 },
        { ...hexWrite(fresh[1], TREE, 0), capturedRev: 0 },
    ], [], [], PIN, NOW, true);
    assert.equal(sql.exec(`SELECT tree_hash FROM hexes WHERE hex_key = ?`, existing)[0].tree_hash, TREE_B);
    const undone = await call(sql, 'POST', '/sectors/undo-generate', { jobId: 'job-box' });
    assert.equal(undone.status, 200, JSON.stringify(undone.body));
    assert.equal(undone.body.data.sectors.length, 2);
    assert.equal(undone.body.data.hexes.length, 1);
    assert.equal(undone.body.data.hexes[0].hexKey, existing);
    assert.equal(sql.exec(`SELECT tree_hash FROM hexes WHERE hex_key = ?`, existing)[0].tree_hash, TREE);
    assert.equal(sql.exec(`SELECT hex_key FROM hexes WHERE sector_slug = ?`, ID_B).length, 0);
    assert.equal(sql.exec(`SELECT deleted FROM sectors WHERE sector_slug = ?`, ID_B)[0].deleted, 1);
    assert.equal(sql.exec(`SELECT deleted FROM sectors WHERE sector_slug = ?`, ID_C)[0].deleted, 1);
    assert.equal(sql.exec(`SELECT deleted FROM sectors WHERE sector_slug = ?`, ID)[0].deleted, 0);
});
