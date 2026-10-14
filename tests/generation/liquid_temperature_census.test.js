// The six liquid/temperature invariants as a census on a fixed sample, engine 1.2.0
// (findings/liquid_temperature_minimal.md). Fails on any regression.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateHex } from '@voyage/generation';
import { parseT5Tab } from '@voyage/shared';
import { createRequire } from 'node:module';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { withEngineRng } from '../golden/rng_lock.js';
import { censusHex } from './liquid_temperature_census.js';

const engineVersion = createRequire(import.meta.url)('../../packages/engines/package.json').version;
const pinned = { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };
const ROOT = new URL('../../', import.meta.url);

function sample() {
    const out = [];
    for (const [slug, take] of [['Spinward_Marches', 120], ['Core', 40], ['Reft', 20], ['Trojan_Reach', 40]]) {
        const rows = [...parseT5Tab(fs.readFileSync(new URL(`universe/raw/${slug}.tsv`, ROOT), 'utf8')).entries()]
            .filter(([, row]) => row.type === 'SYSTEM_PRESENT' && row.partial == null)
            .sort((a, b) => (a[0] < b[0] ? -1 : 1));
        const picked = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / take)) === 0).slice(0, take);
        if (slug === 'Spinward_Marches' && !picked.some(([hex]) => hex === '1910')) picked.push(rows.find(([hex]) => hex === '1910'));
        for (const [hex, row] of picked) out.push({ hexKey: `${slug}/${hex}`, mode: 'flesh', summary: row, chart: row });
    }
    for (let i = 0; i < 60; i++) out.push({ hexKey: `Uncharted_Census/${String(i).padStart(4, '0')}`, mode: 'generate', summary: { type: 'SYSTEM_PRESENT' }, chart: null });
    return out;
}

// universe/raw/*.tsv is git-ignored: CI has no chart files, so the census runs only where they are.
const SLUGS = ['Spinward_Marches', 'Core', 'Reft', 'Trojan_Reach'];
const missing = SLUGS.filter((slug) => !fs.existsSync(new URL(`universe/raw/${slug}.tsv`, ROOT)));

test('liquid and temperature census: every invariant holds on the fixed sample', { skip: missing.length ? `no universe/raw/${missing[0]}.tsv` : false }, async () => {
    await withEngineRng(async () => {
        const fails = [];
        const counted = [];
        let hexes = 0;
        for (const item of sample()) {
            const env = generateHex({ hexKey: item.hexKey, edition: 'MgT2E', mode: item.mode, summary: item.summary, pinned });
            hexes += 1;
            for (const f of censusHex(item.hexKey, env, item.chart)) {
                if (f.inv === 'OK') continue;
                if (f.inv === 'I4R') counted.push(f); else fails.push(f);
            }
        }
        assert.equal(hexes, 281);
        assert.deepEqual(fails.slice(0, 5), [], `${fails.length} invariant failures`);
        // The one counted remainder (handoff 198): atmosphere 10-12, no listed liquid holds the mean.
        // A change in this number is a change in generation and must be explained.
        assert.equal(counted.length, 353);
    });
});

test('Regina keeps her chart and her liquid agrees with her temperature', async () => {
    await withEngineRng(async () => {
        const row = parseT5Tab(fs.readFileSync(new URL('universe/raw/Spinward_Marches.tsv', ROOT), 'utf8')).get('1910');
        const env = generateHex({ hexKey: 'Spinward_Marches/1910', edition: 'MgT2E', mode: 'flesh', summary: row, pinned });
        const m = env.body.mgt2eData;
        assert.equal(m.uwp, 'A788899-C');
        assert.equal(m.atmCode, 8);
        assert.equal(m.hydroCode, 8);
        assert.ok(!m.tradeCodes.includes('Fl'));
        // Her stored mean is below Water's melting point (273 K), so her water is Ice (mean rule).
        assert.equal(m.meanTempK, 204.41937560732526);
        assert.equal(m.liquidType, 'Ice');
        assert.equal(m.liquidStatus, undefined);
    });
});
