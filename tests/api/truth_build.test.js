import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { TSV } from '../golden/cases.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { SectorIndex, TruthManifest, TruthOverview, TruthPolities, sha256Hex, stable } from '@voyage/shared';
import { reconcileTree, environmentPolicy } from '@voyage/engines';
import { emptyReport, mergeReports, provenanceDocument, reconciliationDigests, reportForTree } from '../../apps/api/src/jobs/reconcile_transform.ts';
import { deadLetterConsumer } from '../../apps/api/src/jobs/dead_letter.ts';
import { truthBuildConsumer } from '../../apps/api/src/jobs/truth_build.ts';
import { adminCookie, runWrangler } from './session.js';
import { apiRoot, withDevServer, wranglerBin } from './server.js';

const ATTRIBUTION = 'Sector data from the Traveller Map (travellermap.com), used under Far Future Enterprises\' Fair Use Policy. Traveller is a registered trademark of Far Future Enterprises.';
const XML = '<Sector><Name>Fixture</Name><X>0</X><Y>0</Y></Sector>\n';
const SURVEY = '1911\tUnknown\t???????-?\t\t\t\t\t\t\t\t\t\t\t\t';
const CATALOGUE = {
    milieu: 'M1105',
    sectors: [{
        slug: 'Fixture',
        name: 'Chart Fixture',
        abbreviation: 'Cf',
        x: 4,
        y: -1,
        tags: ['OTU'],
        canonical: true,
    }],
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function wideTsv(count) {
    const lines = TSV.split('\n');
    const header = lines[0];
    const sample = lines[1].split('\t');
    const hexAt = header.split('\t').indexOf('Hex');
    const rows = [header];
    for (let i = 0; i < count; i++) {
        const col = (i % 32) + 1;
        const row = Math.floor(i / 32) + 1;
        const hex = String(col).padStart(2, '0') + String(row).padStart(2, '0');
        const cells = sample.slice();
        cells[hexAt] = hex;
        rows.push(cells.join('\t'));
    }
    return rows.join('\n');
}

function chartRow(tree, partial) {
    return {
        tree, type: 'SYSTEM_PRESENT', name: 'World', uwp: 'A788899-C',
        allegiance: 'Im', zone: '', bases: '', tradeCodes: [], pbg: '100', ix: 1, partial,
    };
}

function bindingDouble(files) {
    const stored = new Map(Object.entries(files));
    const calls = { get: 0, put: 0, list: 0, send: 0, batch: 0, run: 0 };
    const sent = [];
    const puts = [];
    const bucket = () => ({
        async get(key) {
            calls.get += 1;
            const value = stored.get(key);
            if (value == null) return null;
            return { text: async () => value };
        },
        async put(key, body) {
            calls.put += 1;
            puts.push(key);
            stored.set(key, String(body));
        },
        async list(options) {
            calls.list += 1;
            const prefix = options.prefix ?? '';
            const keys = [...stored.keys()].filter((key) => key.startsWith(prefix)).sort();
            return { objects: keys.map((key) => ({ key })), truncated: false };
        },
    });
    return {
        calls,
        sent,
        puts,
        env: {
            PRIVATE_BUCKET: bucket(),
            PUBLIC_BUCKET: bucket(),
            TRUTH_QUEUE: { async send(body) { calls.send += 1; sent.push(body); } },
            DB: {
                prepare() {
                    return {
                        bind() { return this; },
                        async run() { calls.run += 1; },
                    };
                },
                async batch() { calls.batch += 1; },
            },
        },
    };
}

function openReadonly(file) {
    let last;
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            return new DatabaseSync(file, { readOnly: true });
        } catch (err) {
            last = err;
            if (!/SQLITE_BUSY|database is locked/i.test(String(err))) throw err;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
    }
    throw last;
}

function objectKeys() {
    const dir = path.join(apiRoot, '.wrangler', 'state', 'v3', 'r2', 'miniflare-R2BucketObject');
    if (!existsSync(dir)) return [];
    const keys = [];
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.sqlite') || name === 'metadata.sqlite') continue;
        const db = openReadonly(path.join(dir, name));
        try {
            const rows = db.prepare("SELECT key FROM _mf_objects WHERE key LIKE 'objects/%'").all();
            for (const row of rows) keys.push(row.key);
        } catch (err) {
            if (!/no such table/i.test(String(err))) throw err;
        } finally {
            db.close();
        }
    }
    keys.sort();
    return keys;
}

function traceMessages(needle) {
    const dir = path.join(apiRoot, '.wrangler', 'state', 'v3', 'observability', 'miniflare-wobs-trace-store');
    if (!existsSync(dir)) return [];
    const messages = [];
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.sqlite') || name === 'metadata.sqlite') continue;
        const db = openReadonly(path.join(dir, name));
        try {
            const rows = db.prepare('SELECT message FROM logs WHERE message LIKE ?').all(`%${needle}%`);
            for (const row of rows) messages.push(String(row.message));
        } catch (err) {
            if (!/no such table/i.test(String(err))) throw err;
        } finally {
            db.close();
        }
    }
    return messages;
}

function jsonFrom(text) {
    const start = text.indexOf('[');
    const objectStart = text.indexOf('{');
    const at = start === -1 ? objectStart : objectStart === -1 ? start : Math.min(start, objectStart);
    if (at === -1) throw new Error(text);
    return JSON.parse(text.slice(at));
}

