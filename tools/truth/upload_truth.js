/**
 * Upload a locally built truth version (truth-local/, written by tools/truth/build.js) so the
 * existing admin release route can release it. Admin only; run on Lazarus.
 *
 *   node tools/truth/upload_truth.js v10                          # dry run (default): plan + D1 import files, no network
 *   node tools/truth/upload_truth.js v10 --local                  # wrangler local emulation (apps/api/.wrangler/state)
 *   node tools/truth/upload_truth.js v10 --endpoint <url> --yes   # S3 bulk PUT to a test endpoint (no D1)
 *   node tools/truth/upload_truth.js v10 --remote --yes           # production: R2 over S3 in parallel, then D1
 *   options: --concurrency <1-128> (default 64)
 *
 * The seal, run after POST /api/admin/truth/release/<v> (the same targets, the same keys and --yes):
 *   node tools/truth/upload_truth.js v10 --seal                   # dry run: the count, no network
 *   node tools/truth/upload_truth.js v10 --seal --remote --yes    # production: R2 over S3
 * It reads truth/<v>/manifest.json (written by the release) and re-puts each sector index, and, when
 * truth/<v>/reconciliation.json exists, each reconciliation report, with the same bytes and
 * 'public, max-age=31536000, immutable'. An object that already has that Cache-Control is left
 * alone, so a re-run sends only what is missing. A version whose truth_versions.state is not
 * 'released' is refused before any read of the bucket.
 *
 * --remote needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (an R2 API token with
 * Object Read & Write on both buckets) and a wrangler login for D1. Bucket names come from
 * apps/api/wrangler.toml (PUBLIC_BUCKET, PRIVATE_BUCKET).
 * --endpoint needs its own keys, S3_ENDPOINT_ACCESS_KEY_ID and S3_ENDPOINT_SECRET_ACCESS_KEY. It
 * never reads the R2_* production keys and has no default keys.
 * Every write that is not the local emulation needs --yes.
 *
 * Before any R2 put or D1 write, on every path, the version's truth_versions.state is read
 * (--remote: production D1; --local and --endpoint: the local emulation's D1). A version that
 * exists and is not 'building' is refused, and so is a state that cannot be read. The D1 import
 * files carry the same guard on every statement, so a released version is never rewritten.
 *
 * Writes what the Worker truth build would have written:
 *   public  objects/<hash>                          (immutable)
 *   public  truth/<v>/sectors/<slug>/index.json     (max-age=60 until the version is released;
 *                                                    then --seal re-puts it immutable)
 *   private inputs/<v>/sectors.json, <slug>.tsv, <slug>.xml (inputs the release reads)
 *   D1 voyage  truth_versions (state building), truth_build_sectors (done), truth_systems
 * Then release with POST /api/admin/truth/release/<v>, which writes overview, polities and manifest.
 * A ledger (truth-local/.uploaded.<v>.<target>.txt, one line per finished file or D1 part)
 * makes a re-run send only what is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { bucketFromWrangler, bulkPut, getObject, openLedger, putObject } from './r2_s3.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=60';
const USAGE = 'usage: node tools/truth/upload_truth.js v<N> [--seal] [--local | --endpoint <url> --yes | --remote --yes] [--concurrency N]';

const q = value => (value === undefined || value === null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
/** SQL that is true only while the version row is 'building'. */
export const buildingGuard = version => `(SELECT state FROM truth_versions WHERE version = ${q(version)}) = 'building'`;

/** Argument checks. Returns { error, code } or the parsed options. Nothing is read or written. */
export function parseArgs(argv, env = {}) {
    const version = argv[0];
    if (!version || !/^v\d+$/.test(version)) return { error: USAGE, code: 2 };
    const remote = argv.includes('--remote');
    const local = argv.includes('--local');
    const yes = argv.includes('--yes');
    const argValue = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
    const hasEndpoint = argv.includes('--endpoint');
    const testEndpoint = argValue('--endpoint');
    if (hasEndpoint && (!testEndpoint || testEndpoint.startsWith('--'))) return { error: '--endpoint needs a URL.', code: 2 };
    if ([remote, local, hasEndpoint].filter(Boolean).length > 1) return { error: 'choose one of --local, --endpoint <url> and --remote.', code: 2 };
    if (remote && !yes) return { error: '--remote writes production. Add --yes to confirm.', code: 2 };
    if (hasEndpoint && !yes) return { error: `--endpoint writes ${testEndpoint}. Add --yes to confirm.`, code: 2 };
    let credentials = null;
    if (hasEndpoint) {
        const need = ['S3_ENDPOINT_ACCESS_KEY_ID', 'S3_ENDPOINT_SECRET_ACCESS_KEY'].filter(name => !env[name]);
        if (need.length) return { error: `missing ${need.join(', ')}: --endpoint has no default keys and never uses the R2_* production keys.`, code: 2 };
        credentials = { accessKeyId: env.S3_ENDPOINT_ACCESS_KEY_ID, secretAccessKey: env.S3_ENDPOINT_SECRET_ACCESS_KEY };
    }
    if (remote) {
        const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(name => !env[name]);
        if (need.length) return { error: `missing ${need.join(', ')}: an R2 API token with Object Read & Write on both buckets`, code: 2 };
        credentials = { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY };
    }
    const concurrency = Math.min(128, Math.max(1, Number(argValue('--concurrency') || 64)));
    const target = remote ? 'remote' : local ? 'local' : hasEndpoint ? 'endpoint' : 'dry-run';
    const endpoint = remote ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : hasEndpoint ? testEndpoint : null;
    return { version, target, concurrency, endpoint, credentials, seal: argv.includes('--seal') };
}

