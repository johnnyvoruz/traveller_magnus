// tools/truth/upload_truth.js --seal: after a release, each sector index and reconciliation report of
// the released version is put again with the same bytes and 'public, max-age=31536000, immutable',
// over S3 like the upload. Tested against a local stand-in S3 server: a dry run names the count with
// no network, a version that is not released is refused before any request, and a re-run sends
// nothing that is already sealed.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { main, sealKeys, sealRefusal } from '../../tools/truth/upload_truth.js';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const KEYS = { S3_ENDPOINT_ACCESS_KEY_ID: 'k', S3_ENDPOINT_SECRET_ACCESS_KEY: 's' };
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=60';
const PUBLIC = /bucket_name\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(REPO, 'apps/api/wrangler.toml'), 'utf8').split('[[r2_buckets]]').find(b => /binding\s*=\s*"PUBLIC_BUCKET"/.test(b)))[1];

function fakeRoot({ manifest = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-seal-test-'));
    const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    w('apps/api/wrangler.toml', fs.readFileSync(path.join(REPO, 'apps/api/wrangler.toml'), 'utf8'));
    if (manifest) w('truth-local/v99/manifest.json', JSON.stringify({ sectors: [{ slug: 'Alpha' }, { slug: 'Beta' }, { slug: 'Gamma' }] }));
    return root;
}

/** A stand-in for R2's S3 interface: signed GET and PUT on path-style keys, ETag = MD5. */
async function standIn() {
    const objects = new Map();
    const requests = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const key = decodeURIComponent(req.url.slice(1));
            requests.push(`${req.method} ${key}`);
            if (!/^AWS4-HMAC-SHA256 Credential=k\//.test(req.headers.authorization || '') || !req.headers['x-amz-content-sha256']) {
                res.writeHead(403); res.end('unsigned'); return;
            }
            if (req.method === 'GET') {
                const o = objects.get(key);
                if (!o) { res.writeHead(404); res.end('NoSuchKey'); return; }
                res.writeHead(200, { 'content-type': o.type, 'cache-control': o.cache, etag: `"${o.etag}"` });
                res.end(o.body);
                return;
            }
            if (req.method === 'PUT') {
                const body = Buffer.concat(chunks);
                if (crypto.createHash('sha256').update(body).digest('hex') !== req.headers['x-amz-content-sha256']) { res.writeHead(400); res.end('hash'); return; }
                const etag = crypto.createHash('md5').update(body).digest('hex');
                objects.set(key, { body, type: req.headers['content-type'], cache: req.headers['cache-control'], etag });
                res.writeHead(200, { etag: `"${etag}"` });
                res.end();
                return;
            }
            res.writeHead(405); res.end();
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const seed = (key, body, cache = SHORT) => objects.set(`${PUBLIC}/${key}`, { body: Buffer.from(body), type: 'application/json', cache, etag: crypto.createHash('md5').update(body).digest('hex') });
    return { url: `http://127.0.0.1:${server.address().port}`, objects, requests, seed, close: () => new Promise(resolve => server.close(resolve)) };
}

function seedReleased(s3, { reconciled = false, skipReport = null, skipIndex = null } = {}) {
    s3.seed('truth/v99/manifest.json', JSON.stringify({ sectors: [{ slug: 'Alpha' }, { slug: 'Beta' }] }), IMMUTABLE);
    for (const slug of ['Alpha', 'Beta']) if (slug !== skipIndex) s3.seed(`truth/v99/sectors/${slug}/index.json`, JSON.stringify({ slug, hexes: {} }));
    s3.seed('objects/h1', '{}', IMMUTABLE);
    if (reconciled) {
        s3.seed('truth/v99/reconciliation.json', '{"from":"v98"}', IMMUTABLE);
        for (const slug of ['Alpha', 'Beta']) if (slug !== skipReport) s3.seed(`truth/v99/reconciliation/sectors/${slug}.json`, JSON.stringify({ slug, changed: 1 }));
        s3.seed('truth/v99/reconciliation/report.json', '{"total":2}');
    }
}

async function runSeal(argv, { state = 'released', stateThrows = false, root = fakeRoot(), run } = {}) {
    const calls = { readState: [], errors: [], logs: [], run: [] };
    const code = await main(argv, {
        root, env: { ...KEYS },
        log: s => calls.logs.push(s), error: s => calls.errors.push(s),
        run: run || (args => { calls.run.push(args); return ''; }),
        readState: async (version, where) => { calls.readState.push(where); if (stateThrows) throw new Error('no table'); return state; },
        put: async () => { throw new Error('the seal never bulk-uploads'); },
    });
    return { code, calls, out: calls.logs.length ? JSON.parse(calls.logs.at(-1)) : null };
}

test('sealKeys: every index, then the reports only for a reconciled version', () => {
    assert.deepEqual(sealKeys('v9', ['A', 'B'], false).map(k => k.key), ['truth/v9/sectors/A/index.json', 'truth/v9/sectors/B/index.json']);
    assert.deepEqual(sealKeys('v9', ['A'], true).map(k => k.key), ['truth/v9/sectors/A/index.json', 'truth/v9/reconciliation/sectors/A.json', 'truth/v9/reconciliation/report.json']);
    assert.equal(sealRefusal('v9', 'released'), null);
    for (const state of [null, 'building', 'withdrawn', 'failed']) assert.match(sealRefusal('v9', state), /not released/);
});

test('--seal alone is a dry run that names the count and reads nothing', async () => {
    const s3 = await standIn();
    try {
        const { code, calls, out } = await runSeal(['v99', '--seal']);
        assert.equal(code, 0);
        assert.equal(out.indexes, 3);
        assert.match(out.reports, /^4 more if truth\/v99\/reconciliation\.json exists/);
        assert.equal(out.cacheControl, IMMUTABLE);
        assert.equal(calls.readState.length, 0);
        assert.equal(calls.run.length, 0);
        assert.equal(s3.requests.length, 0);
        const none = await runSeal(['v99', '--seal'], { root: fakeRoot({ manifest: false }) });
        assert.equal(none.code, 0);
        assert.equal(none.out.indexes, null);
        assert.match(none.out.from, /read from truth\/v99\/manifest\.json/);
    } finally { await s3.close(); }
});

test('--seal --endpoint and --remote need --yes; --endpoint needs its own keys', async () => {
    for (const argv of [['v99', '--seal', '--remote'], ['v99', '--seal', '--endpoint', 'http://127.0.0.1:9']]) {
        const { code, calls } = await runSeal(argv);
        assert.equal(code, 2);
        assert.equal(calls.readState.length, 0);
    }
    const errors = [];
    const code = await main(['v99', '--seal', '--endpoint', 'http://127.0.0.1:9', '--yes'], { root: fakeRoot(), env: {}, log: () => {}, error: s => errors.push(s) });
    assert.equal(code, 2);
    assert.match(errors.join('\n'), /S3_ENDPOINT_ACCESS_KEY_ID/);
});

test('a version that is not released is refused before any request', async () => {
    const s3 = await standIn();
    try {
        seedReleased(s3);
        for (const state of [null, 'building', 'withdrawn']) {
            const { code, calls } = await runSeal(['v99', '--seal', '--endpoint', s3.url, '--yes'], { state });
            assert.equal(code, 3);
            assert.match(calls.errors.join('\n'), /not released.*Nothing was sealed/);
        }
        const unread = await runSeal(['v99', '--seal', '--endpoint', s3.url, '--yes'], { stateThrows: true });
        assert.equal(unread.code, 3);
        assert.deepEqual(s3.requests, []);
        assert.equal(s3.objects.get(`${PUBLIC}/truth/v99/sectors/Alpha/index.json`).cache, SHORT);
    } finally { await s3.close(); }
});

test('a released version: each index is put again immutable with the same bytes, nothing else', async () => {
    const s3 = await standIn();
    try {
        seedReleased(s3);
        const before = new Map([...s3.objects].map(([k, o]) => [k, o.body.toString()]));
        const { code, calls, out } = await runSeal(['v99', '--seal', '--endpoint', s3.url, '--yes']);
        assert.equal(code, 0, calls.errors.join('\n'));
        assert.deepEqual(calls.readState, ['local']);
        assert.equal(out.indexes, 2);
        assert.equal(out.reports, 0);
        assert.equal(out.reconciled, false);
        assert.equal(out.sealed, 2);
        assert.equal(out.failedCount, 0);
        for (const slug of ['Alpha', 'Beta']) {
            const o = s3.objects.get(`${PUBLIC}/truth/v99/sectors/${slug}/index.json`);
            assert.equal(o.cache, IMMUTABLE);
            assert.equal(o.type, 'application/json');
        }
        for (const [k, o] of s3.objects) assert.equal(o.body.toString(), before.get(k), `${k} changed bytes`);
        assert.deepEqual(s3.requests.filter(r => r.startsWith('PUT')).sort(), [`PUT ${PUBLIC}/truth/v99/sectors/Alpha/index.json`, `PUT ${PUBLIC}/truth/v99/sectors/Beta/index.json`]);
    } finally { await s3.close(); }
});

test('a reconciled version seals its reports too; an absent report is listed; a re-run sends nothing', async () => {
    const s3 = await standIn();
    try {
        seedReleased(s3, { reconciled: true, skipReport: 'Beta' });
        const first = await runSeal(['v99', '--seal', '--endpoint', s3.url, '--yes']);
        assert.equal(first.code, 0, first.calls.errors.join('\n'));
        assert.equal(first.out.reconciled, true);
        assert.equal(first.out.indexes, 2);
        assert.equal(first.out.reports, 3);
        assert.equal(first.out.sealed, 4);
        assert.deepEqual(first.out.absent, ['truth/v99/reconciliation/sectors/Beta.json']);
        for (const key of ['truth/v99/reconciliation/sectors/Alpha.json', 'truth/v99/reconciliation/report.json']) assert.equal(s3.objects.get(`${PUBLIC}/${key}`).cache, IMMUTABLE);
        s3.requests.length = 0;
        const again = await runSeal(['v99', '--seal', '--endpoint', s3.url, '--yes']);
        assert.equal(again.code, 0);
        assert.equal(again.out.sealed, 0);
        assert.equal(again.out.alreadySealed, 4);
        assert.equal(s3.requests.filter(r => r.startsWith('PUT')).length, 0);
    } finally { await s3.close(); }
});

test('an absent index fails the seal; a version with no released manifest seals nothing', async () => {
    const s3 = await standIn();
    try {
        seedReleased(s3, { skipIndex: 'Beta' });
        const { code, out } = await runSeal(['v99', '--seal', '--endpoint', s3.url, '--yes']);
        assert.equal(code, 1);
        assert.equal(out.sealed, 1);
        assert.deepEqual(out.failed, [{ key: 'truth/v99/sectors/Beta/index.json', error: 'absent' }]);
        s3.objects.delete(`${PUBLIC}/truth/v99/manifest.json`);
        s3.requests.length = 0;
        const none = await runSeal(['v99', '--seal', '--endpoint', s3.url, '--yes']);
        assert.equal(none.code, 1);
        assert.match(none.calls.errors.join('\n'), /no truth\/v99\/manifest\.json.*release v99 first/);
        assert.equal(s3.requests.filter(r => r.startsWith('PUT')).length, 0);
    } finally { await s3.close(); }
});

test('--seal --local re-puts through wrangler with --cache-control immutable', async () => {
    const store = new Map([
        [`${PUBLIC}/truth/v99/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Alpha' }] })],
        [`${PUBLIC}/truth/v99/sectors/Alpha/index.json`, '{"slug":"Alpha"}'],
    ]);
    const puts = [];
    const run = (args) => {
        const id = args[3];
        if (args[2] === 'get') {
            if (!store.has(id)) throw Object.assign(new Error('x'), { stderr: 'The specified key does not exist.' });
            fs.writeFileSync(args[args.indexOf('--file') + 1], store.get(id));
            return '';
        }
        if (args[2] === 'put') { puts.push({ id, body: fs.readFileSync(args[args.indexOf('--file') + 1], 'utf8'), args }); return ''; }
        throw new Error(`unexpected ${args.join(' ')}`);
    };
    const { code, calls, out } = await runSeal(['v99', '--seal', '--local'], { run });
    assert.equal(code, 0, calls.errors.join('\n'));
    assert.deepEqual(calls.readState, ['local']);
    assert.equal(out.sealed, 1);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].id, `${PUBLIC}/truth/v99/sectors/Alpha/index.json`);
    assert.equal(puts[0].body, '{"slug":"Alpha"}');
    assert.ok(puts[0].args.includes('--local'));
    assert.equal(puts[0].args[puts[0].args.indexOf('--cache-control') + 1], IMMUTABLE);
});