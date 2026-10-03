import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRoot, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function runWrangler(args) {
    let last = '';
    for (let attempt = 0; attempt < 30; attempt++) {
        const result = spawnSync(process.execPath, [wranglerBin, ...args], {
            cwd: apiRoot,
            env: { ...process.env, CI: '1' },
            encoding: 'utf8',
        });
        last = `${result.stdout || ''}\n${result.stderr || ''}`;
        if (result.status === 0) return result.stdout || '';
        if (/database is locked|SQLITE_BUSY/i.test(last)) {
            sleep(500);
            continue;
        }
        throw new Error(last);
    }
    throw new Error(last);
}

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}

export function adminCookie() {
    const script = path.join(root, 'scripts', 'dev_make_admin.js');
    let last = '';
    let token = '';
    for (let attempt = 0; attempt < 30; attempt++) {
        const result = spawnSync(process.execPath, [script], {
            cwd: root,
            env: { ...process.env, CI: '1' },
            encoding: 'utf8',
        });
        last = `${result.stdout || ''}\n${result.stderr || ''}`;
        if (result.status === 0) {
            token = (result.stdout || '').trim();
            break;
        }
        if (/database is locked|SQLITE_BUSY/i.test(last)) {
            sleep(500);
            continue;
        }
        throw new Error(result.stderr || result.stdout || 'dev_make_admin failed');
    }
    if (!token) throw new Error(last || 'dev_make_admin failed');
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}
