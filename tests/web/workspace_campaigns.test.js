/**
 * Several campaigns (apps/web/src/workspace/campaigns.ts): the words and small rules round
 * the store's list, create, rename, switch and delete.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import {
    CAMPAIGN_CAP, canCreate, cleanCampaignName, deleteWords, freshName, sortCampaigns,
} from '../../apps/web/src/workspace/campaigns.ts';

test('a name is cleaned and held to the limit; the cap is ten', () => {
    assert.equal(cleanCampaignName('  The  Spinward\tRun '), 'The Spinward Run');
    assert.equal(cleanCampaignName('   '), '');
    assert.equal(cleanCampaignName('x'.repeat(400)).length, CAMPAIGN_LIMITS.name);
    assert.equal(CAMPAIGN_CAP, 10);
    assert.equal(canCreate(0), true);
    assert.equal(canCreate(9), true);
    assert.equal(canCreate(10), false);
});

test('the menu lists campaigns by name; a new one gets a name not yet taken', () => {
    const rows = [{ id: 'b', name: 'Zhodani Front' }, { id: 'a', name: 'the spinward run' }, { id: 'c', name: 'Aslan Border' }];
    assert.deepEqual(sortCampaigns(rows).map((row) => row.name), ['Aslan Border', 'the spinward run', 'Zhodani Front']);
    assert.equal(freshName([]), 'My campaign');
    assert.equal(freshName(['my campaign']), 'My campaign 2');
    assert.equal(freshName(['My campaign', 'My campaign 2']), 'My campaign 3');
    assert.equal(freshName(['Other']), 'My campaign');
});

test('the delete question says what goes with the campaign', () => {
    assert.equal(deleteWords('Second Game', 0), 'Delete Second Game? It has no records. This cannot be undone.');
    assert.equal(deleteWords('Second Game', 1), 'Delete Second Game? Its one record goes with it. This cannot be undone.');
    assert.equal(deleteWords('Second Game', 7), 'Delete Second Game? Its 7 records go with it. This cannot be undone.');
    assert.equal(deleteWords('Second Game', null), 'Delete Second Game? Everything in it goes with it. This cannot be undone.');
});
