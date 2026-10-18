import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';
import { applyTags, prefersHtml } from '../../apps/api/src/preview_tags.ts';

const HTML = `<!doctype html><html><head><title>Traveller.voyage</title>
<meta name="description" content="A map of the charted Traveller universe, with a private campaign on top of it." />
<meta property="og:title" content="Traveller.voyage" />
<meta property="og:description" content="A map of the charted Traveller universe, with a private campaign on top of it." />
<meta property="og:image" content="https://traveller.voyage/og.png" />
</head><body></body></html>`;

test('html is preferred only when it outranks the other types', () => {
    assert.equal(prefersHtml(null), false);
    assert.equal(prefersHtml('application/json'), false);
    assert.equal(prefersHtml('*/*'), false);
    assert.equal(prefersHtml('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'), true);
    assert.equal(prefersHtml('application/json;q=1, text/html;q=0.1'), false);
});

test('existing social tags are rewritten and not added twice', () => {
    const next = applyTags(HTML, { title: 'Regina', description: 'Regina (TEST-UWP), Spinward Marches', image: 'https://cdn.example/objects/abc' });
    assert.equal(next.match(/<title>/g).length, 1);
    assert.equal(next.match(/property="og:title"/g).length, 1);
    assert.match(next, /<title>Regina<\/title>/);
    assert.match(next, /content="Regina \(TEST-UWP\), Spinward Marches"/);
    assert.match(next, /property="og:image" content="https:\/\/cdn.example\/objects\/abc"/);
    assert.equal(applyTags('<html></html>', { title: 'Regina', description: 'Regina' }).includes('og:title'), false);
});

function sqlFile(persistTo, sql) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-sql-')), 'query.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
}

function r2Put(persistTo, key, text) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'body');
    writeFileSync(file, text);
    runWrangler(['r2', 'object', 'put', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function up(url) {
    const deadline = Date.now() + 90000;
    let last = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/api/health`);
            if (response.ok) return;
            last = `status ${response.status}`;
        } catch (err) {
            last = err instanceof Error ? err.message : String(err);
        }
        await sleep(500);
    }
    throw new Error(last || 'wrangler dev did not answer /api/health');
}

if (process.env.RUN_API_TESTS !== '1') {
    test('social previews on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('social previews on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    // Parked with run_worker_first. The body stays for the day Johnny turns link previews on.
    test('social previews on the worker', { skip: 'parked until Johnny turns it on', timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-preview-'));
        const port = 18891;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = Date.now();
            const version = `pvw${stamp}`;
            const when = new Date(stamp).toISOString();
            const cover = 'ab'.repeat(32);
            sqlFile(persistTo, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('pv-user', 'pv-user', 'pv@localhost', 1, ${stamp}, ${stamp}, 'user', 0);
INSERT INTO profile (user_id, handle, display_name, created_at)
VALUES ('pv-user', 'pvhandle', 'PV', '${when}');
INSERT INTO universes (id, owner_id, name, slug, engine_version, edition_default, created_at, updated_at)
VALUES ('uni-pv', 'pv-user', 'PV', 'pv', '1.2.0', 'MgT2E', '${when}', '${when}');
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.2.0', 'M1105', 'TravellerMagnus', '{}', '[]', 'released', '${when}', '${when}', 0, 0, '[]');
INSERT INTO packages (id, author_id, universe_id, kind, title, slug, description, tags, edition, truth_version, engine_version, latest_version, installs, created_at, updated_at, hidden, cover_hash, cover_thumb_hash)
VALUES ('pk_pv', 'pv-user', 'uni-pv', 'ship', 'Preview Cutter', 'preview-cutter', '', '[]', 'MgT2E', '${version}', '1.2.0', 0, 0, '${when}', '${when}', 0, '${cover}', '${cover}');
`);
            r2Put(persistTo, `truth/${version}/sectors/Spinward_Marches/index.json`, JSON.stringify({
                name: 'Spinward Marches',
                hexes: { '1910': { name: 'Regina', uwp: 'TEST-UWP' } },
            }));
            child = startDev({ port, persistTo, inspectorPort: 19891 });
            await up(base);
            const html = { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' };
            const regina = await fetch(`${base}/s/Spinward_Marches/1910`, { headers: html });
            const reginaText = await regina.text();
            assert.equal(regina.status, 200);
            assert.match(reginaText, /<title>Regina<\/title>/);
            assert.match(reginaText, /Regina \(TEST-UWP\), Spinward Marches/);
            assert.equal(reginaText.match(/property="og:title"/g).length, 1);
            const bytes = await fetch(`${base}/s/Spinward_Marches/1910`, { headers: { accept: 'application/json' } });
            const byteText = await bytes.text();
            assert.match(byteText, /<title>Traveller\.voyage<\/title>/);
            assert.equal(byteText.includes('Regina'), false);
            const unknown = await fetch(`${base}/not-a-route`, { headers: html });
            const unknownText = await unknown.text();
            assert.match(unknownText, /<title>Traveller\.voyage<\/title>/);
            assert.equal(unknownText.includes('Regina'), false);
            const pack = await fetch(`${base}/packages/pk_pv`, { headers: html });
            const packText = await pack.text();
            assert.match(packText, /<title>Preview Cutter<\/title>/);
            assert.match(packText, /Preview Cutter by pvhandle/);
            assert.match(packText, new RegExp(`objects/${cover}`));
        } finally {
            stopDev(child?.pid);
        }
    });
}
