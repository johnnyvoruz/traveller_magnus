import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    TRADE_CODE_NAMES,
    columnDm,
    findSupplier,
    goodsAvailable,
    modifiedPriceRow,
    parseDice,
    purchasePrice,
    quantityDm,
    rollLocalBroker,
    rollTons,
    saleDm,
    salePrice,
    starportDm,
    tradeGood,
    tradeTables,
    worldNames,
} from '../../apps/web/src/campaign/trade.ts';

/** Faces in order; the test fails if the code asks for more than it was given. */
function faces(...values) {
    let at = 0;
    return () => {
        assert.ok(at < values.length, 'asked for more dice than the test gave');
        return values[at++];
    };
}

const world = (over = {}) => ({ tradeCodes: [], starport: 'C', population: 0, techLevel: 10, lawLevel: 0, zone: null, ...over });
const TRADE_LINE = /^assets\/trade\.txt:\d+(?:-\d+)?$/;
const citedFromTradeText = (list) => {
    assert.ok(list.length > 0, 'a result cites at least one line');
    for (const one of list) assert.match(one, TRADE_LINE);
};

function tradeSet(edit) {
    const tables = JSON.parse(readFileSync('rules/mgt2e_trade.json', 'utf8'));
    edit(tables);
    return { schemaVersion: 1, kind: 'trade', id: 'ts_mine', name: 'My trade tables', basedOn: 'official:trade', edition: 'MgT2E', tables };
}

test('tables: the official file by default; a valid chosen set is read; a broken one falls back', () => {
    const official = tradeTables();
    assert.equal(tradeGood('11', official).basePrice, 20000);
    const mine = tradeTables(tradeSet((tables) => { tables.goods.table[0].basePrice = 12345; }));
    assert.equal(tradeGood('11', mine).basePrice, 12345);
    const broken = tradeTables(tradeSet((tables) => { tables.goods.table.pop(); }));
    assert.equal(tradeGood('11', broken).basePrice, 20000);
    assert.equal(tradeTables({ ...tradeSet(() => {}), kind: 'randomPassenger' }), official);
});

test('names: every approved code reaches its printed spellings, and zones add theirs', () => {
    assert.equal(Object.keys(TRADE_CODE_NAMES).length, 16);
    assert.equal(Object.values(TRADE_CODE_NAMES).flat().length, 20);
    const names = worldNames(world({ tradeCodes: ['Hi', 'Ht', 'Ic', 'Zz'], zone: 'red' }));
    assert.deepEqual([...names].sort(), ['High Pop', 'High Population', 'High Tech', 'High-Tech', 'Ice Capped', 'Ice-Capped', 'Red Zone']);
    const official = JSON.parse(readFileSync('rules/mgt2e_trade.json', 'utf8'));
    const known = new Set([...Object.values(TRADE_CODE_NAMES).flat(), 'All', 'Amber Zone', 'Red Zone']);
    for (const row of official.goods.table) {
        for (const name of [...(row.availability ?? []), ...Object.keys(row.purchaseDM ?? {}), ...Object.keys(row.saleDM ?? {})]) {
            assert.ok(known.has(name), `"${name}" in row ${row.d66} has a code`);
        }
    }
});

test('dice strings: the printed forms parse, others do not', () => {
    assert.deepEqual(parseDice('2D x 10'), { count: 2, times: 10, unit: null });
    assert.deepEqual(parseDice('1D days'), { count: 1, times: 1, unit: 'days' });
    assert.equal(parseDice('2D/3'), null);
});

test('supplier: starport DMs A +6, B +4, C +2, and none listed for D', () => {
    assert.equal(starportDm(world({ starport: 'A' })).dm, 6);
    assert.equal(starportDm(world({ starport: 'B' })).dm, 4);
    assert.equal(starportDm(world({ starport: 'C' })).dm, 2);
    const d = starportDm(world({ starport: 'D' }));
    assert.equal(d.dm, 0);
    assert.match(d.label, /no starport DM listed/);
});

test('supplier: 2D + skill + characteristic + starport - 1 per earlier attempt, Average 8+, 1D days', () => {
    const found = findSupplier({ kind: 'supplier', world: world({ starport: 'A' }), skill: 1, characteristicDm: 1, previousAttempts: 2 }, faces(3, 4, 5));
    assert.equal(found.check, 'Finding a Supplier or Broker');
    assert.deepEqual(found.dice, [3, 4]);
    assert.equal(found.total, 3 + 4 + 1 + 1 + 6 - 2);
    assert.equal(found.target, 8);
    assert.equal(found.found, true);
    assert.equal(found.effect, 5);
    assert.deepEqual(found.time, { dice: [5], amount: 5, unit: 'days' });
    citedFromTradeText(found.cites);
    const missed = findSupplier({ kind: 'supplier', world: world({ starport: 'X' }), skill: 0, characteristicDm: -1 }, faces(2, 3, 1));
    assert.equal(missed.total, 4);
    assert.equal(missed.found, false);
});

