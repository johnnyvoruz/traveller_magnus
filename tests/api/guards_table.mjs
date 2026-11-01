/**
 * BP3. One referee and six players, three hours of table, played at 10×
 * against a local Worker. Prints every 429 and 503. Not a unit test.
 *
 *   node tests/api/guards_table.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWrangler } from './session.js';
import { apiRoot, dropRecordedHomes, noteHome, wranglerBin, wranglerLaunch } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOURS = 3;
const SPEED = 10;
const POLL_GAME_MS = 30_000;
const TICK_MS = POLL_GAME_MS / SPEED;
const TICKS = Math.round((HOURS * 60 * 60 * 1000) / POLL_GAME_MS);

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-bp3-sql-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function userCookie(userId, email, persistTo) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    sqlFile(persistTo, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function up(url) {
    const deadline = Date.now() + 90_000;
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

async function call(url, options, label, hits) {
    let response;
    try {
        response = await fetch(url, options);
    } catch (err) {
        hits.push({ label, status: 0, code: 'connection', message: err instanceof Error ? err.message : String(err) });
        return { status: 0, body: null };
    }
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
    if (response.status === 429 || response.status === 503 || response.status >= 400) {
        hits.push({
            label,
            status: response.status,
            code: body?.error?.code ?? null,
            message: body?.error?.message ?? null,
        });
    }
    return { status: response.status, body };
}

function note(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'At the table',
        body: 'A line from the session.',
        when: null,
        realDate: null,
        sequence: null,
        author: 'players',
        visibility: 'players',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: '2026-10-31T18:00:00.000Z',
        updatedAt: '2026-10-31T18:00:00.000Z',
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function cj(n) {
    return `cj_00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function tinyWebp(mark) {
    const body = Buffer.alloc(16);
    body.write('RIFF', 0);
    body.writeUInt32LE(8, 4);
    body.write('WEBP', 8);
    body.writeUInt32LE(mark, 12);
    return body;
}

const port = 18962;
const inspectorPort = 19962;
const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-bp3-'));
const base = `http://127.0.0.1:${port}`;
const hits = [];
let child = null;
let noteSeq = 1;

try {
    runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
    const stamp = randomBytes(3).toString('hex');
    sqlFile(persistTo, `
INSERT INTO platform_flags (key, value, updated_at, updated_by)
VALUES ('agent_access', 'on', '2026-10-31T18:00:00.000Z', 'bp3');
`);
    const owner = userCookie(`bp3o${stamp}`, `bp3o${stamp}@localhost`, persistTo);
    const players = [];
    for (let i = 0; i < 6; i += 1) {
        players.push(userCookie(`bp3p${i}${stamp}`, `bp3p${i}${stamp}@localhost`, persistTo));
    }
    const ownerHeaders = { 'content-type': 'application/json', cookie: owner };
    const logPath = path.join(persistTo, 'wrangler.log');
    const logFd = openSync(logPath, 'w');
    const launch = wranglerLaunch([
        'dev', '--port', String(port), '--ip', '127.0.0.1',
        '--inspector-port', String(inspectorPort), '--persist-to', persistTo,
    ]);
    child = spawn(process.execPath, [wranglerBin, ...launch.args], {
        cwd: apiRoot,
        env: { ...process.env, CI: '1' },
        stdio: ['ignore', logFd, logFd],
        windowsHide: true,
    });
    noteHome(persistTo, launch.home);
    await up(base);

    const created = await call(`${base}/api/universes`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ name: 'Table night', truthVersion: null, editionDefault: 'MgT2E' }),
    }, 'create universe', hits);
    if (created.status !== 201) throw new Error(`create ${created.status} ${JSON.stringify(created.body)}`);
    const id = created.body.data.id;
    const invite = await call(`${base}/api/universes/${id}/players/invite`, {
        method: 'POST',
        headers: ownerHeaders,
    }, 'invite', hits);
    if (invite.status !== 200) throw new Error(`invite ${invite.status} ${JSON.stringify(invite.body)}`);
    const token = invite.body.data.url.split('/join/')[1];
    for (let i = 0; i < players.length; i += 1) {
        const joined = await call(`${base}/api/join`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: players[i] },
            body: JSON.stringify({ token }),
        }, `join ${i}`, hits);
        if (joined.status !== 200) throw new Error(`join ${i} ${joined.status} ${JSON.stringify(joined.body)}`);
    }

    const changes = `${base}/api/universes/${id}/campaign/changes`;
    const parentId = cj(noteSeq);
    noteSeq += 1;
    const parent = await call(changes, {
        method: 'PATCH',
        headers: ownerHeaders,
        body: JSON.stringify({ journal: [note(parentId, { title: 'Briefing' })] }),
    }, 'referee briefing', hits);
    if (parent.status !== 200) throw new Error(`briefing ${parent.status} ${JSON.stringify(parent.body)}`);

    const minted = await call(`${base}/api/tokens`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ name: 'Table paste', scopes: ['proposals:write'], universeId: id }),
    }, 'mint token', hits);
    if (minted.status !== 201) throw new Error(`token ${minted.status} ${JSON.stringify(minted.body)}`);
    const bearer = { authorization: `Bearer ${minted.body.data.token}`, 'content-type': 'application/json' };

    const campaignUrl = `${base}/api/universes/${id}/campaign?after=0&limit=1000`;
    const seats = [{ cookie: owner, who: 'referee' }, ...players.map((cookie, i) => ({ cookie, who: `player ${i}` }))];

    function playerWriteTick(player, n) {
        return 12 + player * 4 + n * 34;
    }

    const started = Date.now();
    let completed = 0;
    for (let tick = 0; tick < TICKS; tick += 1) {
        completed = tick + 1;
        const due = started + tick * TICK_MS;
        const wait = due - Date.now();
        if (wait > 0) await sleep(wait);
        await Promise.all(seats.map((seat) => call(campaignUrl, {
            headers: { cookie: seat.cookie },
        }, `poll ${seat.who}`, hits)));
        const recent = hits.slice(-14);
        if (recent.length === 14 && recent.every((row) => row.code === 'connection')) break;

        if (tick === 40 || tick === 160 || tick === 280) {
            const idNote = cj(noteSeq);
            noteSeq += 1;
            await call(changes, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({ journal: [note(idNote, { title: 'Referee note' })] }),
            }, 'referee note', hits);
        }
        if (tick === 180) {
            await call(changes, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({ clock: { days: 120, baseRev: 0 } }),
            }, 'jump clock', hits);
        }
        if (tick === 120 || tick === 240) {
            const bytes = tinyWebp(tick);
            const hash = createHash('sha256').update(bytes).digest('hex');
            await call(`${base}/api/universes/${id}/objects/${hash}`, {
                method: 'PUT',
                headers: { cookie: owner, 'content-type': 'image/webp' },
                body: bytes,
            }, `image ${tick}`, hits);
        }
        for (let p = 0; p < 6; p += 1) {
            for (let n = 0; n < 6; n += 1) {
                if (tick !== playerWriteTick(p, n)) continue;
                const idNote = cj(noteSeq);
                noteSeq += 1;
                await call(changes, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json', cookie: players[p] },
                    body: JSON.stringify({ journal: [note(idNote, { title: `Player ${p} note ${n}` })] }),
                }, `player ${p} note`, hits);
            }
            for (let n = 0; n < 4; n += 1) {
                if (tick !== playerWriteTick(p, n) + 17) continue;
                const idNote = cj(noteSeq);
                noteSeq += 1;
                await call(changes, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json', cookie: players[p] },
                    body: JSON.stringify({
                        journal: [note(idNote, { parent: parentId, title: `Player ${p} reply ${n}` })],
                    }),
                }, `player ${p} reply`, hits);
            }
        }
        if (tick === 300) {
            const proposals = Array.from({ length: 40 }, (_, n) => ({
                op: 'question',
                text: `What did the table decide about item ${n}?`,
                evidence: [{ at: '00:01', quote: `Heard item ${n}.` }],
            }));
            const submitted = await call(`${base}/api/universes/${id}/campaign/proposals`, {
                method: 'POST',
                headers: bearer,
                body: JSON.stringify({
                    format: 'voyage-proposals',
                    schemaVersion: 1,
                    idempotencyKey: `bp3-${stamp}`,
                    source: { kind: 'transcript', label: 'Thursday table', realDate: null },
                    proposals,
                }),
            }, 'paste 40', hits);
            if (submitted.status === 201) {
                const decisions = submitted.body.data.batch.proposals.map((row) => ({
                    proposalId: row.id,
                    action: 'accept',
                }));
                await call(`${base}/api/universes/${id}/campaign/proposals/${submitted.body.data.batch.id}/resolve`, {
                    method: 'POST',
                    headers: ownerHeaders,
                    body: JSON.stringify({ decisions }),
                }, 'apply 40', hits);
            }
        }
        if (tick % 60 === 0) {
            process.stderr.write(`tick ${tick}/${TICKS} refusals ${hits.length}\n`);
        }
    }

    const refused = hits.filter((row) => row.status === 429 || row.status === 503);
    const other = hits.filter((row) => row.status !== 429 && row.status !== 503);
    let workerLog = '';
    try {
        workerLog = readFileSync(logPath, 'utf8').slice(-4000);
    } catch { /* the log is optional */ }
    process.stdout.write(`${JSON.stringify({
        ticks: TICKS,
        completed,
        tickMs: TICK_MS,
        wallMs: Date.now() - started,
        refusals: refused,
        otherErrors: other,
        workerLog,
    }, null, 2)}\n`);
} finally {
    if (child?.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    dropRecordedHomes(persistTo);
    rmSync(persistTo, { recursive: true, force: true });
}