if (process.env.RUN_API_TESTS !== '1') {
    test('truth build', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('truth build', { skip: 'wrangler is absent' }, () => {});
} else {
    test('truth build slice binding calls', async () => {
        const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.0.0' };
        const xml = '<Sector><Name>Wide</Name><X>1</X><Y>2</Y></Sector>\n';
        const catalogue = JSON.stringify({
            sectors: [{ slug: 'Wide', name: 'Wide Chart', x: 3, y: 4, tags: ['OTU'], canonical: true }],
        });
        const chained = bindingDouble({ 'inputs/vcount/Wide.tsv': wideTsv(26) });
        await truthBuildConsumer({
            messages: [{
                body: { version: 'vcount', slug: 'Wide', offset: 0, pinned },
                attempts: 1,
                ack() {},
            }],
        }, chained.env);
        assert.deepEqual(chained.calls, { get: 1, put: 26, list: 0, send: 1, batch: 0, run: 1 });
        assert.equal(chained.sent[0].offset, 25);
        const finished = bindingDouble({
            'inputs/vcount/Wide.tsv': wideTsv(1),
            'inputs/vcount/Wide.xml': xml,
            'inputs/vcount/sectors.json': catalogue,
        });
        await truthBuildConsumer({
            messages: [{
                body: { version: 'vcount', slug: 'Wide', offset: 0, pinned },
                attempts: 1,
                ack() {},
            }],
        }, finished.env);
        assert.deepEqual(finished.calls, { get: 4, put: 3, list: 1, send: 0, batch: 1, run: 2 });
    });

    test('dead letter marks a building sector failed and leaves done alone', async () => {
        const db = new DatabaseSync(':memory:');
        db.exec(`CREATE TABLE truth_build_sectors (
            version text NOT NULL,
            sector_slug text NOT NULL,
            state text NOT NULL,
            systems integer NOT NULL DEFAULT 0,
            built integer NOT NULL DEFAULT 0,
            partial integer NOT NULL DEFAULT 0,
            index_hash text,
            error text,
            updated_at text NOT NULL,
            PRIMARY KEY(version, sector_slug)
        )`);
        const insert = db.prepare(`INSERT INTO truth_build_sectors
            (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
            VALUES (?, ?, ?, 0, 0, 0, ?, NULL, ?)`);
        insert.run('vdl', 'Stuck', 'building', null, '2020-01-01T00:00:00.000Z');
        insert.run('vdl', 'Finished', 'done', 'abc', '2020-01-01T00:00:00.000Z');
        db.prepare(`INSERT INTO truth_build_sectors
            (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
            VALUES ('vdl', 'Broken', 'failed', 0, 0, 0, NULL, 'r2 blew up', '2020-01-01T00:00:00.000Z')`).run();
        const acked = [];
        const lines = [];
        const original = console.log;
        console.log = (...args) => { lines.push(args.map(String).join(' ')); };
        try {
            await deadLetterConsumer({
                messages: [
                    { body: { version: 'vdl', slug: 'Stuck', offset: 25 }, ack() { acked.push('Stuck'); } },
                    { body: { version: 'vdl', slug: 'Finished', offset: 0 }, ack() { acked.push('Finished'); } },
                    { body: { version: 'vdl', slug: 'Broken', offset: 50 }, ack() { acked.push('Broken'); } },
                    { body: { kind: 'other' }, ack() { acked.push('other'); } },
                ],
            }, {
                DB: {
                    prepare(sql) {
                        return {
                            bind(...args) {
                                return { async run() { db.prepare(sql).run(...args); } };
                            },
                        };
                    },
                },
            });
        } finally {
            console.log = original;
        }
        const stuck = db.prepare(`SELECT state, error FROM truth_build_sectors WHERE sector_slug = 'Stuck'`).get();
        const finished = db.prepare(`SELECT state, error, index_hash, updated_at FROM truth_build_sectors WHERE sector_slug = 'Finished'`).get();
        const broken = db.prepare(`SELECT state, error, updated_at FROM truth_build_sectors WHERE sector_slug = 'Broken'`).get();
        assert.equal(stuck.state, 'failed');
        assert.equal(stuck.error, 'dead-lettered: the invocation died without throwing; see Workers Logs');
        assert.equal(finished.state, 'done');
        assert.equal(finished.error, null);
        assert.equal(finished.index_hash, 'abc');
        assert.equal(finished.updated_at, '2020-01-01T00:00:00.000Z');
        assert.equal(broken.state, 'failed');
        assert.equal(broken.error, 'r2 blew up');
        assert.equal(broken.updated_at, '2020-01-01T00:00:00.000Z');
        assert.deepEqual(acked, ['Stuck', 'Finished', 'Broken', 'other']);
        const logged = lines.filter((line) => line.includes('"job":"dead-letter"')).map((line) => JSON.parse(line));
        assert.equal(logged.length, 3);
        assert.equal(logged[0].job, 'dead-letter');
        assert.equal(logged[0].slug, 'Stuck');
        assert.equal(logged[0].offset, 25);
        assert.equal(logged[1].slug, 'Finished');
    });

    test('dead letter failure starts the next queued sector', async () => {
        const db = new DatabaseSync(':memory:');
        db.exec(`CREATE TABLE truth_build_sectors (
            version text NOT NULL,
            sector_slug text NOT NULL,
            state text NOT NULL,
            systems integer NOT NULL DEFAULT 0,
            built integer NOT NULL DEFAULT 0,
            partial integer NOT NULL DEFAULT 0,
            index_hash text,
            error text,
            updated_at text NOT NULL,
            PRIMARY KEY(version, sector_slug)
        )`);
        db.exec(`CREATE TABLE truth_versions (
            version text PRIMARY KEY,
            seed text NOT NULL,
            settings text NOT NULL,
            engine_version text NOT NULL,
            derived_from text
        )`);
        const insert = db.prepare(`INSERT INTO truth_build_sectors
            (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
            VALUES (?, ?, ?, 0, 0, 0, NULL, NULL, ?)`);
        insert.run('vdl', 'Current', 'building', '2020-01-01T00:00:00.000Z');
        insert.run('vdl', 'Alpha', 'queued', '2020-01-01T00:00:00.000Z');
        insert.run('vdl', 'Later', 'queued', '2020-01-01T00:00:00.000Z');
        db.prepare(`INSERT INTO truth_versions (version, seed, settings, engine_version) VALUES ('vdl', 'from-row', '{"generationPopMax":20}', '1.0.0')`).run();
        const sent = [];
        const pinned = { seed: 'from-body', settings: { generationPopMax: 20 }, engineVersion: '1.0.0' };
        const database = {
            prepare(sql) {
                return {
                    bind(...args) {
                        return {
                            async run() {
                                const statement = db.prepare(sql);
                                if (/returning/i.test(sql)) {
                                    const results = statement.all(...args);
                                    return { results, meta: { changes: results.length } };
                                }
                                const info = statement.run(...args);
                                return { results: [], meta: { changes: info.changes } };
                            },
                            async first() {
                                return db.prepare(sql).get(...args);
                            },
                        };
                    },
                };
            },
        };
        await deadLetterConsumer({
            messages: [{
                body: { version: 'vdl', slug: 'Current', offset: 0, pinned },
                ack() {},
            }],
        }, { DB: database, TRUTH_QUEUE: { async send(body) { sent.push(body); } } });
        assert.equal(db.prepare(`SELECT state FROM truth_build_sectors WHERE sector_slug = 'Current'`).get().state, 'failed');
        assert.equal(db.prepare(`SELECT state FROM truth_build_sectors WHERE sector_slug = 'Alpha'`).get().state, 'building');
        assert.equal(db.prepare(`SELECT state FROM truth_build_sectors WHERE sector_slug = 'Later'`).get().state, 'queued');
        assert.equal(sent.length, 1);
        assert.equal(sent[0].slug, 'Alpha');
        assert.equal(sent[0].offset, 0);
        assert.equal(sent[0].pinned.seed, 'from-body');
        insert.run('vdl', 'Next', 'building', '2020-01-01T00:00:00.000Z');
        await deadLetterConsumer({
            messages: [{
                body: { version: 'vdl', slug: 'Next', offset: 4 },
                ack() {},
            }],
        }, { DB: database, TRUTH_QUEUE: { async send(body) { sent.push(body); } } });
        assert.equal(db.prepare(`SELECT state FROM truth_build_sectors WHERE sector_slug = 'Later'`).get().state, 'building');
        assert.equal(sent.length, 2);
        assert.equal(sent[1].slug, 'Later');
        assert.equal(sent[1].offset, 0);
        assert.equal(sent[1].pinned.seed, 'from-row');
        assert.equal(sent[1].pinned.settings.generationPopMax, 20);
        assert.equal(sent[1].pinned.engineVersion, '1.0.0');
        assert.equal(sent[0].from, undefined);
        assert.equal(sent[1].from, undefined);
        db.prepare(`UPDATE truth_versions SET derived_from = 'vsource' WHERE version = 'vdl'`).run();
        insert.run('vdl', 'Derived', 'building', '2020-01-01T00:00:00.000Z');
        insert.run('vdl', 'After', 'queued', '2020-01-01T00:00:00.000Z');
        await deadLetterConsumer({
            messages: [{
                body: { version: 'vdl', slug: 'Derived', offset: 0, pinned },
                ack() {},
            }],
        }, { DB: database, TRUTH_QUEUE: { async send(body) { sent.push(body); } } });
        assert.equal(sent.length, 3);
        assert.equal(sent[2].slug, 'After');
        assert.equal(sent[2].offset, 0);
        assert.equal(sent[2].from, 'vsource');
        insert.run('vdl', 'Explicit', 'building', '2020-01-01T00:00:00.000Z');
        insert.run('vdl', 'Last', 'queued', '2020-01-01T00:00:00.000Z');
        await deadLetterConsumer({
            messages: [{
                body: { version: 'vdl', slug: 'Explicit', offset: 0, from: 'vexplicit', pinned },
                ack() {},
            }],
        }, { DB: database, TRUTH_QUEUE: { async send(body) { sent.push(body); } } });
        assert.equal(sent[3].slug, 'Last');
        assert.equal(sent[3].from, 'vexplicit');
    });

    test('derived sector binding calls', async () => {
        const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.0.0' };
        const xml = '<Sector><Name>Wide</Name><X>1</X><Y>2</Y></Sector>\n';
        const catalogue = JSON.stringify({
            sectors: [{ slug: 'Wide', name: 'Wide Chart', x: 3, y: 4, tags: ['OTU'], canonical: true }],
        });
        const hexes = {
            '1910': {
                tree: 'abc', type: 'SYSTEM_PRESENT', name: 'Regina', uwp: 'A788899-C',
                allegiance: 'Im', zone: '', bases: '', tradeCodes: [], pbg: '100', ix: 1, partial: null,
            },
        };
        const source = JSON.stringify({ hexes });
        const alone = bindingDouble({
            'truth/vsource/sectors/Wide/index.json': source,
            'inputs/vderived/Wide.xml': xml,
            'inputs/vderived/sectors.json': catalogue,
        });
        await truthBuildConsumer({
            messages: [{
                body: { version: 'vderived', slug: 'Wide', from: 'vsource', pinned },
                attempts: 1,
                ack() {},
            }],
        }, alone.env);
        assert.deepEqual(alone.calls, { get: 3, put: 1, list: 0, send: 0, batch: 1, run: 1 });
        assert.deepEqual(alone.puts.filter((key) => key.startsWith('objects/')), []);
        assert.equal(alone.puts[0], 'truth/vderived/sectors/Wide/index.json');
        const written = await alone.env.PUBLIC_BUCKET.get('truth/vderived/sectors/Wide/index.json');
        const index = JSON.parse(await written.text());
        assert.equal(index.truthVersion, 'vderived');
        assert.deepEqual(index.hexes, hexes);

        const db = new DatabaseSync(':memory:');
        db.exec(`CREATE TABLE truth_build_sectors (
            version text NOT NULL,
            sector_slug text NOT NULL,
            state text NOT NULL,
            systems integer NOT NULL DEFAULT 0,
            built integer NOT NULL DEFAULT 0,
            partial integer NOT NULL DEFAULT 0,
            index_hash text,
            error text,
            updated_at text NOT NULL,
            PRIMARY KEY(version, sector_slug)
        )`);
        db.prepare(`INSERT INTO truth_build_sectors
            (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
            VALUES ('vderived', 'Next', 'queued', 0, 0, 0, NULL, NULL, '2020-01-01T00:00:00.000Z')`).run();
        const calls = { get: 0, put: 0, list: 0, send: 0, batch: 0, run: 0 };
        const sent = [];
        const puts = [];
        const files = new Map([
            ['truth/vsource/sectors/Wide/index.json', source],
            ['inputs/vderived/Wide.xml', xml],
            ['inputs/vderived/sectors.json', catalogue],
        ]);
        const bucket = () => ({
            async get(key) {
                calls.get += 1;
                const value = files.get(key);
                if (value == null) return null;
                return { text: async () => value };
            },
            async put(key, body) {
                calls.put += 1;
                puts.push(key);
                files.set(key, String(body));
            },
            async list() {
                calls.list += 1;
                return { objects: [], truncated: false };
            },
        });
        await truthBuildConsumer({
            messages: [{
                body: { version: 'vderived', slug: 'Wide', from: 'vsource', pinned },
                attempts: 1,
                ack() {},
            }],
        }, {
            PRIVATE_BUCKET: bucket(),
            PUBLIC_BUCKET: bucket(),
            TRUTH_QUEUE: { async send(body) { calls.send += 1; sent.push(body); } },
            DB: {
                prepare(sql) {
                    return {
                        bind(...args) {
                            return {
                                async run() {
                                    calls.run += 1;
                                    const statement = db.prepare(sql);
                                    if (/returning/i.test(sql)) {
                                        const results = statement.all(...args);
                                        return { results, meta: { changes: results.length } };
                                    }
                                    statement.run(...args);
                                    return { results: [], meta: { changes: 0 } };
                                },
                            };
                        },
                    };
                },
                async batch() { calls.batch += 1; },
            },
        });
        assert.deepEqual(calls, { get: 3, put: 1, list: 0, send: 1, batch: 1, run: 1 });
        assert.deepEqual(puts.filter((key) => key.startsWith('objects/')), []);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].version, 'vderived');
        assert.equal(sent[0].slug, 'Next');
        assert.equal(sent[0].offset, 0);
        assert.equal(sent[0].from, 'vsource');
    });

    test('a failed derived delivery carries from to the next sector', async () => {
        const db = new DatabaseSync(':memory:');
        db.exec(`CREATE TABLE truth_build_sectors (
            version text NOT NULL,
            sector_slug text NOT NULL,
            state text NOT NULL,
            systems integer NOT NULL DEFAULT 0,
            built integer NOT NULL DEFAULT 0,
            partial integer NOT NULL DEFAULT 0,
            index_hash text,
            error text,
            updated_at text NOT NULL,
            PRIMARY KEY(version, sector_slug)
        )`);
        const now = '2020-01-01T00:00:00.000Z';
        db.prepare(`INSERT INTO truth_build_sectors
            (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
            VALUES (?, ?, 'building', 0, 0, 0, NULL, NULL, ?)`).run('vder', 'Current', now);
        db.prepare(`INSERT INTO truth_build_sectors
            (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
            VALUES (?, ?, 'queued', 0, 0, 0, NULL, NULL, ?)`).run('vder', 'Next', now);
        const sent = [];
        const database = {
            prepare(sql) {
                return {
                    bind(...args) {
                        return {
                            async run() {
                                const statement = db.prepare(sql);
                                if (/returning/i.test(sql)) {
                                    const results = statement.all(...args);
                                    return { results, meta: { changes: results.length } };
                                }
                                const info = statement.run(...args);
                                return { results: [], meta: { changes: info.changes } };
                            },
                        };
                    },
                };
            },
        };
        const pinned = { seed: 's', settings: { generationPopMax: 20 }, engineVersion: '1.0.0' };
        await assert.rejects(() => truthBuildConsumer({
            messages: [{
                body: { version: 'vder', slug: 'Current', from: 'vsource', pinned },
                attempts: 4,
                ack() {},
            }],
        }, {
            DB: database,
            TRUTH_QUEUE: { async send(body) { sent.push(body); } },
            PUBLIC_BUCKET: { async get() { return null; } },
            PRIVATE_BUCKET: { async get() { return null; } },
        }));
        assert.equal(db.prepare(`SELECT state FROM truth_build_sectors WHERE sector_slug = 'Current'`).get().state, 'failed');
        assert.equal(sent.length, 1);
        assert.equal(sent[0].slug, 'Next');
        assert.equal(sent[0].offset, 0);
        assert.equal(sent[0].from, 'vsource');
    });

    test('a derived sector reads xml and the catalogue from the source version', async () => {
        const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.0.0' };
        const xml = '<Sector><Name>Wide</Name><X>1</X><Y>2</Y></Sector>\n';
        const catalogue = JSON.stringify({
            sectors: [{ slug: 'Wide', name: 'Wide Chart', x: 3, y: 4, tags: ['OTU'], canonical: false }],
        });
        const hexes = {
            '1910': {
                tree: 'abc', type: 'SYSTEM_PRESENT', name: 'Regina', uwp: 'A788899-C',
                allegiance: 'Im', zone: '', bases: '', tradeCodes: [], pbg: '100', ix: 1, partial: null,
            },
        };
        const alone = bindingDouble({
            'truth/vsource/sectors/Wide/index.json': JSON.stringify({ hexes }),
            'inputs/vsource/Wide.xml': xml,
            'inputs/vsource/sectors.json': catalogue,
        });
        await truthBuildConsumer({
            messages: [{
                body: { version: 'vplain', slug: 'Wide', from: 'vsource', pinned },
                attempts: 1,
                ack() {},
            }],
        }, alone.env);
        assert.equal(alone.calls.get, 4);
        assert.deepEqual(alone.puts, ['truth/vplain/sectors/Wide/index.json']);
        const written = await alone.env.PUBLIC_BUCKET.get('truth/vplain/sectors/Wide/index.json');
        const index = JSON.parse(await written.text());
        assert.equal(index.name, 'Wide Chart');
        assert.equal(index.x, 3);
        assert.equal(index.y, 4);
        assert.equal(index.canonical, false);
        assert.deepEqual(index.hexes, hexes);
    });

    test('reconcile transform reuses an unchanged object and resumes a slice', async () => {
        const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.0.0' };
        const live = await reconciliationDigests();
        const provenance = stable(await provenanceDocument('vsource', '1.0.0'));
        const xml = '<Sector><Name>Wide</Name><X>1</X><Y>2</Y></Sector>\n';
        const catalogue = JSON.stringify({
            sectors: [{ slug: 'Wide', name: 'Wide Chart', x: 3, y: 4, tags: ['OTU'], canonical: true }],
        });
        const bare = stable({ kind: 'tree', engineVersion: '1.0.0', hexKey: '0101', body: { name: 'Bare' } });
        const bareHash = await sha256Hex(bare);
        const world = stable({
            kind: 'tree',
            engineVersion: '1.0.0',
            hexKey: '0103',
            body: {
                mgtSystem: {
                    hzco: 2,
                    worlds: [{
                        orbitId: 2, meanTempK: 280, lowTempK: 270, highTempK: 290,
                        atmCode: 5, hydroPercent: 40, hydro: 4, hydroCode: 4, liquidType: 'Water',
                    }],
                },
            },
        });
        const worldHash = await sha256Hex(world);
        const source = {
            systems: 3,
            built: 2,
            partial: 1,
            hexes: {
                '0101': chartRow(bareHash, null),
                '0102': chartRow(null, 'full'),
                '0103': chartRow(worldHash, null),
            },
        };
        const files = {
            'truth/vsource/sectors/Wide/index.json': JSON.stringify(source),
            'truth/vreconcile/reconciliation.json': provenance,
            'inputs/vreconcile/Wide.xml': xml,
            'inputs/vreconcile/sectors.json': catalogue,
            [`objects/${bareHash}`]: bare,
            [`objects/${worldHash}`]: world,
        };
        const rejected = bindingDouble(files);
        await assert.rejects(() => truthBuildConsumer({
            messages: [{
                body: {
                    version: 'vreconcile', slug: 'Wide', from: 'vsource', pinned,
                    transform: 'reconcile-environment', policyDigest: 'f'.repeat(64),
                },
                attempts: 1,
                ack() {},
            }],
        }, rejected.env));
        assert.deepEqual(rejected.puts, []);
        const alone = bindingDouble(files);
        await truthBuildConsumer({
            messages: [{
                body: {
                    version: 'vreconcile', slug: 'Wide', from: 'vsource', pinned,
                    transform: 'reconcile-environment', policyDigest: live.policyDigest,
                },
                attempts: 1,
                ack() {},
            }],
        }, alone.env);
        assert.equal(alone.puts.includes(`objects/${bareHash}`), false);
        const written = JSON.parse(await (await alone.env.PUBLIC_BUCKET.get('truth/vreconcile/sectors/Wide/index.json')).text());
        assert.equal(written.hexes['0101'].tree, bareHash);
        assert.equal(written.hexes['0102'].tree, null);
        assert.equal(written.hexes['0102'].partial, 'full');
        assert.notEqual(written.hexes['0103'].tree, worldHash);
        assert.equal(written.systems, 3);
        assert.equal(written.built, 2);
        assert.equal(written.partial, 1);
        assert.equal(alone.puts.includes(`objects/${written.hexes['0103'].tree}`), true);
        const sourceAfter = await alone.env.PUBLIC_BUCKET.get('truth/vsource/sectors/Wide/index.json');
        assert.equal(await sourceAfter.text(), JSON.stringify(source));
        const putsAfter = alone.puts.length;
        await truthBuildConsumer({
            messages: [{
                body: {
                    version: 'vreconcile', slug: 'Wide', offset: 0, from: 'vsource', pinned,
                    transform: 'reconcile-environment', policyDigest: live.policyDigest,
                },
                attempts: 1,
                ack() {},
            }],
        }, alone.env);
        assert.equal(alone.puts.length, putsAfter);
        const many = {};
        const manyFiles = {
            'truth/vslice/reconciliation.json': stable(await provenanceDocument('vsource', '1.0.0')),
            'inputs/vslice/Wide.xml': xml,
            'inputs/vslice/sectors.json': catalogue,
        };
        for (let i = 0; i < 26; i += 1) {
            const hex = String(i + 1).padStart(4, '0');
            const tree = stable({
                kind: 'tree',
                engineVersion: '1.0.0',
                hexKey: hex,
                body: {
                    mgtSystem: {
                        hzco: 2,
                        worlds: [{
                            name: hex, orbitId: 2, meanTempK: 280, lowTempK: 270, highTempK: 290,
                            atmCode: 5, hydroPercent: 40, hydro: 4, hydroCode: 4, liquidType: 'Water',
                        }],
                    },
                },
            });
            const hash = await sha256Hex(tree);
            many[hex] = chartRow(hash, null);
            manyFiles[`objects/${hash}`] = tree;
        }
        manyFiles['truth/vsource/sectors/Wide/index.json'] = JSON.stringify({ systems: 26, built: 26, partial: 0, hexes: many });
        const sliced = bindingDouble(manyFiles);
        await truthBuildConsumer({
            messages: [{
                body: {
                    version: 'vslice', slug: 'Wide', offset: 0, from: 'vsource', pinned,
                    transform: 'reconcile-environment', policyDigest: live.policyDigest,
                },
                attempts: 1,
                ack() {},
            }],
        }, sliced.env);
        assert.equal(sliced.sent.length, 1);
        assert.equal(sliced.sent[0].offset, 25);
        assert.equal(sliced.sent[0].transform, 'reconcile-environment');
        assert.equal(sliced.sent[0].policyDigest, live.policyDigest);
        assert.equal(sliced.puts.includes('truth/vslice/sectors/Wide/index.json'), false);
        const objectPuts = sliced.puts.filter((key) => key.startsWith('objects/'));
        assert.equal(objectPuts.length, 25);
        await truthBuildConsumer({
            messages: [{
                body: sliced.sent[0],
                attempts: 1,
                ack() {},
            }],
        }, sliced.env);
        assert.equal(sliced.puts.includes('truth/vslice/sectors/Wide/index.json'), true);
        const finished = JSON.parse(await (await sliced.env.PUBLIC_BUCKET.get('truth/vslice/sectors/Wide/index.json')).text());
        assert.equal(Object.keys(finished.hexes).length, 26);
        const putsAtFinish = sliced.puts.length;
        await truthBuildConsumer({
            messages: [{
                body: {
                    version: 'vslice', slug: 'Wide', offset: 0, from: 'vsource', pinned,
                    transform: 'reconcile-environment', policyDigest: live.policyDigest,
                },
                attempts: 1,
                ack() {},
            }],
        }, sliced.env);
        assert.equal(sliced.puts.length, putsAtFinish);
        assert.equal(await (await sliced.env.PUBLIC_BUCKET.get('truth/vsource/sectors/Wide/index.json')).text(), manyFiles['truth/vsource/sectors/Wide/index.json']);
    });

    test('truth build', { timeout: 600000 }, async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'voyage-truth-'));
        const tsv = path.join(dir, 'Fixture.tsv');
        const xml = path.join(dir, 'Fixture.xml');
        const catalogue = path.join(dir, 'sectors.json');
        writeFileSync(tsv, `${TSV}\n${SURVEY}`);
        writeFileSync(xml, XML);
        writeFileSync(catalogue, JSON.stringify(CATALOGUE));
        await withDevServer(async (base) => {
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vtest/Fixture.tsv', '--file', tsv, '--local']);
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vtest/Fixture.xml', '--file', xml, '--local']);
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vtest/sectors.json', '--file', catalogue, '--local']);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_systems WHERE version = 'vtest'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vtest'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_versions WHERE version = 'vtest'"]);
            const cookie = adminCookie();
            const posted = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vtest',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                }),
            });
            const postedBody = await posted.json();
            assert.equal(posted.status, 202, JSON.stringify(postedBody));
            assert.equal(postedBody.data.enqueued, 1);
            let build;
            const deadline = Date.now() + 90000;
            while (Date.now() < deadline) {
                const response = await fetch(`${base}/api/admin/truth/builds/vtest`, { headers: { cookie } });
                build = await response.json();
                assert.equal(response.status, 200, JSON.stringify(build));
                const sector = build.data.sectors.find((item) => item.slug === 'Fixture');
                if (sector && sector.state === 'failed') throw new Error(JSON.stringify(build));
                if (build.data.sectorsDone === 1) break;
                await sleep(1000);
            }
            assert.equal(build.data.sectorsDone, 1, JSON.stringify(build));
            const sector = build.data.sectors.find((item) => item.slug === 'Fixture');
            assert.equal(sector.built, 2);
            assert.equal(sector.partial, 1);
            const indexFile = path.join(dir, 'index.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/sectors/Fixture/index.json', '--file', indexFile, '--local']);
            const index = JSON.parse(readFileSync(indexFile, 'utf8'));
            SectorIndex.parse(index);
            assert.deepEqual(index.territories, []);
            assert.equal(index.name, 'Chart Fixture');
            assert.equal(index.x, 4);
            assert.equal(index.y, -1);
            assert.deepEqual(index.tags, ['OTU']);
            assert.equal(index.canonical, true);
            const hexes = index.hexes || {};
            assert.equal(hexes['1911'].tree, null);
            assert.equal(hexes['1911'].partial, 'full');
            const hash = Object.values(hexes).map((row) => row && row.tree).find((value) => typeof value === 'string');
            assert.equal(typeof hash, 'string');
            const objectFile = path.join(dir, 'object.json');
            runWrangler(['r2', 'object', 'get', `voyage-public/objects/${hash}`, '--file', objectFile, '--local']);
            assert.ok(readFileSync(objectFile, 'utf8').length > 0);
            const counted = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT COUNT(*) AS n FROM truth_systems WHERE version = 'vtest'",
            ]));
            assert.equal(Number(counted[0].results[0].n), 3);
            const survey = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT partial, tree_hash FROM truth_systems WHERE version = 'vtest' AND hex = '1911'",
            ]));
            assert.equal(survey[0].results[0].partial, 'full');
            assert.equal(survey[0].results[0].tree_hash, null);
            const beforeRetry = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT index_hash FROM truth_build_sectors WHERE version = 'vtest' AND sector_slug = 'Fixture'",
            ]));
            const indexHash = beforeRetry[0].results[0].index_hash;
            assert.equal(typeof indexHash, 'string');
            runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "UPDATE truth_build_sectors SET state = 'failed', error = 'injected' WHERE version = 'vtest' AND sector_slug = 'Fixture'",
            ]);
            const retried = await fetch(`${base}/api/admin/truth/builds/vtest/retry`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({}),
            });
            const retriedBody = await retried.json();
            assert.equal(retried.status, 202, JSON.stringify(retriedBody));
            assert.equal(retriedBody.data.version, 'vtest');
            assert.equal(retriedBody.data.enqueued, 1);
            let retriedBuild;
            const retryDeadline = Date.now() + 90000;
            while (Date.now() < retryDeadline) {
                const response = await fetch(`${base}/api/admin/truth/builds/vtest`, { headers: { cookie } });
                retriedBuild = await response.json();
                assert.equal(response.status, 200, JSON.stringify(retriedBuild));
                const again = retriedBuild.data.sectors.find((item) => item.slug === 'Fixture');
                if (again && again.state === 'failed') throw new Error(JSON.stringify(retriedBuild));
                if (retriedBuild.data.sectorsDone === 1 && again && again.state === 'done') break;
                await sleep(1000);
            }
            assert.equal(retriedBuild.data.sectorsDone, 1, JSON.stringify(retriedBuild));
            const afterRetry = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT state, index_hash FROM truth_build_sectors WHERE version = 'vtest' AND sector_slug = 'Fixture'",
            ]));
            assert.equal(afterRetry[0].results[0].state, 'done');
            assert.equal(afterRetry[0].results[0].index_hash, indexHash);
            const released = await fetch(`${base}/api/admin/truth/release/vtest`, {
                method: 'POST',
                headers: { cookie },
            });
            const releasedBody = await released.json();
            assert.equal(released.status, 200, JSON.stringify(releasedBody));
            const manifestFile = path.join(dir, 'manifest.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/manifest.json', '--file', manifestFile, '--local']);
            const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
            const manifestParsed = TruthManifest.safeParse(manifest);
            assert.equal(manifestParsed.success, true, JSON.stringify(manifestParsed.success ? null : manifestParsed.error.issues[0]));
            assert.equal(manifest.attribution, ATTRIBUTION);
            const overviewFile = path.join(dir, 'overview.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/overview.json', '--file', overviewFile, '--local']);
            const overviewText = readFileSync(overviewFile, 'utf8');
            const overview = JSON.parse(overviewText);
            const overviewParsed = TruthOverview.safeParse(overview);
            assert.equal(overviewParsed.success, true, JSON.stringify(overviewParsed.success ? null : overviewParsed.error.issues[0]));
            assert.equal(overview.sectors.length, 1);
            assert.equal(overview.sectors[0].cells.length, 1280);
            for (const hex of ['1910', '1911', '1912']) {
                const at = (Number(hex.slice(0, 2)) - 1) * 40 + (Number(hex.slice(2, 4)) - 1);
                assert.notEqual(overview.sectors[0].cells[at], '.');
            }
            assert.equal(manifest.overviewHash, await sha256Hex(overviewText));
            const politiesFile = path.join(dir, 'polities.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/polities.json', '--file', politiesFile, '--local']);
            const politiesText = readFileSync(politiesFile, 'utf8');
            const politiesParsed = TruthPolities.safeParse(JSON.parse(politiesText));
            assert.equal(politiesParsed.success, true, JSON.stringify(politiesParsed.success ? null : politiesParsed.error.issues[0]));
            assert.equal(manifest.politiesHash, await sha256Hex(politiesText));
            assert.equal(typeof manifest.releasedAt, 'string');
            assert.ok(manifest.releasedAt.length > 0);
            const fixture = manifest.sectors.find((item) => item.slug === 'Fixture');
            assert.equal(fixture.systems, 3);
            assert.equal(fixture.built, 2);
            assert.equal(fixture.partial, 1);
            const state = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT state FROM truth_versions WHERE version = 'vtest'",
            ]));
            assert.equal(state[0].results[0].state, 'released');
            const refused = await fetch(`${base}/api/admin/truth/builds/vtest/retry`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({}),
            });
            const refusedBody = await refused.json();
            assert.equal(refused.status, 409, JSON.stringify(refusedBody));
            const versions = await fetch(`${base}/api/truth/versions`);
            const versionsBody = await versions.json();
            assert.equal(versions.status, 200, JSON.stringify(versionsBody));
            const listed = versionsBody.data.find((item) => item.version === 'vtest');
            assert.ok(listed);
            assert.equal(listed.state, 'released');
            assert.equal(listed.settings.generationPopMax, 20);
            assert.deepEqual(listed.sectors, ['Fixture']);
            const absent = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Rhylanor')}&version=vtest`);
            const absentBody = await absent.json();
            assert.equal(absent.status, 200, JSON.stringify(absentBody));
            assert.equal(absentBody.data.items.length, 0);
            const found = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Regina')}&version=vtest`);
            const foundBody = await found.json();
            assert.equal(found.status, 200, JSON.stringify(foundBody));
            assert.equal(foundBody.data.items.length, 1);
            assert.equal(foundBody.data.items[0].name, 'Regina');
            const prefix = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Regi')}&version=vtest`);
            const prefixBody = await prefix.json();
            assert.equal(prefix.status, 200, JSON.stringify(prefixBody));
            assert.equal(prefixBody.data.items.length, 1);
            assert.equal(prefixBody.data.items[0].name, 'Regina');
            const tokens = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Regina 191')}&version=vtest`);
            const tokensBody = await tokens.json();
            assert.equal(tokens.status, 200, JSON.stringify(tokensBody));
            assert.equal(tokensBody.data.items.length, 1);
            assert.equal(tokensBody.data.items[0].name, 'Regina');
            assert.equal(tokensBody.data.items[0].hex, '1910');

            const missingSource = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vmissingfrom',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                    from: 'vdoesnotexist',
                }),
            });
            const missingSourceBody = await missingSource.json();
            assert.equal(missingSource.status, 404, JSON.stringify(missingSourceBody));
            const changed = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vderivedbad',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS, generationPopMax: 19 },
                    sectors: 'all',
                    from: 'vtest',
                }),
            });
            const changedBody = await changed.json();
            assert.equal(changed.status, 409, JSON.stringify(changedBody));
            assert.match(changedBody.error.message, /\bsettings\b/);
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vderived/Fixture.tsv', '--file', tsv, '--local']);
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vderived/Fixture.xml', '--file', xml, '--local']);
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vderived/sectors.json', '--file', catalogue, '--local']);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_systems WHERE version = 'vderived'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vderived'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_versions WHERE version = 'vderived'"]);
            const objectsBefore = objectKeys();
            const derivedPosted = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vderived',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                    from: 'vtest',
                }),
            });
            const derivedPostedBody = await derivedPosted.json();
            assert.equal(derivedPosted.status, 202, JSON.stringify(derivedPostedBody));
            assert.equal(derivedPostedBody.data.enqueued, 1);
            let derivedBuild;
            const derivedDeadline = Date.now() + 90000;
            while (Date.now() < derivedDeadline) {
                const response = await fetch(`${base}/api/admin/truth/builds/vderived`, { headers: { cookie } });
                derivedBuild = await response.json();
                assert.equal(response.status, 200, JSON.stringify(derivedBuild));
                const sector = derivedBuild.data.sectors.find((item) => item.slug === 'Fixture');
                if (sector && sector.state === 'failed') throw new Error(JSON.stringify(derivedBuild));
                if (derivedBuild.data.sectorsDone === 1) break;
                await sleep(1000);
            }
            assert.equal(derivedBuild.data.sectorsDone, 1, JSON.stringify(derivedBuild));
            for (const sector of derivedBuild.data.sectors) assert.equal(sector.state, 'done', JSON.stringify(sector));
            const derivedIndexFile = path.join(dir, 'derived-index.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vderived/sectors/Fixture/index.json', '--file', derivedIndexFile, '--local']);
            const derivedIndex = JSON.parse(readFileSync(derivedIndexFile, 'utf8'));
            assert.equal(derivedIndex.truthVersion, 'vderived');
            assert.deepEqual(derivedIndex.hexes, index.hexes);
            const derivedRows = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT COUNT(*) AS n FROM truth_systems WHERE version = 'vderived'",
            ]));
            assert.equal(Number(derivedRows[0].results[0].n), 3);
            assert.deepEqual(objectKeys(), objectsBefore);
            const derivedLogsBefore = traceMessages('truth-derive').length;
            runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "UPDATE truth_build_sectors SET state = 'failed', error = 'injected' WHERE version = 'vderived' AND sector_slug = 'Fixture'",
            ]);
            const derivedRetried = await fetch(`${base}/api/admin/truth/builds/vderived/retry`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({ sectors: ['Fixture'] }),
            });
            const derivedRetriedBody = await derivedRetried.json();
            assert.equal(derivedRetried.status, 202, JSON.stringify(derivedRetriedBody));
            assert.equal(derivedRetriedBody.data.enqueued, 1);
            let derivedAgain;
            const derivedRetryDeadline = Date.now() + 90000;
            while (Date.now() < derivedRetryDeadline) {
                const logged = traceMessages('truth-derive');
                const response = await fetch(`${base}/api/admin/truth/builds/vderived`, { headers: { cookie } });
                derivedAgain = await response.json();
                const sector = derivedAgain.data.sectors.find((item) => item.slug === 'Fixture');
                if (sector && sector.state === 'failed') throw new Error(JSON.stringify(derivedAgain));
                if (derivedAgain.data.sectorsDone === 1 && sector && sector.state === 'done' && logged.length > derivedLogsBefore) break;
                await sleep(1000);
            }
            assert.equal(derivedAgain.data.sectorsDone, 1, JSON.stringify(derivedAgain));
            const retryLogs = traceMessages('truth-derive').slice(derivedLogsBefore);
            assert.ok(retryLogs.some((line) => line.includes('vtest')), JSON.stringify(retryLogs));
            assert.deepEqual(objectKeys(), objectsBefore);

            const sourceIndexBytes = readFileSync(indexFile, 'utf8');
            const sourceRowBefore = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT state, engine_version, seed, derived_from, manifest_hash FROM truth_versions WHERE version = 'vtest'",
            ]));
            const transformMissingFrom = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vreconcilebad',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                    transform: 'reconcile-environment',
                }),
            });
            assert.equal(transformMissingFrom.status, 400, JSON.stringify(await transformMissingFrom.json()));
            const transformMismatch = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vreconcilebad',
                    engineVersion: '9.9.9',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                    from: 'vtest',
                    transform: 'reconcile-environment',
                }),
            });
            assert.equal(transformMismatch.status, 409, JSON.stringify(await transformMismatch.json()));
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_systems WHERE version = 'vreconcile'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vreconcile'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_versions WHERE version = 'vreconcile'"]);
            const reconcilePosted = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vreconcile',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                    from: 'vtest',
                    transform: 'reconcile-environment',
                }),
            });
            const reconcilePostedBody = await reconcilePosted.json();
            assert.equal(reconcilePosted.status, 202, JSON.stringify(reconcilePostedBody));
            let reconcileBuild;
            const reconcileDeadline = Date.now() + 90000;
            while (Date.now() < reconcileDeadline) {
                const response = await fetch(`${base}/api/admin/truth/builds/vreconcile`, { headers: { cookie } });
                reconcileBuild = await response.json();
                assert.equal(response.status, 200, JSON.stringify(reconcileBuild));
                const sector = reconcileBuild.data.sectors.find((item) => item.slug === 'Fixture');
                if (sector && sector.state === 'failed') throw new Error(JSON.stringify(reconcileBuild));
                if (reconcileBuild.data.sectorsDone === 1) break;
                await sleep(1000);
            }
            assert.equal(reconcileBuild.data.sectorsDone, 1, JSON.stringify(reconcileBuild));
            assert.equal(reconcileBuild.data.state, 'building');
            assert.equal(reconcileBuild.data.engineVersion, '1.0.0');
            const reconcileIndexFile = path.join(dir, 'reconcile-index.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vreconcile/sectors/Fixture/index.json', '--file', reconcileIndexFile, '--local']);
            const reconcileIndexText = readFileSync(reconcileIndexFile, 'utf8');
            const reconcileIndex = JSON.parse(reconcileIndexText);
            SectorIndex.parse(reconcileIndex);
            const sourceAgainFile = path.join(dir, 'source-again.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/sectors/Fixture/index.json', '--file', sourceAgainFile, '--local']);
            assert.equal(readFileSync(sourceAgainFile, 'utf8'), sourceIndexBytes);
            const sourceRowAfter = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT state, engine_version, seed, derived_from, manifest_hash FROM truth_versions WHERE version = 'vtest'",
            ]));
            assert.deepEqual(sourceRowAfter, sourceRowBefore);
            const reconcileRow = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT state, engine_version, seed, derived_from FROM truth_versions WHERE version = 'vreconcile'",
            ]));
            assert.equal(reconcileRow[0].results[0].state, 'building');
            assert.equal(reconcileRow[0].results[0].engine_version, '1.0.0');
            assert.equal(reconcileRow[0].results[0].seed, TRUTH_SEED);
            assert.equal(reconcileRow[0].results[0].derived_from, 'vtest');
            const provenanceFile = path.join(dir, 'reconciliation.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vreconcile/reconciliation.json', '--file', provenanceFile, '--local']);
            const provenance = JSON.parse(readFileSync(provenanceFile, 'utf8'));
            const live = await reconciliationDigests();
            assert.equal(provenance.transform, 'reconcile-environment');
            assert.equal(provenance.from, 'vtest');
            assert.equal(provenance.policyDigest, live.policyDigest);
            assert.equal(provenance.rulesDigest, live.rulesDigest);
            assert.equal(provenance.engineVersion, '1.0.0');
            assert.equal(provenance.generationProvenance, 'carried');
            const sectorReportFile = path.join(dir, 'reconcile-sector.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vreconcile/reconciliation/sectors/Fixture.json', '--file', sectorReportFile, '--local']);
            const sectorReportText = readFileSync(sectorReportFile, 'utf8');
            const sectorReport = JSON.parse(sectorReportText);
            const totalReportFile = path.join(dir, 'reconcile-report.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vreconcile/reconciliation/report.json', '--file', totalReportFile, '--local']);
            const totalReport = JSON.parse(readFileSync(totalReportFile, 'utf8'));
            const expected = emptyReport();
            const sourceIndex = JSON.parse(sourceIndexBytes);
            for (const [hex, row] of Object.entries(sourceIndex.hexes)) {
                const next = reconcileIndex.hexes[hex];
                const left = { ...row };
                const right = { ...next };
                delete left.tree;
                delete right.tree;
                assert.deepEqual(right, left);
                if (typeof row.tree !== 'string') {
                    assert.equal(next.tree, row.tree);
                    continue;
                }
                const objectFile = path.join(dir, `source-object-${hex}.json`);
                runWrangler(['r2', 'object', 'get', `voyage-public/objects/${row.tree}`, '--file', objectFile, '--local']);
                const canonical = readFileSync(objectFile, 'utf8');
                const result = reconcileTree(JSON.parse(canonical), environmentPolicy);
                const reconciled = stable(result.tree);
                if (reconciled === canonical) assert.equal(next.tree, row.tree);
                else assert.equal(next.tree, await sha256Hex(reconciled));
                const objectCheck = path.join(dir, `reconciled-object-${hex}.json`);
                runWrangler(['r2', 'object', 'get', `voyage-public/objects/${next.tree}`, '--file', objectCheck, '--local']);
                mergeReports(expected, reportForTree(hex, result));
            }
            assert.equal(reconcileIndex.systems, sourceIndex.systems);
            assert.equal(reconcileIndex.built, sourceIndex.built);
            assert.equal(reconcileIndex.partial, sourceIndex.partial);
            assert.deepEqual(sectorReport.changedByField, expected.changedByField);
            assert.deepEqual(sectorReport.liquidOutcomes, expected.liquidOutcomes);
            assert.deepEqual(sectorReport.diagnosticsByKind, expected.diagnosticsByKind);
            assert.deepEqual(sectorReport.unresolved, expected.unresolved);
            assert.deepEqual(sectorReport.blocking, expected.blocking);
            assert.equal(sectorReport.bodiesSeen, expected.bodiesSeen);
            assert.equal(sectorReport.bodiesChanged, expected.bodiesChanged);
            assert.equal(totalReport.bodiesSeen, expected.bodiesSeen);
            assert.deepEqual(totalReport.liquidOutcomes, expected.liquidOutcomes);
            assert.deepEqual(totalReport.sectors, ['Fixture']);
            const reconcileObjects = objectKeys();
            const reconcileLogsBefore = traceMessages('truth-derive').length;
            const reconcileRetried = await fetch(`${base}/api/admin/truth/builds/vreconcile/retry`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({ sectors: ['Fixture'] }),
            });
            const reconcileRetriedBody = await reconcileRetried.json();
            assert.equal(reconcileRetried.status, 202, JSON.stringify(reconcileRetriedBody));
            let reconcileAgain;
            const reconcileRetryDeadline = Date.now() + 90000;
            while (Date.now() < reconcileRetryDeadline) {
                const logged = traceMessages('truth-derive');
                const response = await fetch(`${base}/api/admin/truth/builds/vreconcile`, { headers: { cookie } });
                reconcileAgain = await response.json();
                const sector = reconcileAgain.data.sectors.find((item) => item.slug === 'Fixture');
                if (sector && sector.state === 'failed') throw new Error(JSON.stringify(reconcileAgain));
                if (reconcileAgain.data.sectorsDone === 1 && sector && sector.state === 'done' && logged.length > reconcileLogsBefore) break;
                await sleep(1000);
            }
            assert.equal(reconcileAgain.data.state, 'building');
            const reconcileIndexAgain = path.join(dir, 'reconcile-index-again.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vreconcile/sectors/Fixture/index.json', '--file', reconcileIndexAgain, '--local']);
            assert.equal(readFileSync(reconcileIndexAgain, 'utf8'), reconcileIndexText);
            const sectorReportAgain = path.join(dir, 'reconcile-sector-again.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vreconcile/reconciliation/sectors/Fixture.json', '--file', sectorReportAgain, '--local']);
            assert.equal(readFileSync(sectorReportAgain, 'utf8'), sectorReportText);
            assert.deepEqual(objectKeys(), reconcileObjects);
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/sectors/Fixture/index.json', '--file', sourceAgainFile, '--local']);
            assert.equal(readFileSync(sourceAgainFile, 'utf8'), sourceIndexBytes);
            const sourceRowFinal = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT state, engine_version, seed, derived_from, manifest_hash FROM truth_versions WHERE version = 'vtest'",
            ]));
            assert.deepEqual(sourceRowFinal, sourceRowBefore);

            const wideTsvFile = path.join(dir, 'Wide.tsv');
            const wideXmlFile = path.join(dir, 'Wide.xml');
            const wideCatalogueFile = path.join(dir, 'wide-sectors.json');
            writeFileSync(wideTsvFile, wideTsv(450));
            writeFileSync(wideXmlFile, '<Sector><Name>Wide</Name><X>1</X><Y>2</Y></Sector>\n');
            writeFileSync(wideCatalogueFile, JSON.stringify({
                milieu: 'M1105',
                sectors: [{ slug: 'Wide', name: 'Wide Chart', abbreviation: 'Wd', x: 8, y: 3, tags: ['OTU'], canonical: false }],
            }));
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vwide/Wide.tsv', '--file', wideTsvFile, '--local']);
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vwide/Wide.xml', '--file', wideXmlFile, '--local']);
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vwide/sectors.json', '--file', wideCatalogueFile, '--local']);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_systems WHERE version = 'vwide'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vwide'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_versions WHERE version = 'vwide'"]);
            const widePosted = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vwide',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: ['Wide'],
                }),
            });
            const widePostedBody = await widePosted.json();
            assert.equal(widePosted.status, 202, JSON.stringify(widePostedBody));
            assert.deepEqual(widePostedBody.data.sectors, ['Wide']);
            let wideBuild;
            const wideDeadline = Date.now() + 300000;
            while (Date.now() < wideDeadline) {
                const response = await fetch(`${base}/api/admin/truth/builds/vwide`, { headers: { cookie } });
                wideBuild = await response.json();
                assert.equal(response.status, 200, JSON.stringify(wideBuild));
                const sector = wideBuild.data.sectors.find((item) => item.slug === 'Wide');
                if (sector && sector.state === 'failed') {
                    const err = jsonFrom(runWrangler([
                        'd1', 'execute', 'voyage', '--local', '--command',
                        "SELECT error FROM truth_build_sectors WHERE version = 'vwide' AND sector_slug = 'Wide'",
                    ]));
                    throw new Error(JSON.stringify(err));
                }
                if (wideBuild.data.sectorsDone === 1) break;
                await sleep(1000);
            }
            assert.equal(wideBuild.data.sectorsDone, 1, JSON.stringify(wideBuild));
            assert.equal(wideBuild.data.sectorsFailed, 0);
            const wideSector = wideBuild.data.sectors.find((item) => item.slug === 'Wide');
            assert.equal(wideSector.state, 'done');
            assert.equal(wideSector.built, 450);
            assert.equal(wideSector.partial, 0);
            const sliceOffsets = [];
            for (let offset = 0; offset < 450; offset += 25) sliceOffsets.push(offset);
            assert.equal(sliceOffsets.length, 18);
            for (const offset of sliceOffsets) {
                const partFile = path.join(dir, `part-${offset}.json`);
                runWrangler(['r2', 'object', 'get', `voyage-private/inputs/vwide/_parts/Wide/${offset}.json`, '--file', partFile, '--local']);
                const part = JSON.parse(readFileSync(partFile, 'utf8'));
                assert.equal(part.offset, offset);
                assert.equal(part.total, 450);
                assert.equal(part.rows.length, 25);
            }
            const wideIndexFile = path.join(dir, 'wide-index.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vwide/sectors/Wide/index.json', '--file', wideIndexFile, '--local']);
            const wideIndex = JSON.parse(readFileSync(wideIndexFile, 'utf8'));
            const wideParsed = SectorIndex.safeParse(wideIndex);
            assert.equal(wideParsed.success, true, JSON.stringify(wideParsed.success ? null : wideParsed.error.issues[0]));
            for (const entry of Object.values(wideIndex.hexes)) assert.equal(Object.hasOwn(entry, 'summary'), false);
            assert.equal(wideIndex.truthVersion, 'vwide');
            assert.equal(Object.keys(wideIndex.hexes).length, 450);
            const wideRows = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT COUNT(*) AS n FROM truth_systems WHERE version = 'vwide'",
            ]));
            assert.equal(Number(wideRows[0].results[0].n), 450);
            const wideRecord = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT state, systems, built, partial FROM truth_build_sectors WHERE version = 'vwide'",
            ]));
            assert.equal(wideRecord[0].results.length, 1);
            assert.equal(wideRecord[0].results[0].state, 'done');
            assert.equal(wideRecord[0].results[0].systems, 450);
            assert.equal(wideRecord[0].results[0].built, 450);
            assert.equal(wideRecord[0].results[0].partial, 0);
            const unreleased = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vfromwide',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                    from: 'vwide',
                }),
            });
            const unreleasedBody = await unreleased.json();
            assert.equal(unreleased.status, 409, JSON.stringify(unreleasedBody));
            const staleAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
            const freshAt = new Date().toISOString();
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vwide' AND sector_slug IN ('Stale', 'Fresh', 'Queued')"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at) VALUES ('vwide', 'Stale', 'building', 0, 0, 0, NULL, NULL, '${staleAt}')`]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at) VALUES ('vwide', 'Fresh', 'building', 0, 0, 0, NULL, NULL, '${freshAt}')`]);
            const queuedAt = '2020-01-01T00:00:00.000Z';
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at) VALUES ('vwide', 'Queued', 'queued', 0, 0, 0, NULL, NULL, '${queuedAt}')`]);
            const stalled = await fetch(`${base}/api/admin/truth/builds/vwide/retry`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({}),
            });
            const stalledBody = await stalled.json();
            assert.equal(stalled.status, 202, JSON.stringify(stalledBody));
            assert.equal(stalledBody.data.enqueued, 1);
            const picked = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT sector_slug, state, updated_at FROM truth_build_sectors WHERE version = 'vwide' AND sector_slug IN ('Stale', 'Fresh', 'Queued') ORDER BY sector_slug",
            ]));
            const fresh = picked[0].results.find((item) => item.sector_slug === 'Fresh');
            const stale = picked[0].results.find((item) => item.sector_slug === 'Stale');
            const queued = picked[0].results.find((item) => item.sector_slug === 'Queued');
            assert.equal(fresh.updated_at, freshAt);
            assert.equal(fresh.state, 'building');
            assert.notEqual(stale.updated_at, staleAt);
            assert.equal(stale.state, 'building');
            assert.equal(queued.state, 'queued');
            assert.equal(queued.updated_at, queuedAt);
            const hidden = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Regi')}&version=vwide`);
            const hiddenBody = await hidden.json();
            assert.equal(hidden.status, 200, JSON.stringify(hiddenBody));
            assert.equal(hiddenBody.data.items.length, 0);
            const releasedOnly = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Regi')}`);
            const releasedOnlyBody = await releasedOnly.json();
            assert.equal(releasedOnly.status, 200, JSON.stringify(releasedOnlyBody));
            assert.ok(releasedOnlyBody.data.items.some((item) => item.version === 'vtest' && item.name === 'Regina'));
            assert.equal(releasedOnlyBody.data.items.some((item) => item.version === 'vwide'), false);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_systems WHERE version = 'vrank'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_versions WHERE version = 'vrank'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                "INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, notes, manifest_hash, sectors_total, sectors_done, sectors_failed) VALUES ('vrank', '1.0.0', 'M1105', 'rank', '{}', '[]', 'released', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z', NULL, NULL, 1, 1, '[]')"]);
            for (const [hex, name] of [['1910', 'Regina'], ['1911', 'Regis'], ['1912', 'Reginante'], ['1913', 'New Regina']]) {
                runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                    `INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, allegiance, zone, tree_hash, partial) VALUES ('vrank', 'Rank', '${hex}', '${name}', 'A788899-C', NULL, NULL, NULL, NULL)`]);
            }
            const rankedExact = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('regina')}&version=vrank`);
            const rankedExactBody = await rankedExact.json();
            assert.equal(rankedExact.status, 200, JSON.stringify(rankedExactBody));
            assert.equal(rankedExactBody.data.items[0].name, 'Regina');
            const rankedPrefix = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('reg')}&version=vrank`);
            const rankedPrefixBody = await rankedPrefix.json();
            assert.equal(rankedPrefix.status, 200, JSON.stringify(rankedPrefixBody));
            assert.deepEqual(rankedPrefixBody.data.items.map((item) => item.name), ['Regina', 'Reginante', 'Regis', 'New Regina']);

            const feedSlugs = Array.from({ length: 14 }, (_, index) => `S${String(index + 1).padStart(2, '0')}`);
            const feedCatalogue = path.join(dir, 'feed-sectors.json');
            writeFileSync(feedCatalogue, JSON.stringify({
                milieu: 'M1105',
                sectors: feedSlugs.map((slug, index) => ({ slug, name: slug, x: index, y: 0, tags: [], canonical: false })),
            }));
            runWrangler(['r2', 'object', 'put', 'voyage-private/inputs/vfeed/sectors.json', '--file', feedCatalogue, '--local']);
            for (const slug of feedSlugs) {
                runWrangler(['r2', 'object', 'put', `voyage-private/inputs/vfeed/${slug}.tsv`, '--file', tsv, '--local']);
                runWrangler(['r2', 'object', 'put', `voyage-private/inputs/vfeed/${slug}.xml`, '--file', xml, '--local']);
            }
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_systems WHERE version = 'vfeed'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vfeed'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_versions WHERE version = 'vfeed'"]);
            const feedPosted = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vfeed',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                }),
            });
            const feedPostedBody = await feedPosted.json();
            assert.equal(feedPosted.status, 202, JSON.stringify(feedPostedBody));
            assert.equal(feedPostedBody.data.enqueued, 14);
            const feedEarly = await fetch(`${base}/api/admin/truth/builds/vfeed`, { headers: { cookie } });
            const feedEarlyBody = await feedEarly.json();
            assert.equal(feedEarly.status, 200, JSON.stringify(feedEarlyBody));
            assert.equal(feedEarlyBody.data.sectorsTotal, 14, JSON.stringify(feedEarlyBody));
            assert.equal(feedEarlyBody.data.sectors.length, 14, JSON.stringify(feedEarlyBody));
            const earlyStates = ['queued', 'building', 'done'];
            for (const item of feedEarlyBody.data.sectors) {
                assert.equal(earlyStates.includes(item.state), true, JSON.stringify(item));
            }
            const earlyQueued = feedEarlyBody.data.sectors.filter((item) => item.state === 'queued').length;
            const earlyBuilding = feedEarlyBody.data.sectors.filter((item) => item.state === 'building').length;
            const earlyDone = feedEarlyBody.data.sectors.filter((item) => item.state === 'done').length;
            assert.equal(earlyQueued + earlyBuilding + earlyDone, 14, JSON.stringify(feedEarlyBody));
            assert.equal(feedEarlyBody.data.sectorsQueued, earlyQueued, JSON.stringify(feedEarlyBody));
            assert.equal(feedEarlyBody.data.sectorsDone, earlyDone, JSON.stringify(feedEarlyBody));
            assert.equal(feedEarlyBody.data.sectorsFailed, 0, JSON.stringify(feedEarlyBody));
            let feedBuild;
            const feedDeadline = Date.now() + 180000;
            while (Date.now() < feedDeadline) {
                const response = await fetch(`${base}/api/admin/truth/builds/vfeed`, { headers: { cookie } });
                feedBuild = await response.json();
                assert.equal(response.status, 200, JSON.stringify(feedBuild));
                const failed = feedBuild.data.sectors.find((item) => item.state === 'failed');
                if (failed) throw new Error(JSON.stringify(feedBuild));
                if (feedBuild.data.sectorsDone === 14) break;
                await sleep(1000);
            }
            assert.equal(feedBuild.data.sectorsDone, 14, JSON.stringify(feedBuild));
            assert.equal(feedBuild.data.sectorsQueued, 0);
            assert.equal(feedBuild.data.sectorsFailed, 0);
            for (const sector of feedBuild.data.sectors) assert.equal(sector.state, 'done', JSON.stringify(sector));
        });
    });

    test('a derive with no inputs of its own uses the source inputs', { timeout: 180000 }, async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'voyage-derive-'));
        await withDevServer(async (base) => {
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_systems WHERE version = 'vnoinputs'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vnoinputs'"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_versions WHERE version = 'vnoinputs'"]);
            const cookie = adminCookie();
            const posted = await fetch(`${base}/api/admin/truth/build`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie },
                body: JSON.stringify({
                    milieu: 'M1105',
                    version: 'vnoinputs',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                    from: 'vtest',
                }),
            });
            const postedBody = await posted.json();
            assert.equal(posted.status, 202, JSON.stringify(postedBody));
            assert.equal(postedBody.data.enqueued, 1);
            let build;
            const deadline = Date.now() + 90000;
            while (Date.now() < deadline) {
                const response = await fetch(`${base}/api/admin/truth/builds/vnoinputs`, { headers: { cookie } });
                build = await response.json();
                assert.equal(response.status, 200, JSON.stringify(build));
                const sector = build.data.sectors.find((item) => item.slug === 'Fixture');
                if (sector && sector.state === 'failed') throw new Error(JSON.stringify(build));
                if (build.data.sectorsDone === 1) break;
                await sleep(1000);
            }
            assert.equal(build.data.sectorsDone, 1, JSON.stringify(build));
            const sourceFile = path.join(dir, 'source-index.json');
            const derivedFile = path.join(dir, 'derived-index.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/sectors/Fixture/index.json', '--file', sourceFile, '--local']);
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vnoinputs/sectors/Fixture/index.json', '--file', derivedFile, '--local']);
            const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
            const derived = JSON.parse(readFileSync(derivedFile, 'utf8'));
            assert.equal(derived.truthVersion, 'vnoinputs');
            assert.equal(derived.name, 'Chart Fixture');
            assert.equal(derived.canonical, true);
            assert.deepEqual(derived.hexes, source.hexes);
            const canonical = jsonFrom(runWrangler([
                'd1', 'execute', 'voyage', '--local', '--command',
                "SELECT canonical FROM truth_build_sectors WHERE version = 'vnoinputs' AND sector_slug = 'Fixture'",
            ]));
            assert.equal(Number(canonical[0].results[0].canonical), 1);
        });
    });

    test('a derive of a derived version releases with the source catalogue', { timeout: 180000 }, async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'voyage-chain-'));
        const versions = ['vchain1', 'vchain2'];
        function clearVersion(version) {
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', `DELETE FROM truth_systems WHERE version = '${version}'`]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', `DELETE FROM truth_build_sectors WHERE version = '${version}'`]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', `DELETE FROM truth_versions WHERE version = '${version}'`]);
        }
        await withDevServer(async (base) => {
            for (const version of versions) clearVersion(version);
            try {
                const cookie = adminCookie();
                const shared = {
                    milieu: 'M1105',
                    engineVersion: '1.0.0',
                    seed: TRUTH_SEED,
                    settings: { ...TRUTH_SETTINGS },
                    sectors: 'all',
                };
                async function derive(version, from) {
                    const posted = await fetch(`${base}/api/admin/truth/build`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', cookie },
                        body: JSON.stringify({ ...shared, version, from }),
                    });
                    const postedBody = await posted.json();
                    assert.equal(posted.status, 202, JSON.stringify(postedBody));
                    assert.equal(postedBody.data.enqueued, 1);
                    let build;
                    const deadline = Date.now() + 60000;
                    while (Date.now() < deadline) {
                        const response = await fetch(`${base}/api/admin/truth/builds/${version}`, { headers: { cookie } });
                        build = await response.json();
                        assert.equal(response.status, 200, JSON.stringify(build));
                        const sector = build.data.sectors.find((item) => item.slug === 'Fixture');
                        if (sector && sector.state === 'failed') throw new Error(JSON.stringify(build));
                        if (build.data.sectorsDone === 1) break;
                        await sleep(1000);
                    }
                    assert.equal(build.data.sectorsDone, 1, JSON.stringify(build));
                }
                await derive('vchain1', 'vtest');
                const releasedParent = await fetch(`${base}/api/admin/truth/release/vchain1`, {
                    method: 'POST',
                    headers: { cookie },
                });
                const releasedParentBody = await releasedParent.json();
                assert.equal(releasedParent.status, 200, JSON.stringify(releasedParentBody));
                await derive('vchain2', 'vchain1');
                const released = await fetch(`${base}/api/admin/truth/release/vchain2`, {
                    method: 'POST',
                    headers: { cookie },
                });
                const releasedBody = await released.json();
                assert.equal(released.status, 200, JSON.stringify(releasedBody));
                const catalogueFile = path.join(dir, 'sectors.json');
                const manifestFile = path.join(dir, 'manifest.json');
                runWrangler(['r2', 'object', 'get', 'voyage-private/inputs/vtest/sectors.json', '--file', catalogueFile, '--local']);
                runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vchain2/manifest.json', '--file', manifestFile, '--local']);
                const catalogue = JSON.parse(readFileSync(catalogueFile, 'utf8'));
                const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
                assert.equal(manifest.truthVersion, 'vchain2');
                assert.equal(manifest.sectors.length, catalogue.sectors.length);
                for (const item of catalogue.sectors) {
                    const listed = manifest.sectors.find((sector) => sector.slug === item.slug);
                    assert.ok(listed, item.slug);
                    assert.equal(listed.name, item.name);
                    assert.equal(listed.x, item.x);
                    assert.equal(listed.y, item.y);
                }
            } finally {
                for (const version of versions) clearVersion(version);
            }
        });
    });

    test('search uses the newest released version and the canonical layer', { timeout: 120000 }, async () => {
        function clearVersion(version) {
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', `DELETE FROM truth_systems WHERE version = '${version}'`]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', `DELETE FROM truth_build_sectors WHERE version = '${version}'`]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', `DELETE FROM truth_versions WHERE version = '${version}'`]);
        }
        function insertVersion(version, releasedAt) {
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, notes, manifest_hash, sectors_total, sectors_done, sectors_failed) VALUES ('${version}', '1.0.0', 'M1105', 'search', '{}', '[]', 'released', '${releasedAt}', '${releasedAt}', NULL, NULL, 1, 1, '[]')`]);
        }
        function insertSystem(version, slug, hex, name) {
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, allegiance, zone, tree_hash, partial) VALUES ('${version}', '${slug}', '${hex}', '${name}', 'A788899-C', NULL, NULL, NULL, NULL)`]);
        }
        function insertSector(version, slug, canonical) {
            const value = canonical === null ? 'NULL' : String(canonical);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at, canonical) VALUES ('${version}', '${slug}', 'done', 1, 1, 0, NULL, NULL, '2020-01-01T00:00:00.000Z', ${value})`]);
        }
        await withDevServer(async (base) => {
            const versions = ['voldsearch', 'vnewsearch', 'vlayer', 'vnullsearch'];
            for (const version of versions) clearVersion(version);
            try {
            insertVersion('voldsearch', '2020-01-01T00:00:00.000Z');
            insertSystem('voldsearch', 'Old', '1910', 'Sharedhaven');
            insertSystem('voldsearch', 'Old', '1911', 'Oldhaven');
            insertSector('voldsearch', 'Old', 1);
            insertVersion('vnewsearch', '2099-01-01T00:00:00.000Z');
            insertSystem('vnewsearch', 'New', '1910', 'Sharedhaven');
            insertSystem('vnewsearch', 'New', '1911', 'Newhaven');
            insertSector('vnewsearch', 'New', 1);
            const shared = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Sharedhaven')}`);
            const sharedBody = await shared.json();
            assert.equal(shared.status, 200, JSON.stringify(sharedBody));
            assert.equal(sharedBody.data.items.length, 1);
            assert.equal(sharedBody.data.items[0].version, 'vnewsearch');
            const oldOnly = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Oldhaven')}`);
            const oldOnlyBody = await oldOnly.json();
            assert.equal(oldOnly.status, 200, JSON.stringify(oldOnlyBody));
            assert.equal(oldOnlyBody.data.items.length, 0);
            const named = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Oldhaven')}&version=voldsearch`);
            const namedBody = await named.json();
            assert.equal(named.status, 200, JSON.stringify(namedBody));
            assert.equal(namedBody.data.items.length, 1);
            assert.equal(namedBody.data.items[0].version, 'voldsearch');

            insertVersion('vlayer', '2021-01-01T00:00:00.000Z');
            insertSector('vlayer', 'Canon', 1);
            insertSector('vlayer', 'Alt', 0);
            insertSystem('vlayer', 'Canon', '1910', 'Layermark');
            insertSystem('vlayer', 'Alt', '1911', 'Layermark');
            const canonical = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Layermark')}&version=vlayer&layer=canonical`);
            const canonicalBody = await canonical.json();
            assert.equal(canonical.status, 200, JSON.stringify(canonicalBody));
            assert.deepEqual(canonicalBody.data.items.map((item) => item.sectorSlug), ['Canon']);
            const all = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Layermark')}&version=vlayer&layer=all`);
            const allBody = await all.json();
            assert.equal(all.status, 200, JSON.stringify(allBody));
            assert.deepEqual(allBody.data.items.map((item) => item.sectorSlug).sort(), ['Alt', 'Canon']);
            const defaultLayer = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Layermark')}&version=vlayer`);
            const defaultBody = await defaultLayer.json();
            assert.equal(defaultLayer.status, 200, JSON.stringify(defaultBody));
            assert.deepEqual(defaultBody.data.items.map((item) => item.sectorSlug), ['Canon']);

            insertVersion('vnullsearch', '2022-01-01T00:00:00.000Z');
            insertSector('vnullsearch', 'Blank', null);
            insertSystem('vnullsearch', 'Blank', '1910', 'Nullhaven');
            const legacy = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Nullhaven')}&version=vnullsearch&layer=canonical`);
            const legacyBody = await legacy.json();
            assert.equal(legacy.status, 200, JSON.stringify(legacyBody));
            assert.equal(legacyBody.data.items.length, 1);
            assert.equal(legacyBody.data.items[0].sectorSlug, 'Blank');
            } finally {
                for (const version of versions) clearVersion(version);
            }
        });
    });
}