test('supplier: black market is Streetwise; online needs TL8+ and takes hours', () => {
    const black = findSupplier({ kind: 'blackMarket', world: world(), skill: 2, characteristicDm: 0 }, faces(4, 4, 2));
    assert.match(black.check, /Black Market/);
    assert.equal(black.dms[0].label, 'Streetwise skill');
    const low = findSupplier({ kind: 'online', world: world({ techLevel: 7 }), skill: 1, characteristicDm: 0 }, faces());
    assert.equal(low.allowed, false);
    assert.match(low.words, /TL8\+ worlds/);
    const unknown = findSupplier({ kind: 'online', world: world({ techLevel: null }), skill: 1, characteristicDm: 0 }, faces());
    assert.equal(unknown.allowed, false);
    const online = findSupplier({ kind: 'online', world: world({ techLevel: 8 }), skill: 1, characteristicDm: 0 }, faces(6, 6, 3));
    assert.equal(online.allowed, true);
    assert.equal(online.dms[0].label, 'Admin skill');
    assert.deepEqual(online.time, { dice: [3], amount: 3, unit: 'hours' });
});

test('quantity: Population 3- is DM-3, 9+ is DM+3, otherwise none; zero or less is none', () => {
    assert.equal(quantityDm(world({ population: 3 })).dm, -3);
    assert.equal(quantityDm(world({ population: 9 })).dm, 3);
    assert.equal(quantityDm(world({ population: 6 })), null);
    const electronics = tradeGood('11');
    assert.deepEqual(rollTons(electronics, -3, faces(1, 1)), { dice: [1, 1], dm: -3, tons: 0 });
    assert.deepEqual(rollTons(electronics, 3, faces(6, 6)), { dice: [6, 6], dm: 3, tons: 150 });
    assert.equal(rollTons(tradeGood('66'), 0, faces()), null);
});

test('goods: an Industrial supplier has the Common Goods and the legal Industrial goods (lines 409-419)', () => {
    const dice = Array.from({ length: 64 }, () => 3);
    const result = goodsAvailable({ world: world({ tradeCodes: ['In'], population: 0 }) }, faces(...dice));
    const rows = result.lots.map((lot) => lot.d66);
    assert.deepEqual(rows, ['11', '12', '13', '14', '15', '16', '21', '22', '23', '24', '25', '43', '46', '56']);
    assert.ok(result.lots.every((lot) => lot.illegal === false));
    assert.ok(result.lots.slice(0, 6).every((lot) => lot.from[0] === 'common'));
    // Population 0 is 3-: DM-3 on the 2D, then x 10 (lines 344-347).
    assert.equal(result.quantityDm.dm, -3);
    assert.equal(result.lots[0].tons, (3 + 3 - 3) * 10);
    assert.equal(result.randomRolls.length, 0);
    citedFromTradeText(result.cites);
});

test('goods: as many random rolls as the population code; 61-65 re-rolled; a repeat adds a lot; 66 is the referee\'s', () => {
    const common = Array.from({ length: 12 }, () => 1);
    const result = goodsAvailable({ world: world({ population: 2 }) }, faces(...common, 6, 3, 1, 1, 2, 2, 6, 6));
    assert.deepEqual(result.randomRolls, [
        { dice: [1, 1], d66: '11', rerolled: true },
        { dice: [6, 6], d66: '66', rerolled: false },
    ]);
    const electronics = result.lots.find((lot) => lot.d66 === '11');
    assert.deepEqual(electronics.from, ['common', 'random']);
    // DM-3 at Population 2: the common lot is (1 + 1 - 3) -> 0, the repeat (2 + 2 - 3) x 10.
    assert.deepEqual(electronics.tonsRolls.map((roll) => roll.tons), [0, 10]);
    assert.equal(electronics.tons, 10);
    assert.equal(result.exotics.length, 1);
    assert.equal(result.exotics[0].type, 'Exotics');
});

test('goods: a black market supplier has the matching illegal goods and rolls 1D with 6 leading', () => {
    const result = goodsAvailable({ world: world({ tradeCodes: ['In', 'Ht'], population: 1 }), blackMarket: true }, faces(2, 2, 1, 3));
    assert.deepEqual(result.lots.map((lot) => lot.d66), ['61', '62', '65']);
    assert.deepEqual(result.lots.map((lot) => lot.from[0]), ['random', 'tradeCode', 'tradeCode']);
    assert.deepEqual(result.randomRolls, [{ dice: [1], d66: '61', rerolled: false }]);
    assert.ok(!result.lots.some((lot) => lot.d66 === '11'), 'no Common Goods at a black market');
    assert.ok(result.lots.every((lot) => lot.illegal === true));
});

