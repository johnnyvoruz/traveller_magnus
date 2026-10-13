import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { dotIndex } from '@voyage/generation';
import { sha256Hex } from '@voyage/shared';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function userCookie(userId, email, persistTo, releaseVersion) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const released = releaseVersion
        ? `INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('ddots', '1.1.0', '', '${TRUTH_SEED}', '${JSON.stringify(TRUTH_SETTINGS).replaceAll("'", "''")}', '[]', 'released', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', 1, 1, '[]');`
        : '';
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
${released}
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function chartHex(uwp, name) {
    return {
        tree: null, type: 'SYSTEM_PRESENT', name, uwp, allegiance: '', zone: '', bases: '',
        tradeCodes: [], pbg: '000', ix: 0, partial: null,
    };
}

function publishChart(persistTo) {
    const cells = Array.from({ length: 1280 }, () => '.');
    cells[dotIndex('1910')] = 'A';
    cells[dotIndex('0102')] = 'C';
    const overview = {
        truthVersion: 'ddots',
        sectors: [{
            slug: 'Charted', name: 'Charted', x: 0, y: 0, tags: [], canonical: false, systems: 2,
            cells: cells.join(''), polities: [], owners: '.'.repeat(1280),
        }],
    };
    const index = { hexes: { 1910: chartHex('A788899-C', 'Charted'), '0102': chartHex('C123456-7', 'Left') } };
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-dots-'));
    const overviewFile = path.join(dir, 'overview.json');
    const indexFile = path.join(dir, 'index.json');
    const manifestFile = path.join(dir, 'manifest.json');
    writeFileSync(overviewFile, JSON.stringify(overview));
    writeFileSync(indexFile, JSON.stringify(index));
    writeFileSync(manifestFile, JSON.stringify({ sectors: [{ x: 0, y: 0 }] }));
    try {
        runWrangler(['r2', 'object', 'put', 'voyage-public/truth/ddots/overview.json', '--local', '--persist-to', persistTo, '--file', overviewFile, '--content-type', 'application/json']);
        runWrangler(['r2', 'object', 'put', 'voyage-public/truth/ddots/sectors/Charted/index.json', '--local', '--persist-to', persistTo, '--file', indexFile, '--content-type', 'application/json']);
        runWrangler(['r2', 'object', 'put', 'voyage-public/truth/ddots/manifest.json', '--local', '--persist-to', persistTo, '--file', manifestFile, '--content-type', 'application/json']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, text, etag: response.headers.get('etag') };
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
    throw new Error(last || 'wrangler did not answer /api/health');
}

function field(form, id) {
    for (const section of form.sections) {
        const found = section.fields.find((item) => item.id === id);
        if (found) return found;
    }
    return null;
}

function mainworldNameId(form) {
    for (const section of form.sections) {
        for (const item of section.fields) {
            if (item.id.endsWith('.mainworld') && item.value === true) return item.id.replace(/\.mainworld$/, '.name');
        }
    }
    return null;
}

if (process.env.RUN_API_TESTS !== '1') {
    test('builder dots on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('keep a generated rename, and dots overlay chart, hand, removed, and own rows', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-dots-'));
        const port = 18842;
        const inspectorPort = 19842;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`dot${stamp}`, `dot${stamp}@localhost`, persistTo, true);
            const other = userCookie(`dox${stamp}`, `dox${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            publishChart(persistTo);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Dots', truthVersion: 'ddots', editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const hex = (local) => `${base}/api/universes/${id}/hexes/Charted/${local}`;

            const signedOut = await jsonFetch(`${base}/api/universes/${id}/hexes/Charted/dots`);
            assert.equal(signedOut.status, 401, JSON.stringify(signedOut.body));
            const stranger = await jsonFetch(`${base}/api/universes/${id}/hexes/Charted/dots`, { headers: { cookie: other } });
            assert.equal(stranger.status, 404, JSON.stringify(stranger.body));

            const generated = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: ['Charted/0101'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0 }),
            });
            assert.equal(generated.status, 200, JSON.stringify(generated.body));
            const row = generated.body.data.rows[0];
            const form = await jsonFetch(`${hex('0101')}/form`, { headers: { cookie } });
            assert.equal(form.status, 200, JSON.stringify(form.body));
            const nameId = mainworldNameId(form.body.data.form);
            assert.ok(nameId);
            const kept = await jsonFetch(`${hex('0101')}/keep`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hash: row.treeHash, baseRev: row.rev, changes: [{ id: nameId, value: 'Renamed World' }] }),
            });
            assert.equal(kept.status, 200, JSON.stringify(kept.body));
            const keptForm = await jsonFetch(`${hex('0101')}/form`, { headers: { cookie } });
            assert.equal(field(keptForm.body.data.form, nameId).value, 'Renamed World');
            const mark = String(kept.body.data.entry.uwp || '?')[0] || '?';

            const made = await jsonFetch(`${hex('0103')}/blank`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ edition: 'MgT2E', baseRev: 0 }),
            });
            assert.equal(made.status, 200, JSON.stringify(made.body));
            const handed = await jsonFetch(`${hex('0103')}/keep`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hash: made.body.data.treeHash,
                    baseRev: made.body.data.rev,
                    changes: [{ id: 'star.add', value: true }, { id: 'body.add', value: true }, { id: 'b1.name', value: 'By hand' }],
                }),
            });
            assert.equal(handed.status, 200, JSON.stringify(handed.body));

            const removed = await jsonFetch(`${hex('1910')}/remove`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            assert.equal(removed.body.data.state, 'removed');

            const dots = await jsonFetch(`${base}/api/universes/${id}/hexes/Charted/dots`, { headers: { cookie } });
            assert.equal(dots.status, 200, JSON.stringify(dots.body));
            assert.equal(dots.body.data.cells.length, 1280);
            assert.equal(dots.body.data.cells[dotIndex('0101')], mark);
            assert.equal(dots.body.data.cells[dotIndex('0102')], 'C');
            assert.equal(dots.body.data.cells[dotIndex('0103')], '?');
            assert.equal(dots.body.data.cells[dotIndex('1910')], '.');
            assert.equal(dots.body.data.stamp, await sha256Hex(dots.body.data.cells));
            assert.equal(dots.etag, `"${dots.body.data.stamp}"`);
            const again = await jsonFetch(`${base}/api/universes/${id}/hexes/Charted/dots`, {
                headers: { cookie, 'if-none-match': dots.etag },
            });
            assert.equal(again.status, 304, again.text);
            assert.equal(again.text, '');

            const own = await jsonFetch(`${base}/api/universes/${id}/sectors`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Far', slot: { x: 8, y: 8 } }),
            });
            assert.equal(own.status, 201, JSON.stringify(own.body));
            const sectorId = own.body.data.id;
            const placed = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: [`${sectorId}/0101`], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0 }),
            });
            assert.equal(placed.status, 200, JSON.stringify(placed.body));
            const ownMark = String(placed.body.data.rows[0].entry.uwp || '?')[0] || '?';
            const ownDots = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/dots`, { headers: { cookie } });
            assert.equal(ownDots.status, 200, JSON.stringify(ownDots.body));
            assert.equal(ownDots.body.data.cells[0], ownMark);
            assert.equal(ownDots.body.data.cells.slice(1), '.'.repeat(1279));

            const both = await jsonFetch(`${base}/api/universes/${id}/hexes/dots?sectors=${encodeURIComponent(`Charted,${sectorId}`)}`, { headers: { cookie } });
            assert.equal(both.status, 200, JSON.stringify(both.body));
            assert.equal(both.body.data.sectors.length, 2);
            assert.equal(both.body.data.sectors[0].cells, dots.body.data.cells);
            assert.equal(both.body.data.sectors[1].cells[0], ownMark);
            const pageStamp = await sha256Hex(both.body.data.sectors.map((item) => `${item.sector}=${item.stamp}`).join('\n'));
            assert.equal(both.body.data.stamp, pageStamp);
            assert.equal(both.etag, `"${pageStamp}"`);

            const tooMany = Array.from({ length: 33 }, (_, n) => `S${n}`);
            const bounded = await jsonFetch(`${base}/api/universes/${id}/hexes/dots?sectors=${tooMany.join(',')}`, { headers: { cookie } });
            assert.equal(bounded.status, 400, JSON.stringify(bounded.body));
            const bad = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent('bad slug')}/dots`, { headers: { cookie } });
            assert.equal(bad.status, 400, JSON.stringify(bad.body));

            const absent = await jsonFetch(`${base}/api/universes/${id}/hexes/Unlisted/dots`, { headers: { cookie } });
            assert.equal(absent.status, 200, JSON.stringify(absent.body));
            assert.equal(absent.body.data.cells, '.'.repeat(1280));

            const releasedAt = '2026-10-10T00:00:00.000Z';
            const settings = JSON.stringify(TRUTH_SETTINGS).replaceAll("'", "''");
            const versionSql = ['dmiss', 'dbad'].map((version) =>
                `INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.1.0', '', '${TRUTH_SEED}', '${settings}', '[]', 'released', '${releasedAt}', '${releasedAt}', 1, 1, '[]');`,
            ).join('\n');
            const versionDir = mkdtempSync(path.join(tmpdir(), 'voyage-dots-ver-'));
            const versionFile = path.join(versionDir, 'versions.sql');
            writeFileSync(versionFile, versionSql);
            try {
                runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', versionFile]);
            } finally {
                rmSync(versionDir, { recursive: true, force: true });
            }
            const badDir = mkdtempSync(path.join(tmpdir(), 'voyage-dots-bad-'));
            const badFile = path.join(badDir, 'overview.json');
            writeFileSync(badFile, '{');
            try {
                runWrangler(['r2', 'object', 'put', 'voyage-public/truth/dbad/overview.json', '--local', '--persist-to', persistTo, '--file', badFile, '--content-type', 'application/json']);
            } finally {
                rmSync(badDir, { recursive: true, force: true });
            }
            const ownOnly = '~0123456789ABCDEFGHJKMNPQRS';
            for (const [version, expectChart] of [['dmiss', 503], ['dbad', 503]]) {
                const made = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: version, truthVersion: version, editionDefault: 'MgT2E' }),
                });
                assert.equal(made.status, 201, JSON.stringify(made.body));
                const chartDots = await jsonFetch(`${base}/api/universes/${made.body.data.id}/hexes/Charted/dots`, { headers: { cookie } });
                assert.equal(chartDots.status, expectChart, JSON.stringify(chartDots.body));
                assert.equal(chartDots.body.error.code, 'chart_unavailable');
                assert.equal(chartDots.body.error.message, 'The chart for this version could not be read.');
                const ownDotsOnly = await jsonFetch(`${base}/api/universes/${made.body.data.id}/hexes/${encodeURIComponent(ownOnly)}/dots`, { headers: { cookie } });
                assert.equal(ownDotsOnly.status, 200, JSON.stringify(ownDotsOnly.body));
                assert.equal(ownDotsOnly.body.data.cells, '.'.repeat(1280));
            }
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
