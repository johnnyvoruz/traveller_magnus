// Engine 1.2.0: the late exotic liquid die (decideSurfaceLiquid with no stored liquidRoll) is drawn
// on its own stream keyed on hex and body. It must not move any roll on the shared stream after it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { generateHex } from '@voyage/generation';
import { parseT5Tab } from '@voyage/shared';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { withEngineRng } from '../golden/rng_lock.js';
import { rng, reseedForHex } from '../../packages/engines/src/core/rng.js';
import { generateBiospherics } from '../../packages/engines/src/mgt2e_world_engine.js';
import { isExoticAtmosphere, liquidCandidates } from '../../packages/engines/src/surface_liquid.js';

const engineVersion = createRequire(import.meta.url)('../../packages/engines/package.json').version;
const pinned = { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };
const LIQUID = new Set(['liquidRoll', 'liquidType', 'liquidStatus']);

function* bodies(sys) {
    for (const w of sys.worlds || []) { yield w; for (const m of w.moons || []) yield m; }
}
const lateCandidate = b => isExoticAtmosphere(b.atmCode) && b.hydroPercent > 0 && liquidCandidates(b.meanTempK).length > 0;
const strip = sys => JSON.parse(JSON.stringify(sys, (k, v) => (LIQUID.has(k) ? undefined : v)));

/** Run biospherics on a copy, then read the next five shared dice. */
function rerun(sys, dropRolls) {
    const copy = structuredClone(sys);
    let dropped = 0;
    if (dropRolls) for (const b of bodies(copy)) if (lateCandidate(b)) { delete b.liquidRoll; dropped += 1; }
    reseedForHex('late-die-probe');
    generateBiospherics(copy);
    const after = [rng(), rng(), rng(), rng(), rng()];
    return { copy, after, dropped };
}

test('a late liquid die moves no later roll on the shared stream', async () => {
    await withEngineRng(async () => {
        // Spinward Marches 0311 took a late draw in Lane C's probe (findings/liquid_minimal_review.md).
        const row = parseT5Tab(fs.readFileSync(new URL('../../universe/raw/Spinward_Marches.tsv', import.meta.url), 'utf8')).get('0311');
        const env = generateHex({ hexKey: 'Spinward_Marches/0311', edition: 'MgT2E', mode: 'flesh', summary: row, pinned });
        const sys = env.body.mgtSystem;
        const kept = rerun(sys, false);
        const late = rerun(sys, true);
        assert.ok(late.dropped > 0, 'the probe needs at least one body that takes a late draw');
        assert.ok([...bodies(late.copy)].filter(lateCandidate).every(b => Number.isFinite(b.liquidRoll)), 'every late body got a die');
        assert.deepEqual(late.after, kept.after, 'the shared stream after biospherics moved');
        assert.deepEqual(strip(late.copy), strip(kept.copy), 'a roll after the late die moved');
        // Same body, same die on every run.
        const again = rerun(sys, true);
        assert.deepEqual([...bodies(again.copy)].map(b => b.liquidRoll), [...bodies(late.copy)].map(b => b.liquidRoll));
    });
});
