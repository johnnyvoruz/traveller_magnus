/**
 * AQ1. tierFor. Galaxy below PPP_DOTS, sector until PPP_GRID, hex from PPP_GRID up.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PPP_DOTS, PPP_GRID, tierFor } from '../../apps/web/src/map/tiers.ts';

test('the tier changes at the dot and grid limits', () => {
    assert.equal(tierFor(0), 'galaxy');
    assert.equal(tierFor(PPP_DOTS - 0.001), 'galaxy');
    assert.equal(tierFor(PPP_DOTS), 'sector');
    assert.equal(tierFor(PPP_GRID - 0.001), 'sector');
    assert.equal(tierFor(PPP_GRID), 'hex');
    assert.equal(tierFor(PPP_GRID + 1), 'hex');
});
