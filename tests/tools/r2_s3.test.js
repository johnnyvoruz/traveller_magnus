import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { bucketFromWrangler, bulkPut, openLedger, putObject, signV4 } from '../../tools/truth/r2_s3.js';

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');

test('signature v4 matches the AWS test suite vector get-vanilla', () => {
    const headers = signV4({
        method: 'GET', url: 'https://example.amazonaws.com/', payloadHash: sha(''),
        accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1', service: 'service', date: new Date('2015-08-30T12:36:00Z'),
    });
    assert.equal(headers['x-amz-date'], '20150830T123600Z');
    assert.equal(headers.authorization,
        'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
});

test('bucket names come from wrangler.toml', () => {
    const toml = fs.readFileSync(new URL('../../apps/api/wrangler.toml', import.meta.url), 'utf8');
    assert.equal(bucketFromWrangler(toml, 'PUBLIC_BUCKET'), 'voyage-public');
    assert.equal(bucketFromWrangler(toml, 'PRIVATE_BUCKET'), 'voyage-private');
});

/** A mock S3 endpoint: checks the signature and body hash, can fail on purpose, counts parallelism. */
function mockS3({ flaky = new Map(), forbidden = new Set() } = {}) {
    const stored = new Map();
    const state = { inFlight: 0, peak: 0, requests: 0 };
    const server = http.createServer((req, res) => {
        const chunks = [];
        state.inFlight += 1;
        state.peak = Math.max(state.peak, state.inFlight);
        state.requests += 1;
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => setTimeout(() => {
            state.inFlight -= 1;
            const body = Buffer.concat(chunks);
            const key = decodeURIComponent(req.url.slice(1));
            const url = `http://${req.headers.host}${req.url}`;
            const date = req.headers['x-amz-date'];
            const when = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`);
            const signed = { 'content-type': req.headers['content-type'], 'x-amz-content-sha256': req.headers['x-amz-content-sha256'] };
            if (req.headers['cache-control']) signed['cache-control'] = req.headers['cache-control'];
            const expect = signV4({ method: req.method, url, headers: signed, payloadHash: sha(body), accessKeyId: 'k', secretAccessKey: 's', date: when });
            if (req.method !== 'PUT' || expect.authorization !== req.headers.authorization || req.headers['x-amz-content-sha256'] !== sha(body)) {
                res.writeHead(403); res.end('SignatureDoesNotMatch'); return;
            }
            if (forbidden.has(key)) { res.writeHead(403); res.end('AccessDenied'); return; }
            const left = flaky.get(key) || 0;
            if (left > 0) { flaky.set(key, left - 1); res.writeHead(503); res.end('SlowDown'); return; }
            stored.set(key, { body, type: req.headers['content-type'], cache: req.headers['cache-control'] });
            res.writeHead(200, { etag: `"${sha(body).slice(0, 32)}"` }); res.end();
        }, 5));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, stored, state, endpoint: `http://127.0.0.1:${server.address().port}` })));
}

function files(n) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2s3-'));
    return Array.from({ length: n }, (_, i) => {
        const file = path.join(dir, `f${i}.json`);
        fs.writeFileSync(file, JSON.stringify({ i, pad: 'x'.repeat(i * 7) }));
        return { bucket: i % 10 === 0 ? 'voyage-private' : 'voyage-public', key: `objects/h${i}`, file, cache: i % 10 === 0 ? null : 'public, max-age=31536000, immutable' };
    });
}

test('bulk put: parallel, signed, retried, resumable', async () => {
    const items = files(200);
    const flaky = new Map([['voyage-public/objects/h3', 2], ['voyage-public/objects/h7', 1]]);
    const forbidden = new Set(['voyage-public/objects/h9']);
    const s3 = await mockS3({ flaky, forbidden });
    const ledgerFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'l.txt');
    try {
        const credentials = { accessKeyId: 'k', secretAccessKey: 's' };
        let ledger = openLedger(ledgerFile);
        const first = await bulkPut(items, { endpoint: s3.endpoint, credentials, concurrency: 32, done: ledger.done, onDone: (it) => ledger.add(`${it.bucket}/${it.key}`), baseDelayMs: 1 });
        ledger.close();
        assert.equal(first.sent, 199);
        assert.deepEqual(first.failed.map((f) => f.key), ['voyage-public/objects/h9']);
        assert.match(first.failed[0].error, /HTTP 403/);
        assert.ok(s3.state.peak > 1 && s3.state.peak <= 32, `peak ${s3.state.peak}`);
        assert.equal(flaky.get('voyage-public/objects/h3'), 0);
        const one = s3.stored.get('voyage-public/objects/h5');
        assert.equal(one.cache, 'public, max-age=31536000, immutable');
        assert.equal(one.type, 'application/json');
        assert.deepEqual(one.body, fs.readFileSync(items[5].file));
        // Resume: only the failed file is sent again.
        forbidden.clear();
        const before = s3.state.requests;
        ledger = openLedger(ledgerFile);
        assert.equal(ledger.done.size, 199);
        const second = await bulkPut(items, { endpoint: s3.endpoint, credentials, concurrency: 32, done: ledger.done, onDone: (it) => ledger.add(`${it.bucket}/${it.key}`), baseDelayMs: 1 });
        ledger.close();
        assert.equal(second.sent, 1);
        assert.equal(second.skipped, 199);
        assert.equal(s3.state.requests - before, 1);
        assert.equal(s3.stored.size, 200);
    } finally {
        s3.server.close();
    }
});

test('put gives up after its attempts on a server that keeps failing', async () => {
    const [item] = files(1);
    const s3 = await mockS3({ flaky: new Map([[`${item.bucket}/${item.key}`, 99]]) });
    try {
        await assert.rejects(putObject({ endpoint: s3.endpoint, bucket: item.bucket, key: item.key, file: item.file, contentType: 'application/json', credentials: { accessKeyId: 'k', secretAccessKey: 's' }, attempts: 3, baseDelayMs: 1 }), /HTTP 503/);
        assert.equal(s3.state.requests, 3);
    } finally {
        s3.server.close();
    }
});

test('bulk put refuses to run without an endpoint and both keys', async () => {
    const items = files(1);
    for (const opts of [{ credentials: { accessKeyId: 'k', secretAccessKey: 's' } }, { endpoint: 'http://127.0.0.1:9' }, { endpoint: 'http://127.0.0.1:9', credentials: { accessKeyId: 'k' } }])
        await assert.rejects(bulkPut(items, opts), /needs an endpoint and both keys/);
});
