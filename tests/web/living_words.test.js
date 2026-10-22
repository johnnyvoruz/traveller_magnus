/**
 * Switch and ticker words, pinned to the spec sentences.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LIVING_WORDS } from '../../apps/web/src/living/words.ts';

test('the living switches use the spec sentences', () => {
    assert.equal(LIVING_WORDS.chatterLabel, 'Show system chatter');
    assert.equal(LIVING_WORDS.chatterHelp, 'Short radio traffic while a system is open in the orbit view. Players see it too.');
    assert.equal(LIVING_WORDS.trafficLabel, 'Show background traffic');
    assert.equal(LIVING_WORDS.trafficHelp, "Ships that come and go in the orbit view. They're scenery, not tracked ships.");
    assert.equal(LIVING_WORDS.quietLabel, 'Quiet on this device');
    assert.equal(LIVING_WORDS.quietHelp, 'Hides background traffic on this device only. System Comms has its own switch.');
    assert.equal(LIVING_WORDS.trafficChip, 'Traffic');
    assert.equal(LIVING_WORDS.hideVisit, 'Hide for this visit');
    const settings = readFileSync(new URL('../../apps/web/src/workspace/LivingSettings.vue', import.meta.url), 'utf8');
    // LS3b: the settings screen reads these words, not a copy of them.
    // CC2: System Comms replaced the chatter switch, so those two keys stay in words.ts for E.
    for (const key of ['trafficLabel', 'trafficHelp', 'quietLabel', 'quietHelp']) {
        assert.ok(settings.includes('LIVING_WORDS.' + key), key);
    }
    assert.equal(settings.includes('LIVING_WORDS.chatterLabel'), false);
    assert.equal(settings.includes('LIVING_WORDS.chatterHelp'), false);
});