/** The seal runs only on a released version. */
export function sealRefusal(version, state) {
    if (state === 'released') return null;
    return `${version} is ${state === null ? 'not in truth_versions' : state}, not released: only a released version is sealed.`;
}

/** The keys the seal re-puts: every sector index, then the reconciliation reports if reconciled. */
export function sealKeys(version, slugs, reconciled) {
    const keys = slugs.map(slug => ({ key: `truth/${version}/sectors/${slug}/index.json`, report: false }));
    if (reconciled) {
        for (const slug of slugs) keys.push({ key: `truth/${version}/reconciliation/sectors/${slug}.json`, report: true });
        keys.push({ key: `truth/${version}/reconciliation/report.json`, report: true });
    }
    return keys;
}

const unquote = etag => (etag ? String(etag).replace(/^W\//, '').replace(/"/g, '') : null);

/** The object store the seal reads and writes: wrangler's local emulation, or S3. */
function sealStore(target, { run, endpoint, credentials, s3 }) {
    if (target === 'local') {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-seal-'));
        let n = 0;
        return {
            async get(bucket, key) {
                const file = path.join(dir, `${n += 1}.json`);
                try {
                    run(['r2', 'object', 'get', `${bucket}/${key}`, '--local', '--file', file]);
                } catch (err) {
                    if (/does not exist|not found|404/i.test(wranglerError(err))) return { status: 404 };
                    throw new Error(wranglerError(err));
                }
                if (!fs.existsSync(file)) return { status: 404 };
                return { status: 200, bytes: fs.readFileSync(file), contentType: 'application/json', cacheControl: null, file };
            },
            async put(bucket, key, got) {
                run(['r2', 'object', 'put', `${bucket}/${key}`, '--local', '--file', got.file, '--content-type', got.contentType || 'application/json', '--cache-control', IMMUTABLE]);
            },
            close() { fs.rmSync(dir, { recursive: true, force: true }); },
        };
    }
    return {
        get: (bucket, key) => s3.getObject({ endpoint, credentials, bucket, key }),
        put: (bucket, key, got) => s3.putObject({ endpoint, credentials, bucket, key, bytes: got.bytes, contentType: got.contentType || 'application/json', cacheControl: IMMUTABLE }),
        close() {},
    };
}

/** --seal: refuse unless released, then re-put each index and report immutable, same bytes. */
async function seal(opts, { root, log, error, run, readState, s3 }) {
    const { version, target, concurrency, endpoint, credentials } = opts;
    const toml = fs.readFileSync(path.join(root, 'apps', 'api', 'wrangler.toml'), 'utf8');
    const PUBLIC = bucketFromWrangler(toml, 'PUBLIC_BUCKET');
    if (target === 'dry-run') {
        const local = path.join(root, 'truth-local', version, 'manifest.json');
        const slugs = fs.existsSync(local) ? JSON.parse(fs.readFileSync(local, 'utf8')).sectors.map(s => s.slug) : null;
        log(JSON.stringify({
            version, seal: true, target, bucket: PUBLIC, cacheControl: IMMUTABLE,
            indexes: slugs ? slugs.length : null,
            reports: slugs ? `${slugs.length + 1} more if truth/${version}/reconciliation.json exists` : null,
            from: slugs ? path.relative(root, local) : `no local manifest: the count is read from truth/${version}/manifest.json when the seal runs`,
            then: 'add --remote --yes (production), --endpoint <url> --yes or --local; only a released version is sealed',
        }, null, 2));
        return 0;
    }
    const stateFrom = target === 'remote' ? 'remote' : 'local';
    let state;
    try {
        state = await readState(version, stateFrom);
    } catch (err) {
        error(`cannot read truth_versions.state for ${version} (${stateFrom} D1): ${err && err.stderr ? wranglerError(err) : err && err.message ? err.message : String(err)}. Nothing was sealed.`);
        return 3;
    }
    const refusal = sealRefusal(version, state);
    if (refusal) { error(`${refusal} Nothing was sealed.`); return 3; }

    const store = sealStore(target, { run, endpoint, credentials, s3 });
    const started = Date.now();
    try {
        const manifest = await store.get(PUBLIC, `truth/${version}/manifest.json`);
        if (manifest.status !== 200) { error(`no truth/${version}/manifest.json in ${PUBLIC}: release ${version} first. Nothing was sealed.`); return 1; }
        const slugs = JSON.parse(manifest.bytes.toString('utf8')).sectors.map(s => s.slug);
        const provenance = await store.get(PUBLIC, `truth/${version}/reconciliation.json`);
        const keys = sealKeys(version, slugs, provenance.status === 200);
        const result = { sealed: 0, alreadySealed: 0, absent: [], failed: [] };
        let next = 0;
        const worker = async () => {
            while (next < keys.length) {
                const item = keys[next];
                next += 1;
                try {
                    const got = await store.get(PUBLIC, item.key);
                    if (got.status !== 200) {
                        if (item.report) result.absent.push(item.key);
                        else result.failed.push({ key: item.key, error: 'absent' });
                        continue;
                    }
                    if (got.cacheControl === IMMUTABLE) { result.alreadySealed += 1; continue; }
                    const put = await store.put(PUBLIC, item.key, got);
                    // Same bytes: S3 answers with the new object's ETag (an MD5 for a single PUT).
                    if (unquote(got.etag) && put && unquote(put.etag) && unquote(got.etag) !== unquote(put.etag)) throw new Error(`ETag changed (${got.etag} to ${put.etag})`);
                    result.sealed += 1;
                } catch (err) {
                    result.failed.push({ key: item.key, error: String(err.message || err).slice(0, 300) });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.max(1, Math.min(target === 'local' ? 1 : concurrency, keys.length)) }, worker));
        log(JSON.stringify({
            version, seal: true, target, bucket: PUBLIC, cacheControl: IMMUTABLE,
            indexes: slugs.length, reports: keys.length - slugs.length, reconciled: provenance.status === 200,
            sealed: result.sealed, alreadySealed: result.alreadySealed,
            absent: result.absent.slice(0, 20), absentCount: result.absent.length,
            failed: result.failed.slice(0, 20), failedCount: result.failed.length, ms: Date.now() - started,
        }, null, 2));
        return result.failed.length ? 1 : 0;
    } catch (err) {
        error(`seal stopped: ${String(err.message || err)}`);
        return 1;
    } finally {
        store.close();
    }
}

/** Decide from a truth_versions.state read. null = no row yet (a new version). */
export function stateRefusal(version, state) {
    if (state === null) return null;
    if (state === 'building') return null;
    return `${version} is ${state}, not building: an uploaded version is never overwritten.`;
}

/** The D1 import text: part 0 (version, clearing DELETE, sector rows) and the system parts. */
export function buildSql(version, manifest, systems, now) {
    const guard = buildingGuard(version);
    const sql = [
        `INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, notes, manifest_hash, sectors_total, sectors_done, sectors_failed)
VALUES (${q(version)}, ${q(manifest.engineVersion)}, ${q(manifest.milieu)}, ${q(manifest.seed)}, ${q(JSON.stringify(manifest.settings))}, ${q(JSON.stringify(manifest.sectors.map(s => s.slug)))}, 'building', ${q(now)}, NULL, 'built locally (tools/truth/build.js)', NULL, ${manifest.sectors.length}, ${manifest.sectors.length}, '[]')
ON CONFLICT(version) DO UPDATE SET engine_version = excluded.engine_version, sectors = excluded.sectors, sectors_total = excluded.sectors_total, sectors_done = excluded.sectors_done
WHERE truth_versions.state = 'building';`,
        `DELETE FROM truth_systems WHERE version = ${q(version)} AND ${guard};`,
    ];
    for (const s of manifest.sectors) {
        sql.push(`INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at, canonical)
SELECT ${q(version)}, ${q(s.slug)}, 'done', ${s.systems}, ${s.built}, ${s.partial}, ${q(s.indexHash)}, NULL, ${q(now)}, ${s.canonical ? 1 : 0} WHERE ${guard}
ON CONFLICT(version, sector_slug) DO UPDATE SET state = 'done', systems = excluded.systems, built = excluded.built, partial = excluded.partial, index_hash = excluded.index_hash, updated_at = excluded.updated_at, canonical = excluded.canonical;`);
    }
    // D1 in parts of 5,000 systems, each one wrangler d1 execute --file. Part 0 holds the version,
    // the clearing DELETE and the sector rows; the ledger records each finished part.
    const D1_ROWS = 5000;
    const parts = [sql.join('\n') + '\n'];
    for (let i = 0; i < systems.length; i += D1_ROWS) {
        const part = [];
        for (let j = i; j < Math.min(i + D1_ROWS, systems.length); j += 200) {
            const rows = systems.slice(j, Math.min(j + 200, i + D1_ROWS, systems.length)).map(r => `(${q(version)}, ${r.map(q).join(', ')})`);
            part.push(`INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, allegiance, zone, tree_hash, partial)
SELECT * FROM (VALUES\n${rows.join(',\n')}) WHERE ${guard};`);
        }
        parts.push(part.join('\n') + '\n');
    }
    return parts;
}

// With a shell (Windows), a value holding a space must be quoted or it splits into two arguments.
const quote = arg => (process.platform === 'win32' && /\s/.test(arg) ? `"${arg}"` : arg);
function wrangler(api) {
    return args => execFileSync('wrangler', args.map(quote), { cwd: api, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
}
const wranglerError = err => String(err.stderr || err.message).trim().split('\n').slice(-2).join(' | ');

/** Read truth_versions.state through wrangler. Throws when it cannot be read. */
export function readStateWith(run, version, where) {
    const out = run(['d1', 'execute', 'voyage', where === 'remote' ? '--remote' : '--local', '--json', '--command', `SELECT state FROM truth_versions WHERE version = ${q(version)}`]);
    const parsed = JSON.parse(String(out));
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap(r => (r && Array.isArray(r.results) ? r.results : []));
    if (!Array.isArray(parsed) && !(parsed && Array.isArray(parsed.results))) throw new Error('unexpected wrangler output');
    return rows.length ? String(rows[0].state) : null;
}

/**
 * Run the upload (or, with --seal, the seal). deps: { root, env, log, error, run, readState, put, s3 }.
 * Returns the exit code. Every R2 put and D1 write happens after the state check.
 */
export async function main(argv, deps = {}) {
    const root = deps.root || ROOT;
    const env = deps.env || process.env;
    const log = deps.log || (s => console.log(s));
    const error = deps.error || (s => console.error(s));
    const api = path.join(root, 'apps', 'api');
    const run = deps.run || wrangler(api);
    const readState = deps.readState || ((version, where) => readStateWith(run, version, where));
    const put = deps.put || bulkPut;

    const opts = parseArgs(argv, env);
    if (opts.error) { error(opts.error); return opts.code; }
    if (opts.seal) return seal(opts, { root, log, error, run, readState, s3: deps.s3 || { getObject, putObject } });
    const { version, target, concurrency, endpoint, credentials } = opts;
    const OUT = path.join(root, 'truth-local');
    const toml = fs.readFileSync(path.join(api, 'wrangler.toml'), 'utf8');
    const PUBLIC = bucketFromWrangler(toml, 'PUBLIC_BUCKET');
    const PRIVATE = bucketFromWrangler(toml, 'PRIVATE_BUCKET');

    const manifestPath = path.join(OUT, version, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        error(`no ${path.relative(root, manifestPath)}: run node tools/truth/build.js ${version} first`);
        return 1;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const puts = [];
    const hashes = new Set();
    const systems = [];
    for (const sector of manifest.sectors) {
        const indexFile = path.join(OUT, version, 'sectors', sector.slug, 'index.json');
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        puts.push({ bucket: PUBLIC, key: `truth/${version}/sectors/${sector.slug}/index.json`, file: indexFile, cache: SHORT });
        for (const [hex, row] of Object.entries(index.hexes)) {
            systems.push([sector.slug, hex, row.name, row.uwp, row.allegiance, row.zone, row.tree, row.partial]);
            if (typeof row.tree === 'string' && !hashes.has(row.tree)) {
                hashes.add(row.tree);
                puts.push({ bucket: PUBLIC, key: `objects/${row.tree}`, file: path.join(OUT, 'objects', row.tree), cache: IMMUTABLE });
            }
        }
    }
    const catalogue = path.join(root, 'universe', 'raw', 'sectors.json');
    puts.push({ bucket: PRIVATE, key: `inputs/${version}/sectors.json`, file: catalogue, cache: null });
    // The release reads the catalogue, and only trusts it beside at least one sector input file.
    for (const sector of manifest.sectors) {
        for (const ext of ['tsv', 'xml']) {
            puts.push({ bucket: PRIVATE, key: `inputs/${version}/${sector.slug}.${ext}`, file: path.join(root, 'universe', 'raw', `${sector.slug}.${ext}`), cache: null, type: ext === 'xml' ? 'application/xml' : 'text/tab-separated-values' });
        }
    }
    const missing = puts.filter(item => !fs.existsSync(item.file)).map(item => item.key);
    if (missing.length) {
        error(JSON.stringify({ missing: missing.slice(0, 10), count: missing.length }));
        return 1;
    }

    const d1Dir = path.join(OUT, version, 'd1');
    fs.rmSync(d1Dir, { recursive: true, force: true });
    fs.mkdirSync(d1Dir, { recursive: true });
    const d1Files = buildSql(version, manifest, systems, new Date().toISOString()).map((text, i) => {
        const file = path.join(d1Dir, `part_${String(i).padStart(3, '0')}.sql`);
        fs.writeFileSync(file, text);
        return file;
    });

    const bytes = puts.reduce((sum, item) => sum + fs.statSync(item.file).size, 0);
    const plan = { version, target, concurrency, buckets: [PUBLIC, PRIVATE], sectors: manifest.sectors.length, objects: hashes.size, puts: puts.length, bytes, systems: systems.length, d1Parts: d1Files.length, d1Dir: path.relative(root, d1Dir) };
    if (target === 'dry-run') {
        log(JSON.stringify(plan, null, 2));
        return 0;
    }

    // The state check: before any R2 put or D1 write, on every path.
    const stateFrom = target === 'remote' ? 'remote' : 'local';
    let state;
    try {
        state = await readState(version, stateFrom);
    } catch (err) {
        error(`cannot read truth_versions.state for ${version} (${stateFrom} D1): ${err && err.stderr ? wranglerError(err) : err && err.message ? err.message : String(err)}. Nothing was written.`);
        return 3;
    }
    const refusal = stateRefusal(version, state);
    if (refusal) { error(`${refusal} Nothing was written.`); return 3; }

    const ledger = openLedger(path.join(OUT, `.uploaded.${version}.${target}.txt`));
    const started = Date.now();
    let result;
    if (target === 'local') {
        result = { sent: 0, skipped: 0, bytes: 0, failed: [] };
        for (const item of puts) {
            const id = `${item.bucket}/${item.key}`;
            if (ledger.done.has(id)) { result.skipped += 1; continue; }
            const args = ['r2', 'object', 'put', id, '--local', '--file', item.file, '--content-type', item.type || 'application/json'];
            if (item.cache) args.push('--cache-control', item.cache);
            try {
                run(args);
                ledger.add(id);
                result.sent += 1;
            } catch (err) {
                result.failed.push({ key: id, error: wranglerError(err) });
            }
        }
    } else {
        let shown = 0;
        result = await put(puts, {
            endpoint, credentials, concurrency, done: ledger.done,
            onDone: item => ledger.add(`${item.bucket}/${item.key}`),
            onProgress: ({ sent, bytes: sentBytes, total }) => {
                if (sent - shown >= 1000 || sent === total) {
                    shown = sent;
                    const s = (Date.now() - started) / 1000;
                    error(`${sent}/${total} files, ${(sentBytes / 1e6).toFixed(0)} MB, ${s.toFixed(0)} s, ${(sentBytes / 1e6 / s).toFixed(1)} MB/s`);
                }
            },
        });
    }
    const failed = result.failed;
    const uploadMs = Date.now() - started;
    if (!failed.length && target !== 'endpoint') {
        for (const file of d1Files) {
            const id = `d1/${path.basename(file)}`;
            if (ledger.done.has(id)) continue;
            try {
                run(['d1', 'execute', 'voyage', target === 'remote' ? '--remote' : '--local', '--file', file, '--yes']);
                ledger.add(id);
            } catch (err) {
                failed.push({ key: id, error: wranglerError(err) });
                break;
            }
        }
    }
    ledger.close();
    log(JSON.stringify({ ...plan, sent: result.sent, skipped: result.skipped, sentBytes: result.bytes, failed: failed.slice(0, 20), failedCount: failed.length, uploadMs, ms: Date.now() - started }, null, 2));
    return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    process.exitCode = await main(process.argv.slice(2));
}