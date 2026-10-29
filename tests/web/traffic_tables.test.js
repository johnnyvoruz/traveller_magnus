/**
 * AQ1. trafficTables is the trade resolver's tables, official unless a valid trade set is passed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { trafficTables } from '../../apps/web/src/campaign/traffic_lots.ts';
import { tradeTables } from '../../apps/web/src/campaign/trade.ts';

function tradeSet(kind) {
    const tables = JSON.parse(readFileSync('rules/mgt2e_trade.json', 'utf8'));
    tables.freight.lots[0].name = 'Marked lot';
    return { schemaVersion: 1, kind, id: 'ts_mine', name: 'Mine', basedOn: 'official:trade', edition: 'MgT2E', tables };
}

test('no set and a set of the wrong kind are the official tables, and a trade set is read', () => {
    const official = tradeTables();
    assert.deepEqual(trafficTables(), official);
    assert.deepEqual(trafficTables(null), official);
    assert.deepEqual(trafficTables(tradeSet('randomPassenger')), official);
    const chosen = trafficTables(tradeSet('trade'));
    assert.equal(chosen.freight.lots[0].name, 'Marked lot');
    assert.equal(official.freight.lots[0].name === 'Marked lot', false);
});
