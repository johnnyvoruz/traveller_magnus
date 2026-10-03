import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { TSV } from '../golden/cases.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
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
    test('truth build', { timeout: 300000 }, async () => {
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
            const released = await fetch(`${base}/api/admin/truth/release/vtest`, {
                method: 'POST',
                headers: { cookie },
            });
            const releasedBody = await released.json();
            assert.equal(released.status, 200, JSON.stringify(releasedBody));
            const manifestFile = path.join(dir, 'manifest.json');
            runWrangler(['r2', 'object', 'get', 'voyage-public/truth/vtest/manifest.json', '--file', manifestFile, '--local']);
            const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
            assert.equal(manifest.attribution, ATTRIBUTION);
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
            const versions = await fetch(`${base}/api/truth/versions`);
            const versionsBody = await versions.json();
            assert.equal(versions.status, 200, JSON.stringify(versionsBody));
            assert.ok(versionsBody.data.some((item) => item.version === 'vtest' && item.state === 'released'));
            const absent = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Rhylanor')}&version=vtest`);
            const absentBody = await absent.json();
            assert.equal(absent.status, 200, JSON.stringify(absentBody));
            assert.equal(absentBody.data.items.length, 0);
            const found = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Regina')}&version=vtest`);
            const foundBody = await found.json();
            assert.equal(found.status, 200, JSON.stringify(foundBody));
            assert.equal(foundBody.data.items.length, 1);
            assert.equal(foundBody.data.items[0].name, 'Regina');
        });
    });
}
