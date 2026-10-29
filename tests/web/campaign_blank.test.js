/**
 * AQ1. campaignIsBlank is a closed campaign, or an open one with nothing on the map.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaignIsBlank } from '../../apps/web/src/map/campaign_layer.ts';

const empty = { party: null, locate: null };

test('null and an empty snapshot are blank, and any mark is not', () => {
    assert.equal(campaignIsBlank(null), true);
    assert.equal(campaignIsBlank(empty), true);
    assert.equal(campaignIsBlank({ ...empty, vessels: [], ships: [] }), true);
    assert.equal(campaignIsBlank({ ...empty, party: { vesselIds: [] } }), false);
    assert.equal(campaignIsBlank({ ...empty, locate: { hexKey: 'Spinward_Marches/1910' } }), false);
    assert.equal(campaignIsBlank({ ...empty, vessels: [{ name: 'Beowulf' }] }), false);
    assert.equal(campaignIsBlank({ ...empty, ships: [{ name: 'Beowulf' }] }), false);
});
