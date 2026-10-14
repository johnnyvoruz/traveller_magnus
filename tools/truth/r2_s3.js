/**
 * Bulk PUT to R2 through its S3-compatible API: AWS Signature Version 4 with node:crypto,
 * a fixed pool of parallel requests, retries with backoff, and a resumable ledger.
 * No SDK: the signer is ~40 lines and is checked against AWS's published test vector
 * (tests/tools/r2_s3.test.js).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding of one path segment, as S3 expects (no double encoding). */
function encodeSegment(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export function canonicalPath(pathname) {
    return pathname.split('/').map(encodeSegment).join('/');
}

/**
 * Sign one request. headers: plain object (host is taken from the url). Returns the headers to
 * send, with x-amz-date and authorization added.
 */
export function signV4({ method, url, headers = {}, payloadHash, accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date() }) {
    const u = new URL(url);
    const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const all = { ...headers, host: u.host, 'x-amz-date': amzDate };
    const names = Object.keys(all).map((n) => n.toLowerCase()).sort();
    const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
    const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
    const signedHeaders = names.join(';');
    const query = [...u.searchParams.entries()]
        .map(([k, v]) => [encodeSegment(k), encodeSegment(v)])
        .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
        .map(([k, v]) => `${k}=${v}`).join('&');
    const canonicalRequest = [method, canonicalPath(u.pathname), query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${day}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
    const key = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), service), 'aws4_request');
    const signature = crypto.createHmac('sha256', key).update(stringToSign).digest('hex');
    const out = { ...headers, 'x-amz-date': amzDate };
    out.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return out;
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** PUT one file; retries on network errors, 408/429/5xx, with exponential backoff and jitter. */
export async function putObject({ endpoint, bucket, key, file, contentType, cacheControl, credentials, attempts = 6, baseDelayMs = 250, fetchImpl = fetch }) {
    const body = fs.readFileSync(file);
    const payloadHash = sha256(body);
    const url = `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    let last;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const headers = signV4({
            method: 'PUT', url, payloadHash, ...credentials,
            headers: {
                'content-type': contentType,
                ...(cacheControl ? { 'cache-control': cacheControl } : {}),
                'x-amz-content-sha256': payloadHash,
            },
        });
        try {
            const res = await fetchImpl(url, { method: 'PUT', headers, body });
            if (res.ok) {
                await res.arrayBuffer().catch(() => null);
                return { bytes: body.length, etag: res.headers.get('etag'), attempts: attempt };
            }
            const text = await res.text().catch(() => '');
            last = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
            if (!RETRY_STATUS.has(res.status)) throw Object.assign(last, { fatal: true });
        } catch (err) {
            if (err.fatal) throw err;
            last = err;
        }
        if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random()));
    }
    throw last;
}

/**
 * Upload every item with `concurrency` requests in flight. Items already in `done` (a Set of
 * "bucket/key") are skipped; each success is reported through onDone so the caller can append
 * it to a ledger. Returns { sent, skipped, bytes, failed }.
 */
export async function bulkPut(items, { endpoint, credentials, concurrency = 64, done = new Set(), onDone = () => {}, onProgress = () => {}, fetchImpl, attempts, baseDelayMs }) {
    // No default keys: a caller that has none must not reach an endpoint at all.
    if (!endpoint || !credentials || !credentials.accessKeyId || !credentials.secretAccessKey) throw new Error('bulkPut needs an endpoint and both keys');
    const queue = items.filter((item) => !done.has(`${item.bucket}/${item.key}`));
    const skipped = items.length - queue.length;
    let next = 0;
    let sent = 0;
    let bytes = 0;
    const failed = [];
    async function worker() {
        while (next < queue.length) {
            const item = queue[next];
            next += 1;
            try {
                const result = await putObject({
                    endpoint, credentials, fetchImpl, attempts, baseDelayMs,
                    bucket: item.bucket, key: item.key, file: item.file,
                    contentType: item.type || 'application/json', cacheControl: item.cache,
                });
                sent += 1;
                bytes += result.bytes;
                onDone(item, result);
                onProgress({ sent, bytes, total: queue.length });
            } catch (err) {
                failed.push({ key: `${item.bucket}/${item.key}`, error: String(err.message || err).slice(0, 300) });
            }
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
    return { sent, skipped, bytes, failed };
}

/** Ledger: one "bucket/key" per line, appended as uploads finish, so a re-run resumes. */
export function openLedger(file) {
    const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);
    const fd = fs.openSync(file, 'a');
    return {
        done,
        add(id) { if (!done.has(id)) { done.add(id); fs.writeSync(fd, id + '\n'); } },
        close() { fs.closeSync(fd); },
    };
}

/** bucket_name for a binding in apps/api/wrangler.toml ([[r2_buckets]] binding / bucket_name pairs). */
export function bucketFromWrangler(toml, binding) {
    for (const block of toml.split(/\[\[r2_buckets\]\]/).slice(1)) {
        const b = /binding\s*=\s*"([^"]+)"/.exec(block);
        const n = /bucket_name\s*=\s*"([^"]+)"/.exec(block);
        if (b && n && b[1] === binding) return n[1];
    }
    throw new Error(`no r2 bucket for binding ${binding} in wrangler.toml`);
}
