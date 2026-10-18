/**
 * TS2b: CampaignSettings can store tableSets. An old row with no key still parses.
 * The players projection carries the map, so a player sees the chosen set.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CampaignSettings, playersView } from '@voyage/shared';

const base = {
    party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
    kinds: {},
    calendar: { dateFormat: 'imperial' },
    rev: 1,
};

test('an old settings row with no tableSets parses', () => {
    const parsed = CampaignSettings.parse(base);
    assert.equal(Object.hasOwn(parsed, 'tableSets'), false);
    const lifted = CampaignSettings.parse({
        party: { vesselId: null, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    });
    assert.equal(Object.hasOwn(lifted, 'tableSets'), false);
});

test('tableSets round-trips as kind to set id', () => {
    const tableSets = { randomPassenger: 'official:randomPassenger', trade: 'ts_house' };
    const parsed = CampaignSettings.parse({ ...base, tableSets });
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)).tableSets, tableSets);
    assert.equal(CampaignSettings.safeParse({ ...base, tableSets: { trade: 3 } }).success, false);
});

test('the players projection carries tableSets', () => {
    const settings = CampaignSettings.parse({ ...base, tableSets: { trade: 'ts_house' } });
    const view = playersView({ records: [], links: [], journal: [], settings, clock: null });
    assert.deepEqual(view.settings.tableSets, { trade: 'ts_house' });
    assert.equal(view.settings.rev, undefined);
});
