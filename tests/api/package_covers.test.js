import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RECORD = 'cr_11111111-1111-4111-8111-111111111111';
const STAMP_TIME = '2026-10-11T00:00:00.000Z';
const SETTINGS = JSON.stringify({
    generationPopMax: 20,
    generationPopMod: 0,
    generationTlMax: 20,
    generationTlMod: 0,
    generationUseRealisticStellar: false,
    generationUseTlFloor: false,
    generationRttSettlement: 2,
    generationRttTL: 15,
    generationStarportMax: 'A',
    generationStarportMod: 0,
    generationNoTravelZones: false,
    generationPopCheckFrequency: 100,
});

function authSecret() {
    const text = readFileSync(path.join(root, 'apps/api/.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function userCookie(userId, email, persistTo, role = 'user') {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-user-')), 'user.sql');
    writeFileSync(file, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, '${role}', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

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

function r2Get(persistTo, key) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'out');
    runWrangler(['r2', 'object', 'get', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
    return readFileSync(file, 'utf8');
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body };
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

function record(id) {
    return {
        id,
        type: 'place',
        kind: '',
        name: 'Startown',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 0,
        createdAt: STAMP_TIME,
        updatedAt: STAMP_TIME,
        deleted: false,
        baseRev: 0,
    };
}

async function untilSettled(base, packageId, version, cookie) {
    const deadline = Date.now() + 45000;
    let last = null;
    while (Date.now() < deadline) {
        last = await jsonFetch(`${base}/api/packages/${packageId}/versions/${version}`, { headers: { cookie } });
        const state = last.body?.data?.state;
        if (state === 'done' || state === 'failed') return last;
        await sleep(250);
    }
    return last;
}

async function settle(base, packageId, version, cookie) {
    const done = await untilSettled(base, packageId, version, cookie);
    assert.equal(done.body.data.state, 'done', JSON.stringify(done.body));
}


async function webp(width, height, shade, quality = 80) {
    const { default: sharp } = await import('sharp');
    const bytes = await sharp({ create: { width, height, channels: 3, background: { r: shade, g: 40, b: 90 } } }).webp({ quality }).toBuffer();
    return { bytes, hash: createHash('sha256').update(bytes).digest('hex'), width, height };
}

function fakeWebp(size) {
    const bytes = Buffer.alloc(size, 7);
    bytes.write('RIFF', 0, 'ascii');
    bytes.write('WEBP', 8, 'ascii');
    return { bytes, hash: createHash('sha256').update(bytes).digest('hex') };
}

function has(persistTo, bucket, key) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'out');
    try {
        runWrangler(['r2', 'object', 'get', `${bucket}/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
    } catch {
        return false;
    }
    return existsSync(file) && readFileSync(file).byteLength > 0;
}

function rowsOf(persistTo, sql) {
    const text = runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--json', '--command', sql]);
    const parsed = JSON.parse(text.slice(text.indexOf('[')));
    return parsed[0].results;
}

function coverForm(image, thumb, hash = image.hash, thumbHash = thumb.hash) {
    const form = new FormData();
    form.set('image', new Blob([image.bytes], { type: 'image/webp' }), 'cover.webp');
    form.set('thumb', new Blob([thumb.bytes], { type: 'image/webp' }), 'thumb.webp');
    form.set('hash', hash);
    form.set('thumbHash', thumbHash);
    return form;
}

function imageOf(full, thumb) {
    return { hash: full.hash, thumbHash: thumb.hash, width: full.width, height: full.height, bytes: full.bytes.byteLength };
}

async function world(base, persistTo, stamp) {
    const version = `cov${stamp}`;
    sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.1.0', 'M1105', 'TravellerMagnus', '${SETTINGS}', '[]', 'released', '${STAMP_TIME}', '${STAMP_TIME}', 0, 0, '[]');
`);
    const chartBody = '{"chart":true}';
    const chartHash = createHash('sha256').update(chartBody).digest('hex');
    const chartEntry = { tree: chartHash, type: 'SYSTEM_PRESENT', name: 'Charted', uwp: 'A000000-0', allegiance: '', zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null };
    r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }] }));
    r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: { 1910: chartEntry } }));
    r2Put(persistTo, `objects/${chartHash}`, chartBody);
    return version;
}

const NAME = 'package covers (F17)';
const R2 = 'cr_22222222-2222-4222-8222-222222222222';
const R3 = 'cr_33333333-3333-4333-8333-333333333333';