test('price DMs: only the largest in each column', () => {
    assert.deepEqual(columnDm(tradeGood('11').purchaseDM, world({ tradeCodes: ['In', 'Ht', 'Ri'] })), { dm: 3, name: 'High Tech' });
    assert.deepEqual(columnDm(tradeGood('11').purchaseDM, world({ tradeCodes: ['Ag'] })), { dm: 0, name: null });
    assert.deepEqual(columnDm(tradeGood('15').purchaseDM, world({ tradeCodes: ['As'] })), { dm: -4, name: 'Asteroid' });
});

test('illegal goods: a local ban gives Law difference as Sale DM, the higher of that and the column', () => {
    const weapons = tradeGood('65');
    assert.equal(saleDm(weapons, world({ lawLevel: 9 }), 3).dm, 6);
    assert.equal(saleDm(weapons, world({ lawLevel: 9, zone: 'red' }), 3).dm, 10);
    assert.equal(saleDm(weapons, world({ lawLevel: 2 }), 3).dm, 0);
    const vehicles = tradeGood('56');
    assert.equal(saleDm(vehicles, world({ lawLevel: 9, tradeCodes: ['Ni'] }), 3).dm, 6);
    citedFromTradeText(saleDm(weapons, world({ lawLevel: 9 }), 3).cites);
});

test('modified price: the bands, open at both ends', () => {
    assert.deepEqual([modifiedPriceRow(-7).purchasePercent, modifiedPriceRow(-7).salePercent], [300, 10]);
    assert.deepEqual([modifiedPriceRow(8).purchasePercent, modifiedPriceRow(8).salePercent], [100, 80]);
    assert.deepEqual([modifiedPriceRow(31).purchasePercent, modifiedPriceRow(31).salePercent], [15, 400]);
});

test('purchase: 3D + Broker + Purchase DM - Sale DM - supplier Broker 2', () => {
    const bought = purchasePrice({ good: tradeGood('11'), world: world({ tradeCodes: ['Ht'] }), tons: 10, brokerSkill: 1 }, faces(4, 4, 4));
    assert.equal(bought.total, 12 + 1 + 3 - 0 - 2);
    assert.equal(bought.percent, 70);
    assert.equal(bought.perTon, 14000);
    assert.equal(bought.price, 140000);
    assert.equal(bought.brokerFee, null);
    assert.deepEqual(bought.dms.map((line) => line.dm), [1, 3, -0, -2]);
    citedFromTradeText(bought.cites);
    const pushed = purchasePrice({ good: tradeGood('11'), world: world({ tradeCodes: ['Ht'] }), tons: 1, brokerSkill: 1, otherSkill: 4 }, faces(4, 4, 4));
    assert.equal(pushed.total, 12);
});

test('sale: 3D + Broker + Sale DM - Purchase DM - purchaser Broker 2', () => {
    const sold = salePrice({ good: tradeGood('11'), world: world({ tradeCodes: ['Ni', 'Po'] }), tons: 10, brokerSkill: 0 }, faces(3, 3, 3));
    assert.equal(sold.total, 9 + 0 + 2 - 0 - 2);
    assert.equal(sold.percent, 85);
    assert.equal(sold.price, 170000);
    citedFromTradeText(sold.cites);
});

test('local brokers: their skill, DM+2 on negotiations, 10% (20% for illegal goods) of the gross', () => {
    const bought = purchasePrice({ good: tradeGood('11'), world: world(), tons: 10, brokerSkill: 3, broker: { kind: 'legal', skill: 2 } }, faces(4, 4, 4));
    assert.deepEqual(bought.dms.slice(0, 2).map((line) => line.dm), [2, 2]);
    assert.equal(bought.total, 12 + 2 + 2 - 2);
    assert.equal(bought.percent, 70);
    assert.equal(bought.brokerFee, 14000);
    const fixer = salePrice({ good: tradeGood('65'), world: world({ zone: 'red' }), tons: 5, brokerSkill: 0, broker: { kind: 'illegal', skill: 1 } }, faces(1, 1, 1));
    assert.equal(fixer.total, 3 + 1 + 2 + 10 - 0 - 2);
    assert.equal(fixer.brokerFee, (fixer.price * 20) / 100);
});

test('local brokers: 2D/3 left unrounded; a natural 2 on the fixer is an informer', () => {
    const broker = rollLocalBroker('legal', faces(3, 4));
    assert.equal(broker.total, 7);
    assert.equal(broker.third, 7 / 3);
    assert.equal(broker.informer, false);
    assert.equal(rollLocalBroker('legal', faces(1, 1)).informer, false);
    const fixer = rollLocalBroker('illegal', faces(1, 1));
    assert.equal(fixer.informer, true);
    assert.equal(fixer.feePercent, 20);
    citedFromTradeText(fixer.cites);
});

test('Exotics stay out of every price roll', () => {
    const exotic = purchasePrice({ good: tradeGood('66'), world: world(), tons: 1, brokerSkill: 0 }, faces());
    assert.equal(exotic.allowed, false);
    assert.match(exotic.words, /referee decides/);
});