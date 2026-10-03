import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { generateHex } from '@voyage/generation';
import { sha256Hex, stable } from '@voyage/shared';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { adminCookie } from './session.js';
import { withDevServer, wranglerBin } from './server.js';

const require = createRequire(import.meta.url);
const engineVersion = require('../../packages/engines/package.json').version;

const CASES = [
    { name: 'mgt2e_topdown_bare', edition: 'MgT2E', mode: 'top-down', hexKey: '1-A-0101' },
    { name: 'ct_bottomup', edition: 'CT', mode: 'bottom-up', hexKey: '1-A-0104' },
    { name: 't5_topdown', edition: 'T5', mode: 'top-down', hexKey: '1-A-0105' },
    { name: 'rtt_bottomup', edition: 'RTT', mode: 'bottom-up', hexKey: '1-A-0106' },
    { name: 'aow_bottomup', edition: 'AoW', mode: 'bottom-up', hexKey: '1-A-0107' },
];

function bodyFor(row) {
    return {
        edition: row.edition,
        mode: row.mode,
        seed: TRUTH_SEED,
        settings: { ...TRUTH_SETTINGS },
        hexKey: row.hexKey,
        inputs: { type: 'SYSTEM_PRESENT' },
    };
}

function nodeEnvelope(body) {
    return generateHex({
        hexKey: body.hexKey,
        edition: body.edition,
        mode: body.mode,
        summary: body.inputs,
        pinned: { seed: body.seed, settings: body.settings, engineVersion },
    });
}

function firstDiff(left, right, path) {
    if (Object.is(left, right)) return null;
    const leftObject = left && typeof left === 'object';
    const rightObject = right && typeof right === 'object';
    if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) return path;
    if (Array.isArray(left)) {
        const count = Math.max(left.length, right.length);
        for (let i = 0; i < count; i++) {
            const found = firstDiff(left[i], right[i], `${path}[${i}]`);
            if (found) return found;
        }
        return null;
    }
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
        const found = firstDiff(left[key], right[key], path ? `${path}.${key}` : key);
        if (found) return found;
    }
    return null;
}

if (process.env.RUN_API_TESTS !== '1') {
    test('preview parity', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('preview parity', { skip: 'wrangler is absent' }, () => {});
} else {
    test('preview parity', { timeout: 300000 }, async () => {
        const expected = new Map();
        for (const row of CASES) {
            const envelope = nodeEnvelope(bodyFor(row));
            expected.set(row.name, { envelope, hash: await sha256Hex(stable(envelope)) });
        }
        await withDevServer(async (base) => {
            const cookie = adminCookie();
            for (const row of CASES) {
                const response = await fetch(`${base}/api/generate/preview`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', cookie },
                    body: JSON.stringify(bodyFor(row)),
                });
                const payload = await response.json();
                assert.equal(response.status, 200, `${row.name} ${response.status} ${JSON.stringify(payload)}`);
                assert.equal(payload.ok, true, row.name);
                const node = expected.get(row.name);
                if (payload.data.hash !== node.hash) {
                    const diff = firstDiff(node.envelope, payload.data.envelope, '');
                    assert.fail(`${row.name} node=${node.hash} worker=${payload.data.hash} path=${diff}`);
                }
            }
        });
    });
}
