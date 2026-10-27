/**
 * AS3. The smoke script against a stub origin: one good set, and one miss for each check.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('../..', import.meta.url);
const APP = readFileSync(new URL('../../apps/web/src/version.ts', import.meta.url), 'utf8')
    .match(/export const APP_VERSION = '([^']+)'/)[1];
const MARK = 'Players can join your campaign with an invite link';
const CACHE = { 'cache-control': 'public, max-age=31536000, immutable' };

function bodyFor(version) {
    return 'var p=[{version:`' + version + '`,story:[`' + MARK + '`]}];';
}

function start(mode) {
    const server = http.createServer((req, res) => {
        const path = new URL(req.url, 'http://127.0.0.1').pathname;
        const send = (status, body, headers = {}) => {
            res.writeHead(status, { 'content-type': 'application/json', ...headers });
            res.end(body);
        };
        if (path === '/') return send(mode === 'home' ? 500 : 200, '<script src="/assets/index-GOOD.js"></script>'
            + (mode === 'two-index' ? '<script src="/assets/index-OTHER.js"></script>' : ''), { 'content-type': 'text/html' });
        if (path === '/assets/index-GOOD.js' || path === '/assets/index-OTHER.js') {
            const text = mode === 'chunk-missing' ? 'var x = 1;' : '"/assets/ChangesView-GOOD.js"';
            return send(200, text, mode === 'asset-cache' ? {} : CACHE);
        }
        if (path === '/assets/ChangesView-GOOD.js') {
            return send(200, 'import x from "./ChangelogBody-GOOD.js";', mode === 'asset-cache' ? {} : CACHE);
        }
        if (path === '/assets/ChangelogBody-GOOD.js') {
            return send(200, bodyFor(mode === 'changes-version' ? '0.0.0' : APP), mode === 'asset-cache' ? {} : CACHE);
        }
        if (path === '/api/truth/versions') {
            if (mode === 'versions') return send(500, '{}');
            if (mode === 'versions-empty') return send(200, JSON.stringify({ ok: true, data: [{ version: 'v9', state: 'draft' }] }));
            return send(200, JSON.stringify({ ok: true, data: [{ version: 'v10', state: 'released' }] }));
        }
        if (path === '/truth/v10/overview.json') {
            if (mode === 'overview') return send(500, '{}');
            if (mode === 'overview-bad') return send(200, 'nope');
            return send(200, JSON.stringify({ sectors: 1 }));
        }
        if (path === '/truth/v10/sectors/Spinward_Marches/index.json') {
            if (mode === 'sector-index') return send(404, '{}');
            if (mode === 'sector-bad') return send(200, 'nope');
            return send(200, JSON.stringify({ cells: '.' }));
        }
        if (path === '/s/Spinward_Marches/1910') return send(mode === 'system-page' ? 500 : 200, 'page', { 'content-type': 'text/html' });
        if (path === '/packages') return send(mode === 'packages' ? 404 : 200, 'page', { 'content-type': 'text/html' });
        if (path === '/join/nosuchtoken') return send(mode === 'join' ? 500 : 200, 'page', { 'content-type': 'text/html' });
        if (path === '/api/universes/nosuch/campaign') {
            if (mode === 'campaign') return send(500, JSON.stringify({ ok: false, error: { code: 'boom' } }));
            if (mode === 'campaign-code') return send(200, JSON.stringify({ ok: true, data: {} }));
            return send(401, JSON.stringify({ ok: false, error: { code: 'unauthenticated', message: 'Sign in to continue.' } }));
        }
        send(404, 'missing');
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function runScript(origin) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/smoke.mjs', origin], {
            cwd: fileURLToPath(root),
            env: { ...process.env, SMOKE_CDN: origin },
        });
        let out = '';
        child.stdout.on('data', (chunk) => { out += chunk; });
        child.stderr.on('data', (chunk) => { out += chunk; });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, out }));
    });
}

test('a good origin passes every check', async () => {
    const server = await start('good');
    try {
        const origin = 'http://127.0.0.1:' + server.address().port;
        const result = await runScript(origin);
        assert.equal(result.code, 0, result.out);
        assert.match(result.out, /ok home 200 index-GOOD\.js/);
        assert.match(result.out, /ok versions 200 released v10/);
        assert.match(result.out, /ok overview 200/);
        assert.match(result.out, /ok sector-index 200/);
        assert.match(result.out, /ok system-page 200/);
        assert.match(result.out, /ok packages 200/);
        assert.match(result.out, /ok join 200/);
        assert.match(result.out, /ok campaign 401 unauthenticated/);
        assert.match(result.out, /ok asset-cache public, max-age=31536000, immutable/);
        assert.match(result.out, new RegExp('ok changes-version ' + APP.replaceAll('.', '\\.') + ' expected ' + APP.replaceAll('.', '\\.')));
        assert.equal(result.out.includes('miss'), false, result.out);
    } finally {
        server.close();
    }
});

const misses = [
    ['home', /miss home 500/],
    ['two-index', /miss home 200 2 index scripts/],
    ['versions', /miss versions 500/],
    ['versions-empty', /miss versions 200 no released version/],
    ['overview', /miss overview 500/],
    ['overview-bad', /miss overview 200 not json/],
    ['sector-index', /miss sector-index 404/],
    ['sector-bad', /miss sector-index 200 not json/],
    ['system-page', /miss system-page 500/],
    ['packages', /miss packages 404/],
    ['join', /miss join 500/],
    ['campaign', /miss campaign 500/],
    ['campaign-code', /miss campaign 200/],
    ['asset-cache', /miss asset-cache/],
    ['changes-version', /miss changes-version 0\.0\.0 expected/],
    ['chunk-missing', /miss changes-version chunk missing/],
];

for (const [mode, pattern] of misses) {
    test(mode + ' is a miss', async () => {
        const server = await start(mode);
        try {
            const origin = 'http://127.0.0.1:' + server.address().port;
            const result = await runScript(origin);
            assert.equal(result.code, 1, result.out);
            assert.match(result.out, pattern, result.out);
        } finally {
            server.close();
        }
    });
}
