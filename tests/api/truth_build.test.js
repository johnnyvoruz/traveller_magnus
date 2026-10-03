import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { TSV } from '../golden/cases.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { SectorIndex, TruthManifest, TruthOverview, sha256Hex } from '@voyage/shared';
import { deadLetterConsumer } from '../../apps/api/src/jobs/dead_letter.ts';
import { truthBuildConsumer } from '../../apps/api/src/jobs/truth_build.ts';
import { adminCookie, runWrangler } from './session.js';
import { withDevServer, wranglerBin } from './server.js';

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

function bindingDouble(files) {
    const stored = new Map(Object.entries(files));
    const calls = { get: 0, put: 0, list: 0, send: 0, batch: 0, run: 0 };
    const sent = [];
    const bucket = () => ({
        async get(key) {
            calls.get += 1;
            const value = stored.get(key);
            if (value == null) return null;
            return { text: async () => value };
        },
        async put(key, body) {
            calls.put += 1;
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
        assert.deepEqual(finished.calls, { get: 4, put: 3, list: 1, send: 0, batch: 1, run: 1 });
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
            const staleAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
            const freshAt = new Date().toISOString();
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command', "DELETE FROM truth_build_sectors WHERE version = 'vwide' AND sector_slug IN ('Stale', 'Fresh')"]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at) VALUES ('vwide', 'Stale', 'building', 0, 0, 0, NULL, NULL, '${staleAt}')`]);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--command',
                `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at) VALUES ('vwide', 'Fresh', 'building', 0, 0, 0, NULL, NULL, '${freshAt}')`]);
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
                "SELECT sector_slug, state, updated_at FROM truth_build_sectors WHERE version = 'vwide' AND sector_slug IN ('Stale', 'Fresh') ORDER BY sector_slug",
            ]));
            const fresh = picked[0].results.find((item) => item.sector_slug === 'Fresh');
            const stale = picked[0].results.find((item) => item.sector_slug === 'Stale');
            assert.equal(fresh.updated_at, freshAt);
            assert.equal(fresh.state, 'building');
            assert.notEqual(stale.updated_at, staleAt);
            assert.equal(stale.state, 'building');
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
        });
    });
}
