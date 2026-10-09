import test from 'node:test';
import assert from 'node:assert/strict';
import { setNamePool, stripHexViewState } from '@voyage/engines';
import { SYSTEM_NAMES } from '../../packages/engines/src/generated/names_data.js';
import { parseT5Tab, stable } from '@voyage/shared';
import { generateHex } from '@voyage/generation';
import { TRUTH_SETTINGS, TRUTH_SEED } from '../../tools/truth/settings.js';
import { TSV } from '../golden/cases.js';
import { loadLegacy } from '../oracle/legacy.js';
import { withEngineRng } from '../golden/rng_lock.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const engineVersion = require('../../packages/engines/package.json').version;
// Engine 1.1.0 corrects MgT2E rules the legacy oracle still breaks (findings/engine_1_1_0_rule_fixes.md).
// Every resulting difference is listed exactly, path by path, with both values. No masks.
const DEVIATIONS = JSON.parse(fs.readFileSync(new URL('./parity_deviations_1.1.0.json', import.meta.url), 'utf8'));

function allDiffs(a, b, path, out = []) {
    if (Object.is(a, b)) return out;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) allDiffs(a[key], b[key], `${path}.${key}`, out);
        return out;
    }
    out.push({ path, legacy: a, got: b });
    return out;
}

function namePool() {
    const pool = [];
    for (const name of SYSTEM_NAMES) {
        const cleaned = name ? name.trim() : '';
        if (cleaned) pool.push(cleaned);
    }
    pool.sort();
    return pool;
}

// The oracle's value is a legacy session roll, the new value is the per-hex
// placement decided 2026-10-03, and every other field is compared byte for byte.
// Primary stays unmasked at 0.
function maskCompanionOrbitID(root) {
    const copy = structuredClone(root);
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (Array.isArray(node.stars)) {
            for (const star of node.stars) {
                if (star && star.role && star.role !== 'Primary') star.orbitID = null;
            }
        }
        for (const value of Object.values(node)) walk(value);
    };
    walk(copy);
    return copy;
}

function firstDiff(a, b, path) {
    if (Object.is(a, b)) return null;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return { path, legacy: a, got: b };
        for (let i = 0; i < a.length; i++) {
            const d = firstDiff(a[i], b[i], `${path}[${i}]`);
            if (d) return d;
        }
        return null;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(a, key) || !Object.prototype.hasOwnProperty.call(b, key)) {
                return { path: `${path}.${key}`, legacy: a[key], got: b[key] };
            }
            const d = firstDiff(a[key], b[key], `${path}.${key}`);
            if (d) return d;
        }
        return null;
    }
    return { path, legacy: a, got: b };
}

test('MgT2E flesh Spinward_Marches/1910 matches the oracle', async () => {
    await withEngineRng(async () => {
        const ctx = loadLegacy({ seed: TRUTH_SEED, settings: TRUTH_SETTINGS });
        const rows = ctx.parseT5Tab(TSV, '1');
        const regina = rows.get('1-C-1910');
        ctx.hexStates.set('Spinward_Marches/1910', regina);
        if (!ctx._buildOneMgtHex('Spinward_Marches/1910')) {
            throw new Error('_buildOneMgtHex returned false for Spinward_Marches/1910');
        }
        const oracleBody = ctx.stripHexViewState(ctx.hexStates.get('Spinward_Marches/1910'));
        setNamePool(namePool());
        const summary = parseT5Tab(TSV).get('1910');
        const envelope = generateHex({
            hexKey: 'Spinward_Marches/1910',
            edition: 'MgT2E',
            mode: 'flesh',
            summary,
            pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        });
        const got = stripHexViewState(envelope.body);
        const oracleJson = stable(maskCompanionOrbitID(oracleBody));
        const gotJson = stable(maskCompanionOrbitID(got));
        assert.equal(DEVIATIONS.engineVersion, engineVersion, 'the deviation ledger is for another engine version');
        const diffs = JSON.parse(JSON.stringify(allDiffs(JSON.parse(oracleJson), JSON.parse(gotJson), '$')));
        const listed = new Set(DEVIATIONS.diffs.map((d) => stable(d)));
        const unlisted = diffs.find((d) => !listed.has(stable(d)));
        if (unlisted) {
            const diff = firstDiff(JSON.parse(oracleJson), JSON.parse(gotJson), '$');
            assert.fail(`unlisted deviation ${unlisted.path}\noracle: ${stable(unlisted.legacy)}\ngot: ${stable(unlisted.got)}\n(first diff ${diff ? diff.path : '$'})`);
        }
        assert.deepEqual(diffs, DEVIATIONS.diffs);
    });
});