if (process.env.RUN_API_TESTS !== '1') {
    test(NAME, { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test(NAME, { skip: 'wrangler is absent' }, () => {});
} else {
    test(NAME + ': record art, upload, refusals, delete, takedown and restore, backfill', { timeout: 600000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-covers-'));
        const port = 18887;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = await world(base, persistTo, stamp);
            const author = userCookie(`cva${stamp}`, `cva${stamp}@localhost`, persistTo);
            const reader = userCookie(`cvb${stamp}`, `cvb${stamp}@localhost`, persistTo);
            const admin = userCookie(`cvc${stamp}`, `cvc${stamp}@localhost`, persistTo, 'admin');
            const aHeaders = { 'content-type': 'application/json', cookie: author };
            child = startDev({ port, persistTo, inspectorPort: 19887 });
            await up(base);

            const made = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ name: 'Source', truthVersion: version, editionDefault: 'MgT2E' }) });
            assert.equal(made.status, 201, JSON.stringify(made.body));
            const source = made.body.data.id;
            const art1 = await webp(800, 450, 10);
            const thumb1 = await webp(320, 180, 11);
            const art2 = await webp(800, 450, 20);
            const thumb2 = await webp(320, 180, 21);
            for (const image of [art1, thumb1, art2, thumb2]) {
                const put = await fetch(`${base}/api/universes/${source}/objects/${image.hash}`, { method: 'PUT', headers: { cookie: author, 'content-type': 'image/webp' }, body: image.bytes });
                assert.equal(put.status < 300, true, `object ${put.status}`);
            }
            const seeded = await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, {
                method: 'PATCH', headers: aHeaders,
                body: JSON.stringify({ records: [
                    record(RECORD),
                    { ...record(R2), name: 'Second', images: [imageOf(art1, thumb1)] },
                    { ...record(R3), name: 'Third', images: [imageOf(art2, thumb2), imageOf(art1, thumb1)] },
                ] }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const publish = async (title, recordIds) => {
                const created = await jsonFetch(`${base}/api/packages`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ title, kind: 'people', description: '', tags: [], universeId: source }) });
                assert.equal(created.status, 201, JSON.stringify(created.body));
                const id = created.body.data.id;
                const v1 = await jsonFetch(`${base}/api/packages/${id}/versions`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ universeId: source, hexKeys: ['Chart/1910'], recordIds }) });
                assert.equal(v1.status, 202, JSON.stringify(v1.body));
                await settle(base, id, 1, author);
                return id;
            };
            // Record order is the package's: the first record has no image, so the third record's first image wins.
            const P = await publish('Covered', [RECORD, R3, R2]);
            const Q = await publish('Plain', [RECORD]);
            const page = async (id, cookie) => jsonFetch(`${base}/api/packages/${id}`, cookie ? { headers: { cookie } } : undefined);
            let read = await page(P);
            assert.equal(read.status, 200, JSON.stringify(read.body));
            assert.deepEqual(read.body.data.cover, { hash: art2.hash, thumbHash: thumb2.hash, source: 'record' });
            assert.equal((await page(Q)).body.data.cover, null, 'no record art: the browser default');
            const catalogue = await jsonFetch(`${base}/api/packages?sort=title`);
            const cards = Object.fromEntries(catalogue.body.data.items.map((item) => [item.id, item]));
            assert.deepEqual(cards[P].cover, { hash: art2.hash, thumbHash: thumb2.hash, source: 'record' });
            assert.equal(cards[Q].cover, null);
            assert.deepEqual(Object.keys(cards[P]).sort(), ['authorHandle', 'cover', 'edition', 'hexCount', 'hidden', 'id', 'installs', 'kind', 'latestVersion', 'recordCount', 'tags', 'title', 'truthVersion', 'updatedAt']);

            // Backfill: a version from before 0019 has no art row; the first read fills it from the manifest.
            sqlFile(persistTo, `UPDATE package_versions SET art_hash = NULL, art_thumb_hash = NULL, image_hashes = NULL, art_filled = 0 WHERE package_id = '${P}';`);
            read = await page(P);
            assert.deepEqual(read.body.data.cover, { hash: art2.hash, thumbHash: thumb2.hash, source: 'record' });
            const filled = rowsOf(persistTo, `SELECT art_hash, art_filled, image_hashes FROM package_versions WHERE package_id = '${P}'`)[0];
            assert.equal(filled.art_hash, art2.hash);
            assert.equal(filled.art_filled, 1);
            assert.deepEqual(JSON.parse(filled.image_hashes).sort(), [art1.hash, art2.hash, thumb1.hash, thumb2.hash].sort());

            // Refusals.
            const cover = await webp(1600, 900, 30);
            const thumb = await webp(640, 360, 31);
            const send = (id, form, cookie = author) => jsonFetch(`${base}/api/packages/${id}/cover`, { method: 'PUT', headers: { cookie }, body: form });
            const refused = async (form, message, status = 400) => {
                const res = await send(P, form);
                assert.equal(res.status, status, JSON.stringify(res.body));
                assert.equal(res.body.error.message, message);
            };
            await refused(JSON.stringify({ hash: cover.hash }), 'The cover could not be read. Choose the image again.');
            const partial = new FormData();
            partial.set('image', new Blob([cover.bytes]), 'c.webp');
            await refused(partial, 'The cover could not be read. Choose the image again.');
            await refused(coverForm(cover, thumb, 'ABC'), 'That image could not be checked. Choose the file again.');
            const huge = fakeWebp(2 * 1024 * 1024 + 1);
            await refused(coverForm(huge, thumb), 'A cover is at most 2 MB.');
            const png = await (await import('sharp')).default({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
            await refused(coverForm({ bytes: png, hash: createHash('sha256').update(png).digest('hex') }, thumb), 'A cover is a WebP image.');
            await refused(coverForm(await webp(1700, 100, 1), thumb), 'A cover is at most 1600 px on its long side.');
            await refused(coverForm(cover, await webp(100, 700, 2)), 'A cover thumbnail is at most 640 px on its long side.');
            await refused(coverForm(cover, fakeWebp(200 * 1024 + 1)), 'A cover thumbnail is at most 200 KB.');
            await refused(coverForm(cover, { bytes: png, hash: createHash('sha256').update(png).digest('hex') }), 'A cover thumbnail is a WebP image.');
            await refused(coverForm(cover, thumb, thumb.hash, thumb.hash), 'The hash does not match the cover.');
            await refused(coverForm(cover, thumb, cover.hash, cover.hash), 'The thumbnail does not match. Choose the image again.');
            const stranger = await send(P, coverForm(cover, thumb), reader);
            assert.equal(stranger.status, 404, 'not the author');
            assert.equal(has(persistTo, 'voyage-public', `objects/${cover.hash}`), false, 'nothing stored by a refusal');

            // An upload wins over record art; any aspect ratio is taken.
            const up1 = await send(P, coverForm(cover, thumb));
            assert.equal(up1.status, 200, JSON.stringify(up1.body));
            assert.deepEqual(up1.body.data.cover, { hash: cover.hash, thumbHash: thumb.hash, source: 'upload' });
            assert.deepEqual((await page(P)).body.data.cover, up1.body.data.cover);
            assert.equal(has(persistTo, 'voyage-public', `objects/${cover.hash}`), true);
            // Replacing deletes the old pair, which nothing else names.
            const tall = await webp(600, 1600, 40);
            const tallThumb = await webp(240, 640, 41);
            assert.equal((await send(P, coverForm(tall, tallThumb))).status, 200);
            assert.equal(has(persistTo, 'voyage-public', `objects/${cover.hash}`), false, 'old cover deleted');
            assert.equal(has(persistTo, 'voyage-public', `objects/${thumb.hash}`), false, 'old thumbnail deleted');
            // A cover that is also a published record's image is kept when replaced or removed.
            const shared = await webp(800, 450, 10);
            assert.equal(shared.hash, art1.hash, 'sharp is deterministic');
            assert.equal((await send(P, coverForm(art1, thumb1))).status, 200);
            assert.equal(has(persistTo, 'voyage-public', `objects/${tall.hash}`), false);
            const removed = await jsonFetch(`${base}/api/packages/${P}/cover`, { method: 'DELETE', headers: { cookie: author } });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            assert.deepEqual(removed.body.data.cover, { hash: art2.hash, thumbHash: thumb2.hash, source: 'record' }, 'back to record art');
            assert.equal(has(persistTo, 'voyage-public', `objects/${art1.hash}`), true, 'a record still names it');
            const strangerDelete = await jsonFetch(`${base}/api/packages/${P}/cover`, { method: 'DELETE', headers: { cookie: reader } });
            assert.equal(strangerDelete.status, 404);
            // A cover another package names stays when this one lets it go.
            assert.equal((await send(Q, coverForm(cover, thumb))).status, 200);
            assert.equal((await send(P, coverForm(cover, thumb))).status, 200);
            assert.equal((await jsonFetch(`${base}/api/packages/${P}/cover`, { method: 'DELETE', headers: { cookie: author } })).status, 200);
            assert.equal(has(persistTo, 'voyage-public', `objects/${cover.hash}`), true, 'Q still names it');
            assert.equal((await jsonFetch(`${base}/api/packages/${Q}/cover`, { method: 'DELETE', headers: { cookie: author } })).status, 200);
            assert.equal(has(persistTo, 'voyage-public', `objects/${cover.hash}`), false, 'nothing names it now');

            // Takedown moves the uploaded cover to the private bucket; restore puts it back.
            assert.equal((await send(P, coverForm(tall, tallThumb))).status, 200);
            const down = await jsonFetch(`${base}/api/admin/packages/${P}/takedown`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ reason: 'Test.' }) });
            assert.equal(down.status, 200, JSON.stringify(down.body));
            assert.equal(has(persistTo, 'voyage-public', `objects/${tall.hash}`), false);
            assert.equal(has(persistTo, 'voyage-private', `takedown/covers/${P}/${tall.hash}`), true);
            assert.equal(has(persistTo, 'voyage-public', `objects/${art2.hash}`), true, 'record art stays');
            assert.equal((await page(P, author)).body.data.cover, null, 'the author is not an admin');
            assert.equal((await page(P, reader)).status, 404);
            assert.equal((await page(P, admin)).body.data.cover.source, 'upload');
            const hiddenList = await jsonFetch(`${base}/api/packages?mine=1`, { headers: { cookie: author } });
            assert.equal(hiddenList.body.data.items.find((item) => item.id === P).cover, null);
            const hiddenUpload = await send(P, coverForm(cover, thumb));
            assert.equal(hiddenUpload.status, 403);
            assert.equal(hiddenUpload.body.error.message, 'A hidden package cannot change its cover.');
            const back = await jsonFetch(`${base}/api/admin/packages/${P}/restore`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin }, body: '{}' });
            assert.equal(back.status, 200, JSON.stringify(back.body));
            assert.equal(has(persistTo, 'voyage-public', `objects/${tall.hash}`), true);
            assert.equal(has(persistTo, 'voyage-private', `takedown/covers/${P}/${tall.hash}`), false);
            assert.equal((await page(P)).body.data.cover.hash, tall.hash);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });

    test(NAME + ': without 0019 every cover is null and an upload is refused', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-covers-old-'));
        const port = 18888;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, ['packages.cover_hash', 'packages.cover_thumb_hash', 'package_versions.art_hash', 'package_versions.art_thumb_hash', 'package_versions.image_hashes', 'package_versions.art_filled']
                .map((name) => { const [table, column] = name.split('.'); return `ALTER TABLE ${table} DROP COLUMN ${column};`; }).join('\n'));
            const stamp = randomBytes(4).toString('hex');
            const version = await world(base, persistTo, stamp);
            const author = userCookie(`cvo${stamp}`, `cvo${stamp}@localhost`, persistTo);
            const aHeaders = { 'content-type': 'application/json', cookie: author };
            child = startDev({ port, persistTo, inspectorPort: 19888 });
            await up(base);
            const made = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ name: 'Source', truthVersion: version, editionDefault: 'MgT2E' }) });
            const source = made.body.data.id;
            const art = await webp(800, 450, 10);
            const thumb = await webp(320, 180, 11);
            for (const image of [art, thumb]) {
                await fetch(`${base}/api/universes/${source}/objects/${image.hash}`, { method: 'PUT', headers: { cookie: author, 'content-type': 'image/webp' }, body: image.bytes });
            }
            await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, { method: 'PATCH', headers: aHeaders, body: JSON.stringify({ records: [{ ...record(RECORD), images: [imageOf(art, thumb)] }] }) });
            const created = await jsonFetch(`${base}/api/packages`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ title: 'Old', kind: 'people', description: '', tags: [], universeId: source }) });
            const id = created.body.data.id;
            const v1 = await jsonFetch(`${base}/api/packages/${id}/versions`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ universeId: source, hexKeys: ['Chart/1910'], recordIds: [RECORD] }) });
            assert.equal(v1.status, 202, JSON.stringify(v1.body));
            await settle(base, id, 1, author);
            const read = await jsonFetch(`${base}/api/packages/${id}`);
            assert.equal(read.status, 200, JSON.stringify(read.body));
            assert.equal(read.body.data.cover, null);
            const list = await jsonFetch(`${base}/api/packages?sort=title`);
            assert.equal(list.body.data.items[0].cover, null);
            const res = await jsonFetch(`${base}/api/packages/${id}/cover`, { method: 'PUT', headers: { cookie: author }, body: coverForm(art, thumb) });
            assert.equal(res.status, 503);
            assert.equal(res.body.error.message, 'Covers are not available yet.');
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
