/**
 * Upload truth-build inputs (universe/raw/<Slug>.tsv and .xml) to the private bucket
 * under inputs/<version>/<Slug>.<ext>, where the platform truth-build job reads them.
 *
 *   node tools/truth/upload_inputs.js v1            # upload everything not yet in the ledger
 *   node tools/truth/upload_inputs.js v1 --only Spinward_Marches
 *
 * Uses the logged-in wrangler (remote bucket). Keeps a ledger at universe/raw/.uploaded.<version>.json
 * so a re-run sends only new files. Inputs are immutable per version: a changed file is a new version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'universe', 'raw');
const BUCKET = 'voyage-private';

const version = process.argv[2];
if (!version || !/^v\d+$/.test(version)) {
    console.error('usage: node tools/truth/upload_inputs.js v<N> [--only <Slug>]');
    process.exit(2);
}
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : '';

const ledgerPath = path.join(RAW, `.uploaded.${version}.json`);
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};

const files = fs.readdirSync(RAW)
    .filter(name => /\.(tsv|xml)$/.test(name) || name === 'sectors.json')
    .filter(name => !only || name.startsWith(only + '.'))
    .sort();

let sent = 0, skipped = 0, failed = [];
for (const name of files) {
    const key = `inputs/${version}/${name}`;
    if (ledger[key]) { skipped++; continue; }
    const file = path.join(RAW, name);
    const contentType = name.endsWith('.xml') ? 'application/xml' : name.endsWith('.json') ? 'application/json' : 'text/tab-separated-values';
    try {
        execFileSync('wrangler', ['r2', 'object', 'put', `${BUCKET}/${key}`, '--remote', '--file', file, '--content-type', contentType],
            { stdio: 'pipe', shell: process.platform === 'win32' });
        ledger[key] = { bytes: fs.statSync(file).size, at: new Date().toISOString() };
        fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
        sent++;
        process.stdout.write(`${key}\n`);
    } catch (err) {
        failed.push({ key, error: String(err.stderr || err.message).trim().split('\n').slice(-3).join(' | ') });
    }
}
console.log(JSON.stringify({ version, sent, skipped, failed }, null, 2));
if (failed.length) process.exit(1);
