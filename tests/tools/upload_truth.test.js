// tools/truth/upload_truth.js refuses, before any R2 put or D1 write, every write it must not make:
// --endpoint or --remote without --yes, --endpoint without its own keys (no default, never the
// R2_* production keys), and a version that exists and is not 'building' (or whose state cannot be
// read). The D1 import files carry the same guard on every statement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { main, parseArgs, buildSql } from '../../tools/truth/upload_truth.js';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const PROD = { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'prod-key', R2_SECRET_ACCESS_KEY: 'prod-secret' };
const TEST_KEYS = { S3_ENDPOINT_ACCESS_KEY_ID: 'k', S3_ENDPOINT_SECRET_ACCESS_KEY: 's' };

/** A throwaway root: one built version v99 with one sector, one object and its inputs. */
function fakeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-truth-'));
    const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    w('apps/api/wrangler.toml', fs.readFileSync(path.join(REPO, 'apps/api/wrangler.toml'), 'utf8'));
    w('truth-local/v99/manifest.json', JSON.stringify({ engineVersion: '1.2.0', milieu: 'M1105', seed: 'S', settings: {}, sectors: [{ slug: 'Test_Sector', systems: 1, built: 1, partial: 0, indexHash: 'ih', canonical: true }] }));
    w('truth-local/v99/sectors/Test_Sector/index.json', JSON.stringify({ hexes: { '0101': { name: "O'Hara", uwp: 'A000000-0', allegiance: 'Im', zone: null, tree: 'h1', partial: false } } }));
    w('truth-local/objects/h1', '{}');
    w('universe/raw/sectors.json', '[]');
    w('universe/raw/Test_Sector.tsv', 'x');
    w('universe/raw/Test_Sector.xml', '<x/>');
    return root;
}

/** Run main with spies. Nothing reaches the network or wrangler. */
async function runMain(argv, { env = {}, state = null, stateThrows = false } = {}) {
    const root = fakeRoot();
    const calls = { put: 0, run: [], readState: [], errors: [] };
    const code = await main(argv, {
        root, env,
        log: () => {}, error: s => calls.errors.push(s),
        run: args => { calls.run.push(args); return ''; },
        readState: async (version, where) => { calls.readState.push(where); if (stateThrows) throw new Error('no table'); return state; },
        put: async (items, opts) => { calls.put += 1; calls.putOpts = opts; return { sent: items.length, skipped: 0, bytes: 0, failed: [] }; },
    });
    return { code, calls, root };
}
const wrote = calls => calls.put > 0 || calls.run.length > 0;

test('--endpoint without --yes is refused before anything', async () => {
    const { code, calls } = await runMain(['v99', '--endpoint', 'http://127.0.0.1:9'], { env: { ...TEST_KEYS } });
    assert.equal(code, 2);
    assert.equal(wrote(calls), false);
    assert.equal(calls.readState.length, 0);
});

test('--endpoint has no default keys and never falls back to the production keys', async () => {
    for (const env of [{}, { ...PROD }]) {
        const { code, calls } = await runMain(['v99', '--endpoint', 'http://127.0.0.1:9', '--yes'], { env });
        assert.equal(code, 2);
        assert.equal(wrote(calls), false);
        assert.match(calls.errors.join('\n'), /S3_ENDPOINT_ACCESS_KEY_ID/);
    }
    assert.equal(parseArgs(['v99', '--endpoint', 'http://x', '--yes'], { ...PROD }).code, 2);
});

test('--endpoint uses only its own keys', async () => {
    const { code, calls } = await runMain(['v99', '--endpoint', 'http://127.0.0.1:9', '--yes'], { env: { ...PROD, ...TEST_KEYS } });
    assert.equal(code, 0);
    assert.deepEqual(calls.putOpts.credentials, { accessKeyId: 'k', secretAccessKey: 's' });
    assert.equal(calls.putOpts.endpoint, 'http://127.0.0.1:9');
    assert.equal(calls.run.length, 0, '--endpoint writes no D1');
});

test('--remote without --yes is refused before anything', async () => {
    const { code, calls } = await runMain(['v99', '--remote'], { env: { ...PROD } });
    assert.equal(code, 2);
    assert.equal(wrote(calls), false);
});

test('--endpoint and --remote together are refused', () => {
    assert.equal(parseArgs(['v99', '--remote', '--yes', '--endpoint', 'http://x'], { ...PROD, ...TEST_KEYS }).code, 2);
});

