import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { OFFICIAL_TRADE_LABEL, tradeChoice, tradeGood } from '../../apps/web/src/campaign/trade.ts';

function tradeSet(edit) {
    const tables = JSON.parse(readFileSync('rules/mgt2e_trade.json', 'utf8'));
    if (edit) edit(tables);
    return { schemaVersion: 1, kind: 'trade', id: 'ts_mine', name: 'My trade tables', basedOn: 'official:trade', edition: 'MgT2E', tables };
}

test('Trade here names the official file, or the campaign set it rolled', () => {
    const none = tradeChoice(null);
    assert.equal(none.label, OFFICIAL_TRADE_LABEL);
    assert.equal(none.words, null);
    assert.equal(tradeGood('11', none.tables).basePrice, 20000);

    const official = tradeChoice({ tableSets: { trade: 'official:trade' } });
    assert.equal(official.label, 'Official trade tables');
    assert.equal(tradeGood('11', official.tables).basePrice, 20000);

    const mine = tradeSet((tables) => { tables.goods.table[0].basePrice = 12345; });
    const chosen = tradeChoice({ tableSets: { trade: 'ts_mine' } }, [mine]);
    assert.equal(chosen.label, 'My trade tables');
    assert.equal(chosen.words, null);
    assert.equal(tradeGood('11', chosen.tables).basePrice, 12345);

    const missing = tradeChoice({ tableSets: { trade: 'ts_gone' } }, []);
    assert.equal(missing.label, 'Official trade tables');
    assert.equal(missing.words, "This campaign's trade table could not be read; using the official table.");
    assert.equal(tradeGood('11', missing.tables).basePrice, 20000);
});
