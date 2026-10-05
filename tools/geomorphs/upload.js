/**
 * Puts manifest.json and every PNG under assets/geomorphs into the public
 * bucket, at geomorphs/<path>. Johnny runs this. It does not upload
 * REBUILD.md or ATTRIBUTION.txt.
 *
 *   node tools/geomorphs/upload.js --dry-run
 *   node tools/geomorphs/upload.js
 *
 * wrangler r2 object has get, put, and delete. It cannot list or head an
 * object, so a real run lists keys already in voyage-public with the
 * Cloudflare API (the logged-in wrangler oauth token, or CLOUDFLARE_API_TOKEN
 * plus CLOUDFLARE_ACCOUNT_ID) and skips those. It also skips keys recorded in
 * tools/geomorphs/.uploaded.json. Puts run six at a time. A put that fails is
 * printed and counted. --dry-run only reads the disk and the local ledger. It
 * does not call wrangler, the API, or the bucket.
 */
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GEOMORPHS = path.join(ROOT, 'assets', 'geomorphs');
const LEDGER_PATH = path.join(ROOT, 'tools', 'geomorphs', '.uploaded.json');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const BUCKET = 'voyage-public';
const PREFIX = 'geomorphs/';
const AT_A_TIME = 6;

const dryRun = process.argv.includes('--dry-run');

function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.isFile() && (entry.name === 'manifest.json' || entry.name.toLowerCase().endsWith('.png'))) out.push(full);
    }
    return out;
}

function keyFor(file) {
    const rel = path.relative(GEOMORPHS, file).split(path.sep).join('/');
    return PREFIX + rel;
}

function contentType(file) {
    return file.toLowerCase().endsWith('.png') ? 'image/png' : 'application/json';
}

function readLedger() {
    if (!fs.existsSync(LEDGER_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('the upload ledger is not an object');
    return parsed;
}

function oauthCandidates() {
    const home = os.homedir();
    return [
        process.env.WRANGLER_CONFIG_PATH,
        path.join(home, '.config', '.wrangler', 'config', 'default.toml'),
        path.join(home, '.wrangler', 'config', 'default.toml'),
        process.env.APPDATA && path.join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml'),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml'),
        process.env.XDG_CONFIG_HOME && path.join(process.env.XDG_CONFIG_HOME, '.wrangler', 'config', 'default.toml'),
    ].filter(Boolean);
}

function readToken() {
    if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
    for (const file of oauthCandidates()) {
        if (!fs.existsSync(file)) continue;
        const match = fs.readFileSync(file, 'utf8').match(/^\s*oauth_token\s*=\s*"([^"]+)"/m);
        if (match) return match[1];
    }
    return '';
}

function readAccountId() {
    if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
    const out = execFileSync(process.execPath, [WRANGLER, 'whoami'], { encoding: 'utf8' });
    const labeled = out.match(/Account ID[^0-9a-f]*([0-9a-f]{32})/i);
    if (labeled) return labeled[1];
    const any = out.match(/\b[0-9a-f]{32}\b/i);
    return any ? any[0] : '';
}

async function listRemote(token, accountId) {
    const have = new Set();
    let cursor = '';
    for (;;) {
        const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET}/objects`);
        url.searchParams.set('prefix', PREFIX);
        url.searchParams.set('per_page', '1000');
        if (cursor) url.searchParams.set('cursor', cursor);
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json();
        if (!response.ok || !body.success) {
            const message = Array.isArray(body.errors) ? body.errors.map((item) => item.message).filter(Boolean).join('; ') : '';
            throw new Error(message || `list objects failed (${response.status})`);
        }
        for (const row of body.result || []) if (row && row.key) have.add(row.key);
        if (!body.result_info || !body.result_info.is_truncated) break;
        cursor = body.result_info.cursor || '';
        if (!cursor) break;
    }
    return have;
}

function remember(ledger, key, bytes) {
    ledger[key] = { bytes, at: new Date().toISOString() };
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

async function putOne(file, key) {
    await execFileAsync(process.execPath, [
        WRANGLER, 'r2', 'object', 'put', `${BUCKET}/${key}`,
        '--remote', '--file', file, '--content-type', contentType(file),
    ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}

async function pool(items, worker) {
    let next = 0;
    const size = Math.min(AT_A_TIME, items.length);
    async function one() {
        while (next < items.length) {
            const index = next;
            next += 1;
            await worker(items[index]);
        }
    }
    await Promise.all(Array.from({ length: size }, () => one()));
}

const files = walk(GEOMORPHS, []).sort();
let ledger;
try {
    ledger = readLedger();
} catch (err) {
    console.error(err.message);
    process.exit(2);
}

const rows = files.map((file) => ({ file, key: keyFor(file), bytes: fs.statSync(file).size }));
const failures = [];

if (dryRun) {
    let skipped = 0;
    let wouldSend = 0;
    let bytes = 0;
    for (const row of rows) {
        bytes += row.bytes;
        if (ledger[row.key]) {
            skipped += 1;
            console.log(`skip ${row.key}`);
        } else {
            wouldSend += 1;
            console.log(row.key);
        }
    }
    console.log(JSON.stringify({
        mode: 'dry-run', bucket: BUCKET, files: rows.length, bytes, skipped, wouldSend, remote: 'not checked', failures,
    }));
    process.exit(0);
}

let remote = new Set();
try {
    const token = readToken();
    const accountId = token ? readAccountId() : '';
    if (!token || !accountId) throw new Error('no Cloudflare token or account id');
    remote = await listRemote(token, accountId);
    console.error(`remote keys under ${PREFIX}: ${remote.size}`);
} catch (err) {
    console.error(`Could not list ${BUCKET}. Skipping only keys this script has uploaded before. ${err.message}`);
}

const pending = [];
let skipped = 0;
let bytes = 0;
for (const row of rows) {
    bytes += row.bytes;
    if (remote.has(row.key) || ledger[row.key]) skipped += 1;
    else pending.push(row);
}

let sent = 0;
let writing = Promise.resolve();
await pool(pending, async (row) => {
    try {
        await putOne(row.file, row.key);
        writing = writing.then(() => remember(ledger, row.key, row.bytes));
        await writing;
        sent += 1;
        console.log(row.key);
    } catch (err) {
        const message = String(err.stderr || err.message).trim().split('\n').slice(-3).join(' | ');
        failures.push({ key: row.key, error: message });
        console.error(`FAIL ${row.key} ${message}`);
    }
});
await writing;

console.log(JSON.stringify({ mode: 'upload', bucket: BUCKET, files: rows.length, bytes, skipped, sent, failures }));
if (failures.length) process.exit(1);