for (const [name, argv, env, where] of [
    ['local', ['v99', '--local'], {}, 'local'],
    ['endpoint', ['v99', '--endpoint', 'http://127.0.0.1:9', '--yes'], { ...TEST_KEYS }, 'local'],
    ['remote', ['v99', '--remote', '--yes'], { ...PROD }, 'remote'],
]) {
    for (const state of ['released', 'withdrawn']) {
        test(`${name}: a ${state} version is refused before any R2 put or D1 write`, async () => {
            const { code, calls } = await runMain(argv, { env, state });
            assert.equal(code, 3);
            assert.deepEqual(calls.readState, [where]);
            assert.equal(wrote(calls), false);
        });
    }
    test(`${name}: a state that cannot be read is refused`, async () => {
        const { code, calls } = await runMain(argv, { env, stateThrows: true });
        assert.equal(code, 3);
        assert.equal(wrote(calls), false);
    });
    test(`${name}: a building or new version proceeds`, async () => {
        for (const state of ['building', null]) {
            const { code, calls } = await runMain(argv, { env, state });
            assert.equal(code, 0);
            assert.ok(wrote(calls));
        }
    });
}

test('the dry run reads no state and writes nothing remote', async () => {
    const { code, calls, root } = await runMain(['v99'], { env: { ...PROD } });
    assert.equal(code, 0);
    assert.equal(calls.readState.length, 0);
    assert.equal(wrote(calls), false);
    assert.ok(fs.existsSync(path.join(root, 'truth-local/v99/d1/part_000.sql')));
});

function migrated() {
    const db = new DatabaseSync(':memory:');
    const dir = path.join(REPO, 'apps/api/src/db/migrations');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort())
        for (const s of fs.readFileSync(path.join(dir, f), 'utf8').split('--> statement-breakpoint')) if (s.trim()) db.exec(s);
    return db;
}
const manifest = (systems) => ({ engineVersion: '1.2.0', milieu: 'M1105', seed: 'S', settings: {}, sectors: [{ slug: 'Test_Sector', systems, built: systems, partial: 0, indexHash: 'new', canonical: true }] });
const rows = n => Array.from({ length: n }, (_, i) => ['Test_Sector', String(i + 1).padStart(4, '0'), 'N', 'A000000-0', 'Im', null, 'h' + i, 0]);

test('D1 import: a released version keeps its sector rows and systems', () => {
    const db = migrated();
    db.exec(`INSERT INTO truth_versions (version, engine_version, state, started_at, sectors_total, sectors_done) VALUES ('v99', '1.1.0', 'released', 't', 1, 1)`);
    db.exec(`INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, updated_at) VALUES ('v99', 'Test_Sector', 'done', 1, 1, 0, 'old', 't')`);
    db.exec(`INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, updated_at) VALUES ('v99', 'Other', 'done', 1, 1, 0, 'old', 't')`);
    db.exec(`INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, tree_hash, partial) VALUES ('v99', 'Test_Sector', '0001', 'Kept', 'X', 'old', 0)`);
    for (const part of buildSql('v99', manifest(3), rows(3), 'now')) db.exec(part);
    assert.equal(db.prepare(`SELECT engine_version, state FROM truth_versions`).get().engine_version, '1.1.0');
    assert.deepEqual(db.prepare(`SELECT index_hash FROM truth_build_sectors ORDER BY sector_slug`).all().map(r => r.index_hash), ['old', 'old']);
    assert.deepEqual(db.prepare(`SELECT hex, name FROM truth_systems`).all().map(r => ({ ...r })), [{ hex: '0001', name: 'Kept' }]);
});

test('D1 import: a new version is written in full', () => {
    const db = migrated();
    for (const part of buildSql('v99', manifest(3), rows(3), 'now')) db.exec(part);
    assert.equal(db.prepare(`SELECT state FROM truth_versions`).get().state, 'building');
    assert.equal(db.prepare(`SELECT index_hash FROM truth_build_sectors`).get().index_hash, 'new');
    assert.equal(db.prepare(`SELECT count(*) AS n FROM truth_systems`).get().n, 3);
    // A re-run of a building version replaces its systems.
    for (const part of buildSql('v99', manifest(2), rows(2), 'now')) db.exec(part);
    assert.equal(db.prepare(`SELECT count(*) AS n FROM truth_systems`).get().n, 2);
});