import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PackageManifest, stable } from '@voyage/shared';
import { markPublishFailed, runPublish } from '../../apps/api/src/jobs/publish_queue.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TREE = 'a'.repeat(64);
const IMAGE = 'b'.repeat(64);
const THUMB = 'c'.repeat(64);
const BASE = 'd'.repeat(64);
const RECORD = 'cr_11111111-1111-4111-8111-111111111111';
const PACKAGE = 'pk_TESTPACKAGE00000000000000';
const UNIVERSE = 'uni-job';
const AUTHOR = 'author-job';

function d1(db) {
    return {
        prepare(sql) {
            return {
                bind(...params) {
                    return {
                        async first() {
                            const row = db.prepare(sql).get(...params);
                            return row ?? null;
                        },
                        async run() {
                            const info = db.prepare(sql).run(...params);
                            return { meta: { changes: info.changes } };
                        },
                        async all() {
                            return { results: db.prepare(sql).all(...params) };
                        },
                    };
                },
            };
        },
    };
}

function bucket() {
    const objects = new Map();
    return {
        objects,
        puts: [],
        async get(key) {
            const bytes = objects.get(key);
            if (!bytes) return null;
            return {
                size: bytes.byteLength,
                httpMetadata: { contentType: 'application/json' },
                text: async () => new TextDecoder().decode(bytes),
                arrayBuffer: async () => bytes.slice().buffer,
            };
        },
        async head(key) {
            const bytes = objects.get(key);
            return bytes ? { size: bytes.byteLength } : null;
        },
        async put(key, body) {
            this.puts.push(key);
            const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
            objects.set(key, bytes);
        },
    };
}

function open() {
    const db = new DatabaseSync(':memory:');
    db.exec(`
        CREATE TABLE user (id TEXT PRIMARY KEY);
        CREATE TABLE universes (
            id TEXT PRIMARY KEY, owner_id TEXT, engine_version TEXT, truth_version TEXT,
            deleted_at TEXT, edition_default TEXT
        );
        CREATE TABLE profile (user_id TEXT PRIMARY KEY, handle TEXT);
    `);
    const sql = readFileSync(path.join(root, 'apps/api/src/db/migrations/0010_packages.sql'), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
        const text = statement.trim();
        if (text) db.exec(text);
    }
    db.prepare(`INSERT INTO user (id) VALUES (?)`).run(AUTHOR);
    db.prepare(`INSERT INTO universes (id, owner_id, engine_version, truth_version, edition_default) VALUES (?, ?, '1.1.0', 'v1', 'MgT2E')`).run(UNIVERSE, AUTHOR);
    db.prepare(`INSERT INTO profile (user_id, handle) VALUES (?, 'referee')`).run(AUTHOR);
    db.prepare(
        `INSERT INTO packages (
            id, author_id, universe_id, kind, title, slug, description, tags, edition, truth_version,
            engine_version, latest_version, installs, created_at, updated_at, hidden
         ) VALUES (?, ?, ?, 'subsector', 'Far', 'far', '', '[]', 'MgT2E', 'v1', '1.1.0', 0, 0, 't', 't', 0)`,
    ).run(PACKAGE, AUTHOR, UNIVERSE);
    return db;
}

function addVersion(db, version, hexKeys, recordIds, state = 'queued') {
    db.prepare(
        `INSERT INTO package_versions (
            package_id, version, state, hex_count, record_count, hex_keys, record_ids, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 't')`,
    ).run(PACKAGE, version, state, hexKeys.length, recordIds.length, JSON.stringify(hexKeys), JSON.stringify(recordIds));
}

function envFor(db, sources, extra = {}) {
    const publicBucket = bucket();
    const privateBucket = bucket();
    for (const [key, text] of extra.public ?? []) publicBucket.objects.set(key, new TextEncoder().encode(text));
    for (const [key, text] of extra.private ?? []) privateBucket.objects.set(key, new TextEncoder().encode(text));
    return {
        env: {
            DB: d1(db),
            PUBLIC_BUCKET: publicBucket,
            PRIVATE_BUCKET: privateBucket,
            UNIVERSE: {
                idFromName() { return 'door'; },
                get() {
                    return { async fetch() { return Response.json({ ok: true, data: sources }); } };
                },
            },
        },
        publicBucket,
    };
}

