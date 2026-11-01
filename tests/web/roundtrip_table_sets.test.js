/**
 * AQ4 round 5. A copy of the official trade set, edited, then read back through
 * the same check the client uses (`validateTableSet`). The trade and traffic
 * rollers, given an unedited copy, match the official file. One edited goods
 * row is the only difference.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTableSet } from '@voyage/shared';
import { hashString, mulberry32 } from '../../packages/engines/src/core/rng.js';
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import published from '../../packages/engines/src/generated/rules/mgt2e_trade.js';
import { setFor } from '../../apps/web/src/campaign/table_sets.ts';
import {
    TRADE_CODE_NAMES,
    goodsAvailable,
    purchasePrice,
    tradeGood,
    tradeTables,
} from '../../apps/web/src/campaign/trade.ts';
import { fare, freightTraffic, passengerTraffic } from '../../apps/web/src/campaign/traffic_lots.ts';

const OFFICIAL = {
    schemaVersion: 1,
    kind: 'trade',
    id: 'official:trade',
    name: 'Official trade',
    basedOn: null,
    edition: 'MgT2E',
    tables: published,
};

function copyOf(name, edit) {
    const tables = JSON.parse(JSON.stringify(published));
    if (edit) edit(tables);
    return {
        schemaVersion: 1,
        kind: 'trade',
        id: 'ts_aq4round5',
        name,
        basedOn: 'official:trade',
        edition: 'MgT2E',
        tables,
    };
}

function faceFrom(seed) {
    const rng = mulberry32(hashString(seed));
    return () => 1 + Math.floor(rng() * 6);
}

function worldFrom(rng) {
    const codes = Object.keys(TRADE_CODE_NAMES);
    const count = Math.floor(rng() * 3);
    const tradeCodes = [];
    for (let i = 0; i < count; i += 1) tradeCodes.push(codes[Math.floor(rng() * codes.length)]);
    const ports = published.supplier.starportDms.map((row) => String(row.label).replace(/^Class /, ''));
    const zones = [null, 'amber', 'red'];
    return {
        tradeCodes,
        starport: ports[Math.floor(rng() * ports.length)],
        population: Math.floor(rng() * 10),
        techLevel: Math.floor(rng() * 16),
        lawLevel: Math.floor(rng() * 10),
        zone: zones[Math.floor(rng() * zones.length)],
    };
}

function queries() {
    const rng = mulberry32(hashString('aq4-round-5-trade'));
    const jumps = published.fares.rows.length;
    const out = [];
    for (let i = 0; i < 20; i += 1) {
        out.push({
            from: worldFrom(rng),
            to: worldFrom(rng),
            parsecs: 1 + Math.floor(rng() * jumps),
            effect: Math.floor(rng() * 7) - 2,
            steward: rng() < 0.3 ? undefined : Math.floor(rng() * 4),
        });
    }
    return out;
}

function rolled(set, index, query) {
    const tables = tradeTables(set);
    const traffic = { ...query, set };
    return {
        goods: goodsAvailable({ world: query.from }, faceFrom(`aq4-round-5-trade-${index}-goods`), tables),
        passengers: passengerTraffic({ ...traffic, face: faceFrom(`aq4-round-5-trade-${index}-pass`) }),
        freight: freightTraffic({ ...traffic, face: faceFrom(`aq4-round-5-trade-${index}-freight`) }),
        fare: fare(query.parsecs, 'high', set),
        good: tradeGood(published.goods.table[0].d66, tables),
        other: tradeGood(published.goods.table[1].d66, tables),
        buy: (good) => purchasePrice(
            { good, world: query.from, tons: 1, brokerSkill: 0 },
            faceFrom(`aq4-round-5-trade-${index}-buy-${good.d66}`),
            tables,
        ),
    };
}

test('a copy of the official trade set, edited, reads back as written', () => {
    const written = copyOf('House trade', (tables) => {
        tables.goods.table[0].basePrice = 12345;
    });
    const read = validateTableSet(JSON.parse(JSON.stringify(written)));
    assert.equal(read.ok, true);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.set, written);
    const resolved = setFor('trade', { tableSets: { trade: written.id } }, [read.set], { trade: OFFICIAL });
    assert.equal(resolved.fellBack, false);
    assert.equal(resolved.words, null);
    assert.deepEqual(resolved.set, written);
});

test('an unedited copy matches the official rollers; one edited goods row is the only difference', () => {
    const plain = copyOf('Plain copy');
    const edited = copyOf('House trade', (tables) => {
        tables.goods.table[0].basePrice = 12345;
    });
    const d66 = published.goods.table[0].d66;
    const otherD66 = published.goods.table[1].d66;
    assert.notEqual(edited.tables.goods.table[0].basePrice, published.goods.table[0].basePrice);
    let sawEditedLot = 0;
    for (const [index, query] of queries().entries()) {
        const official = rolled(null, index, query);
        const same = rolled(plain, index, query);
        assert.deepEqual(same.goods, official.goods);
        assert.deepEqual(same.passengers, official.passengers);
        assert.deepEqual(same.freight, official.freight);
        assert.deepEqual(same.fare, official.fare);
        assert.deepEqual(same.good, official.good);
        assert.deepEqual(same.other, official.other);
        assert.deepEqual(same.buy(same.good), official.buy(official.good));
        assert.deepEqual(same.buy(same.other), official.buy(official.other));

        const changed = rolled(edited, index, query);
        assert.deepEqual(changed.passengers, official.passengers);
        assert.deepEqual(changed.freight, official.freight);
        assert.deepEqual(changed.fare, official.fare);
        assert.deepEqual(changed.other, official.other);
        assert.equal(changed.good.d66, d66);
        assert.equal(changed.good.basePrice, 12345);
        assert.notEqual(changed.good.basePrice, official.good.basePrice);
        const { basePrice: changedPrice, ...changedRest } = changed.good;
        const { basePrice: officialPrice, ...officialRest } = official.good;
        assert.equal(changedPrice, 12345);
        assert.deepEqual(changedRest, officialRest);
        assert.notEqual(officialPrice, 12345);

        assert.equal(changed.goods.lots.length, official.goods.lots.length);
        for (let lot = 0; lot < official.goods.lots.length; lot += 1) {
            const fromOfficial = official.goods.lots[lot];
            const fromCopy = changed.goods.lots[lot];
            if (fromOfficial.d66 !== d66) {
                assert.deepEqual(fromCopy, fromOfficial);
                continue;
            }
            sawEditedLot += 1;
            assert.equal(fromCopy.basePrice, 12345);
            assert.notEqual(fromCopy.basePrice, fromOfficial.basePrice);
            const { basePrice: copyPrice, ...copyLot } = fromCopy;
            const { basePrice: filePrice, ...fileLot } = fromOfficial;
            assert.equal(copyPrice, 12345);
            assert.deepEqual(copyLot, fileLot);
            assert.notEqual(filePrice, 12345);
        }
        assert.deepEqual(
            { ...changed.goods, lots: null },
            { ...official.goods, lots: null },
        );

        const bought = changed.buy(changed.good);
        const boughtOfficial = official.buy(official.good);
        assert.deepEqual(bought.dice, boughtOfficial.dice);
        assert.deepEqual(bought.dms, boughtOfficial.dms);
        assert.equal(bought.total, boughtOfficial.total);
        assert.equal(bought.percent, boughtOfficial.percent);
        assert.notEqual(bought.perTon, boughtOfficial.perTon);
        assert.notEqual(bought.price, boughtOfficial.price);
        assert.deepEqual(changed.buy(changed.other), official.buy(official.other));
        assert.equal(changed.other.d66, otherD66);
    }
    assert.ok(sawEditedLot >= 1, 'the edited goods row was on the table the roller read');
});
