import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { parseT5Tab, stable } from '@voyage/shared';
import { generateMgT2ESystemTopDown, storeBuild } from '@voyage/engines';
import { generateHex } from '@voyage/generation';
import { environmentPolicy, RECONCILE_FIELDS, reconcileTree } from '../../packages/engines/src/reconcile_environment.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { TSV } from '../golden/cases.js';
import { withEngineRng } from '../golden/rng_lock.js';

const require = createRequire(import.meta.url);
const engineVersion = require('../../packages/engines/package.json').version;
const pinned = { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
}

function offAllowlist(before, after, path, bad) {
    if (stable(before) === stable(after)) return;
    const beforeObject = before && typeof before === 'object';
    const afterObject = after && typeof after === 'object';
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
        bad.push(path || '$');
        return;
    }
    if (Array.isArray(before)) {
        const count = Math.max(before.length, after.length);
        for (let index = 0; index < count; index += 1) {
            offAllowlist(before[index], after[index], `${path}[${index}]`, bad);
        }
        return;
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
        if (RECONCILE_FIELDS.includes(key)) continue;
        const here = path ? `${path}.${key}` : key;
        offAllowlist(before[key], after[key], here, bad);
    }
}

async function hookCase(input) {
    await withEngineRng(async () => {
        const plain = generateHex(input);
        const before = stable(plain);
        const frozen = structuredClone(plain);
        deepFreeze(frozen);
        const random = Math.random;
        const now = Date.now;
        Math.random = () => { throw new Error('rng'); };
        Date.now = () => { throw new Error('clock'); };
        let reconciled;
        try {
            reconciled = reconcileTree(frozen, environmentPolicy);
        } finally {
            Math.random = random;
            Date.now = now;
        }
        assert.equal(stable(frozen), before);
        const hooked = generateHex({ ...input, policy: environmentPolicy });
        assert.equal(stable(hooked), stable(reconciled.tree));
        assert.equal(Object.keys(hooked).includes('changes'), false);
        assert.ok(Array.isArray(hooked.changes));
        assert.ok(Array.isArray(hooked.diagnostics));
        const bad = [];
        offAllowlist(plain, hooked, '', bad);
        assert.deepEqual(bad, []);
    });
}

test('MgT2E generateHex reconciles only when a policy is passed', async () => {
    const regina = parseT5Tab(TSV).get('1910');
    await hookCase({
        hexKey: 'Spinward_Marches/1910',
        edition: 'MgT2E',
        mode: 'flesh',
        summary: regina,
        pinned,
    });
    await hookCase({
        hexKey: '1-A-0101',
        edition: 'MgT2E',
        mode: 'top-down',
        summary: { type: 'SYSTEM_PRESENT' },
        pinned,
    });
    await hookCase({
        hexKey: '1-A-0102',
        edition: 'MgT2E',
        mode: 'bottom-up',
        summary: { type: 'SYSTEM_PRESENT' },
        pinned,
    });
    let society;
    await withEngineRng(async () => {
        const sys = generateMgT2ESystemTopDown('1-A-0103', null);
        society = { type: 'SYSTEM_PRESENT' };
        storeBuild(society, sys);
        delete society.mgtSocio;
    });
    await hookCase({
        hexKey: '1-A-0103',
        edition: 'MgT2E',
        mode: 'flesh',
        summary: society,
        pinned,
    });
});