const liveHex = {
    hexKey: 'Demo/1910',
    found: true,
    deleted: false,
    baseHash: BASE,
    treeHash: TREE,
    summary: { roll: 0, baseHash: BASE, engineVersion: '1.1.0', entry: { name: 'Kept' } },
};
const liveRecord = {
    id: RECORD,
    found: true,
    deleted: false,
    record: { id: RECORD, name: 'Voss', images: [{ hash: IMAGE, thumbHash: THUMB }] },
};

function manifestOf(publicBucket, version) {
    const key = `packages/${PACKAGE}/${version}/manifest.json`;
    return PackageManifest.parse(JSON.parse(new TextDecoder().decode(publicBucket.objects.get(key))));
}

async function failRun(env, version) {
    const message = { packageId: PACKAGE, version, universeId: UNIVERSE };
    try {
        await runPublish(env, message);
        assert.fail('expected the publish to throw');
    } catch (err) {
        await markPublishFailed(env, PACKAGE, version, err);
        return err;
    }
}

test('a publish copies each object once, and a done version is left alone', async () => {
    const db = open();
    addVersion(db, 1, ['Demo/1910'], [RECORD]);
    const { env, publicBucket } = envFor(db, { hexes: [liveHex], records: [liveRecord] }, {
        private: [
            [`u/${UNIVERSE}/objects/${TREE}`, '{"tree":1}'],
            [`u/${UNIVERSE}/objects/${IMAGE}`, 'image-bytes'],
            [`u/${UNIVERSE}/objects/${THUMB}`, 'thumb-bytes'],
        ],
    });
    await runPublish(env, { packageId: PACKAGE, version: 1, universeId: UNIVERSE });
    const row = db.prepare(`SELECT state, manifest_hash, bytes, error FROM package_versions WHERE version = 1`).get();
    assert.equal(row.state, 'done');
    assert.equal(row.error, null);
    assert.equal(row.manifest_hash.length, 64);
    assert.equal(db.prepare(`SELECT latest_version FROM packages`).get().latest_version, 1);
    const manifest = manifestOf(publicBucket, 1);
    assert.equal(manifest.hexes['Demo/1910'].treeHash, TREE);
    assert.equal(manifest.hexes['Demo/1910'].summary.entry.name, 'Kept');
    assert.equal(manifest.author.handle, 'referee');
    assert.deepEqual(manifest.records.imageHashes, [IMAGE, THUMB]);
    assert.equal(manifest.lists.routes, manifest.lists.borderPaths);
    const recordsText = stable([liveRecord.record]);
    const manifestKey = `packages/${PACKAGE}/1/manifest.json`;
    const imageBytes = 'image-bytes'.length + 'thumb-bytes'.length;
    assert.equal(
        row.bytes,
        publicBucket.objects.get(manifestKey).byteLength + new TextEncoder().encode(recordsText).byteLength + imageBytes,
    );
    assert.equal(publicBucket.puts.filter((key) => key === `objects/${TREE}`).length, 1);

    const puts = publicBucket.puts.length;
    const before = publicBucket.objects.get(`objects/${TREE}`);
    await runPublish(env, { packageId: PACKAGE, version: 1, universeId: UNIVERSE });
    assert.equal(publicBucket.puts.length, puts);
    assert.equal(publicBucket.objects.get(`objects/${TREE}`), before);

    addVersion(db, 2, ['Demo/1910'], [RECORD]);
    await runPublish(env, { packageId: PACKAGE, version: 2, universeId: UNIVERSE });
    assert.equal(publicBucket.puts.filter((key) => key === `objects/${TREE}`).length, 1);
    assert.equal(publicBucket.puts.filter((key) => key === `objects/${IMAGE}`).length, 1);
    assert.equal(manifestOf(publicBucket, 2).records.contentHash, manifest.records.contentHash);
    assert.equal(db.prepare(`SELECT latest_version FROM packages`).get().latest_version, 2);
});

