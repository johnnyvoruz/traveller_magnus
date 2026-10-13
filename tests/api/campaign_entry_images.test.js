import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-12T00:00:00.000Z';
const JOURNAL = 'cj_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function userCookie(userId, email, persistTo) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
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

function picture(letter) {
    const thumb = String.fromCharCode(letter.charCodeAt(0) + 1);
    return { hash: letter.repeat(64), thumbHash: thumb.repeat(64), width: 4, height: 4, bytes: 8 };
}

function entry(over = {}) {
    return {
        id: JOURNAL,
        kind: 'note',
        title: 'Handout',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
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

function sqliteFiles(dir, out = []) {
    let names = [];
    try { names = readdirSync(dir); } catch { return out; }
    for (const name of names) {
        const full = path.join(dir, name);
        let info;
        try { info = statSync(full); } catch { continue; }
        if (info.isDirectory()) sqliteFiles(full, out);
        else if (name.endsWith('.sqlite')) out.push(full);
    }
    return out;
}

function stripImagesColumn(persistTo) {
    for (const file of sqliteFiles(persistTo)) {
        let db;
        try { db = new DatabaseSync(file); } catch { continue; }
        try {
            const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'campaign_journal'`).all();
            if (!tables.length) {
                db.close();
                continue;
            }
            const row = db.prepare(`SELECT id FROM campaign_journal WHERE id = ?`).get(JOURNAL);
            if (!row) {
                db.close();
                continue;
            }
            db.exec('BEGIN');
            db.exec(`ALTER TABLE campaign_journal RENAME TO campaign_journal_old`);
            db.exec(`CREATE TABLE campaign_journal (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                when_json TEXT,
                real_date TEXT,
                sequence INTEGER,
                author TEXT NOT NULL,
                visibility TEXT NOT NULL,
                anchor TEXT,
                mentions TEXT NOT NULL,
                rev INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted INTEGER NOT NULL
            )`);
            db.exec(`INSERT INTO campaign_journal (
                id, kind, title, body, when_json, real_date, sequence, author, visibility,
                anchor, mentions, rev, seq, created_at, updated_at, deleted
            ) SELECT
                id, kind, title, body, when_json, real_date, sequence, author, visibility,
                anchor, mentions, rev, seq, created_at, updated_at, deleted
            FROM campaign_journal_old`);
            db.exec(`DROP TABLE campaign_journal_old`);
            db.exec('COMMIT');
            db.close();
            return;
        } catch (err) {
            try { db.close(); } catch { /* already closed */ }
            throw err;
        }
    }
    throw new Error('The journal table was not in the local state.');
}

if (process.env.RUN_API_TESTS !== '1') {
    test('journal entry images on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('a journal entry stores images and an old table reads null', { timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-entry-img-'));
        const port = 18844;
        const inspectorPort = 19844;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`img${stamp}`, `img${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Handouts', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const images = [picture('a'), picture('c')];
            const saved = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [entry({ images })] }),
            });
            assert.equal(saved.status, 200, JSON.stringify(saved.body));
            assert.equal(saved.body.data.conflicts.length, 0, JSON.stringify(saved.body));
            const rev = saved.body.data.applied[0].rev;

            async function readEntry(universeId = id) {
                const page = await jsonFetch(`${base}/api/universes/${universeId}/campaign?after=0&limit=1000`, { headers: { cookie } });
                assert.equal(page.status, 200, JSON.stringify(page.body));
                return page.body.data.journal.find((row) => row.id === JOURNAL);
            }
            assert.deepEqual((await readEntry()).images, images);

            const renamed = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [entry({ title: 'Kept', baseRev: rev, rev })] }),
            });
            assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
            const kept = await readEntry();
            assert.equal(kept.title, 'Kept');
            assert.deepEqual(kept.images, images);

            const exported = await jsonFetch(`${base}/api/universes/${id}/campaign/export`, { headers: { cookie } });
            assert.equal(exported.status, 200, JSON.stringify(exported.body));
            assert.deepEqual(exported.body.journal[0].images, images);
            const copyHome = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Copy', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(copyHome.status, 201, JSON.stringify(copyHome.body));
            const copied = await jsonFetch(`${base}/api/universes/${copyHome.body.data.id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [{ ...exported.body.journal[0], baseRev: 0 }] }),
            });
            assert.equal(copied.status, 200, JSON.stringify(copied.body));
            assert.deepEqual((await readEntry(copyHome.body.data.id)).images, images);

            const older = { ...exported.body.journal[0], baseRev: 0 };
            delete older.images;
            const oldHome = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Older file', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(oldHome.status, 201, JSON.stringify(oldHome.body));
            const imported = await jsonFetch(`${base}/api/universes/${oldHome.body.data.id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [older] }),
            });
            assert.equal(imported.status, 200, JSON.stringify(imported.body));
            assert.equal((await readEntry(oldHome.body.data.id)).images, null);

            const cleared = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [entry({ images: null, baseRev: kept.rev, rev: kept.rev })] }),
            });
            assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
            assert.equal((await readEntry()).images, null);

            const tooMany = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    journal: [entry({
                        id: 'cj_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
                        images: Array.from({ length: 13 }, () => picture('e')),
                    })],
                }),
            });
            assert.equal(tooMany.status, 400, JSON.stringify(tooMany.body));
            assert.equal(tooMany.body.error.code, 'validation');
            assert.equal(tooMany.body.error.message, 'An entry can hold 12 images.');
            assert.equal((await readEntry()).images, null);

            const before = await readEntry();
            stopDev(child.pid);
            child = null;
            await sleep(1000);
            stripImagesColumn(persistTo);
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const aged = await readEntry();
            assert.equal(aged.images, null);
            assert.equal(aged.rev, before.rev);
            const added = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [entry({ title: aged.title, baseRev: aged.rev, rev: aged.rev, images: [picture('a')] })] }),
            });
            assert.equal(added.status, 200, JSON.stringify(added.body));
            assert.equal(added.body.data.conflicts.length, 0, JSON.stringify(added.body));
            assert.deepEqual((await readEntry()).images, [picture('a')]);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
