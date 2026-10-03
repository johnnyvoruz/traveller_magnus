// Prompt for X API credentials and store them for local wrangler and the voyage Worker.
// Local: apps/api/.dev.vars (gitignored). Remote: `wrangler secret bulk` on the voyage Worker.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'apps', 'api');
const DEV_VARS = path.join(API_DIR, '.dev.vars');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const MARKER = '# X API (npm run xauth)';

export const X_SECRETS = [
    { name: 'X_CONSUMER_KEY', label: 'Consumer key (API key)' },
    { name: 'X_CONSUMER_SECRET', label: 'Secret key (API key secret)' },
    { name: 'X_BEARER_TOKEN', label: 'Bearer token' },
];

const KEY_LINE = /^(?:#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function quoteDevVar(value) {
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
}

export function unquoteDevVar(raw) {
    const value = raw.trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
    }
    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    return value;
}

export function readDevVar(text, name) {
    for (const line of text.split(/\r?\n/)) {
        const match = KEY_LINE.exec(line.trim());
        if (!match || match[1] !== name || line.trim().startsWith('#')) continue;
        return unquoteDevVar(match[2]);
    }
    return '';
}

// Drop previous X assignments (including commented placeholders) and append the new block.
export function mergeDevVars(text, values) {
    const names = new Set(X_SECRETS.map((item) => item.name));
    const kept = text.split(/\r?\n/).filter((line) => {
        if (line.trim() === MARKER) return false;
        const match = KEY_LINE.exec(line.trim());
        return !(match && names.has(match[1]));
    });
    while (kept.length && kept[kept.length - 1] === '') kept.pop();
    const block = [MARKER, ...X_SECRETS.map((item) => `${item.name}=${quoteDevVar(values[item.name])}`)];
    return [...kept, '', ...block, ''].join('\n');
}

function ask(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function askHidden(label) {
    return new Promise((resolve) => {
        process.stdout.write(label);
        const output = new Writable({
            write(chunk, _encoding, callback) {
                const text = chunk.toString();
                if (text.includes('\n') || text.includes('\r')) process.stdout.write('\n');
                callback();
            },
        });
        const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
        rl.question('', (answer) => {
            rl.close();
            resolve(answer.replace(/\r$/, '').trim());
        });
    });
}

function runWrangler(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [WRANGLER, ...args], {
            cwd: API_DIR,
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`wrangler exited with code ${code}`));
        });
    });
}

async function main() {
    if (!process.stdin.isTTY) {
        console.error('npm run xauth needs an interactive terminal.');
        process.exit(1);
    }
    if (!fs.existsSync(WRANGLER)) {
        console.error('Wrangler is not installed. From the repo root, run npm install.');
        process.exit(1);
    }

    const existing = fs.existsSync(DEV_VARS) ? fs.readFileSync(DEV_VARS, 'utf8') : '';
    const values = {};
    console.log('X API credentials for local wrangler (.dev.vars) and the voyage Worker.');
    console.log('Input is hidden. Nothing is printed back.');
    for (const item of X_SECRETS) {
        const current = readDevVar(existing, item.name);
        const hint = current ? ` [already set, ${current.length} characters; Enter keeps it]` : '';
        let value = '';
        while (!value) {
            value = await askHidden(`${item.label}${hint}: `);
            if (!value && current) value = current;
            if (!value) console.log('A value is required.');
        }
        values[item.name] = value;
    }

    fs.writeFileSync(DEV_VARS, mergeDevVars(existing, values), 'utf8');
    console.log(`Saved ${X_SECRETS.map((item) => item.name).join(', ')} to apps/api/.dev.vars`);
    console.log('Restart `npm run dev:api` if it is already running.');

    const upload = (await ask('Upload these three secrets to the voyage Worker? This deploys a new version. [Y/n] ')).toLowerCase();
    if (upload === 'n' || upload === 'no') {
        console.log('Skipped Cloudflare. Run npm run xauth again when you want them on the Worker.');
        return;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xauth-'));
    const file = path.join(dir, 'secrets.json');
    try {
        fs.writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
        console.log('Checking Cloudflare login…');
        await runWrangler(['whoami']);
        await runWrangler(['secret', 'bulk', file]);
        console.log('Uploaded X_CONSUMER_KEY, X_CONSUMER_SECRET, and X_BEARER_TOKEN to the voyage Worker.');
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        console.error('Local .dev.vars is saved. Log in with `npx wrangler login` from apps/api, then run npm run xauth again.');
        process.exitCode = 1;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) main();