test('a failed publish leaves the latest version, and a retry finishes one snapshot', async () => {
    const db = open();
    addVersion(db, 1, ['Demo/1910'], []);
    const sources = {
        hexes: [{ hexKey: 'Demo/1910', found: true, deleted: false, baseHash: null, treeHash: TREE, summary: { name: 'One' } }],
        records: [],
    };
    const { env, publicBucket } = envFor(db, sources);
    const err = await failRun(env, 1);
    assert.match(String(err), /Missing object/);
    assert.equal(db.prepare(`SELECT state FROM package_versions WHERE version = 1`).get().state, 'failed');
    assert.equal(db.prepare(`SELECT latest_version FROM packages`).get().latest_version, 0);
    assert.ok(db.prepare(`SELECT error FROM package_versions WHERE version = 1`).get().error.length <= 200);

    publicBucket.puts.length = 0;
    env.PRIVATE_BUCKET = {
        async get(key) {
            if (key === `u/${UNIVERSE}/objects/${TREE}`) {
                const bytes = new TextEncoder().encode('{"tree":1}');
                return {
                    httpMetadata: { contentType: 'application/json' },
                    arrayBuffer: async () => bytes.slice().buffer,
                };
            }
            return null;
        },
        async head() { return null; },
        async put() {},
    };
    await runPublish(env, { packageId: PACKAGE, version: 1, universeId: UNIVERSE });
    assert.equal(db.prepare(`SELECT state, error FROM package_versions WHERE version = 1`).get().state, 'done');
    assert.equal(db.prepare(`SELECT latest_version FROM packages`).get().latest_version, 1);
    const treePuts = publicBucket.puts.filter((key) => key === `objects/${TREE}`).length;
    assert.equal(treePuts, 1);

    addVersion(db, 2, ['Missing/0101'], []);
    const missing = {
        hexes: [{ hexKey: 'Missing/0101', found: false, deleted: false, baseHash: null, treeHash: null, summary: null }],
        records: [],
    };
    env.UNIVERSE = {
        idFromName() { return 'door'; },
        get() { return { async fetch() { return Response.json({ ok: true, data: missing }); } }; },
    };
    await failRun(env, 2);
    assert.equal(db.prepare(`SELECT state FROM package_versions WHERE version = 2`).get().state, 'failed');
    assert.equal(db.prepare(`SELECT latest_version FROM packages`).get().latest_version, 1);
});

test('a chart hex, a deleted row, and an own-sector key keep the contract shapes', async () => {
    const db = open();
    const own = '~OWNSECTOR0000000000000000/0101';
    addVersion(db, 1, ['Chart/0101', 'Demo/1910', own], []);
    const entry = { tree: TREE, name: 'Charted', type: 'SYSTEM_PRESENT' };
    const sources = {
        hexes: [
            { hexKey: 'Chart/0101', found: false, deleted: false, baseHash: null, treeHash: null, summary: null },
            { hexKey: 'Demo/1910', found: true, deleted: true, baseHash: BASE, treeHash: TREE, summary: { name: 'gone' } },
            { hexKey: own, found: true, deleted: false, baseHash: BASE, treeHash: TREE, summary: { name: 'own' } },
        ],
        records: [],
    };
    const { env, publicBucket } = envFor(db, sources, {
        public: [
            [`truth/v1/sectors/Chart/index.json`, JSON.stringify({ hexes: { '0101': entry } })],
            [`objects/${TREE}`, '{"chart":true}'],
        ],
        private: [[`u/${UNIVERSE}/objects/${TREE}`, '{"own":true}']],
    });
    await runPublish(env, { packageId: PACKAGE, version: 1, universeId: UNIVERSE });
    const manifest = manifestOf(publicBucket, 1);
    assert.equal(manifest.hexes['Chart/0101'].baseHash, TREE);
    assert.equal(manifest.hexes['Chart/0101'].treeHash, TREE);
    assert.equal(manifest.hexes['Chart/0101'].summary.name, 'Charted');
    assert.deepEqual(manifest.hexes['Demo/1910'], { baseHash: BASE, deleted: true });
    assert.equal(manifest.hexes[own].baseHash, null);
    assert.equal(manifest.hexes[own].treeHash, TREE);
    assert.equal(publicBucket.puts.includes(`objects/${TREE}`), false);
});

// Install and report arrived with the full marketplace (contracts/b_marketplace.md F2-F4);
// proposals (slice 5) are still out of scope.
test('the marketplace files do not name proposal tables', () => {
    const files = [
        'apps/api/src/routes/packages.ts',
        'apps/api/src/jobs/publish_queue.ts',
        'apps/api/src/jobs/dead_letter.ts',
        'apps/api/src/db/migrations/0010_packages.sql',
        'apps/api/src/universe/publish_read.ts',
    ];
    for (const file of files) {
        const text = readFileSync(path.join(root, file), 'utf8');
        assert.equal(/\bproposals\b/.test(text), false, file);
    }
});
