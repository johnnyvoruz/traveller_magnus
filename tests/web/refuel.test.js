import assert from 'node:assert/strict';
import { test } from 'node:test';
import generated from '../../packages/engines/src/generated/rules/mgt2e_space_travel.js';
import { fuelCapacityTons, fuelCrPerTon, fuelOffers, monthlyLines, MONTHLY_COST_FIELDS, refuelCost, refuelLine, tonsToFill } from '../../apps/web/src/campaign/refuel.ts';

const DAY = { year: 1105, day: 12 };

test('a full tank costs the file\'s Cr per ton times the capacity', () => {
    assert.equal(typeof generated.fuel.refinedCrPerTon, 'number');
    assert.equal(typeof generated.fuel.unrefinedCrPerTon, 'number');
    assert.equal(fuelCrPerTon('refined'), generated.fuel.refinedCrPerTon);
    assert.equal(fuelCrPerTon('unrefined'), generated.fuel.unrefinedCrPerTon);
    assert.equal(fuelCapacityTons({ 'Fuel Capacity': '40 tons' }), 40);
    assert.equal(fuelCapacityTons({ 'Fuel Capacity': 'none' }), null);
    assert.equal(refuelCost(40, 0, 'refined'), 40 * generated.fuel.refinedCrPerTon);
    assert.equal(refuelCost(40, 10, 'unrefined'), 30 * generated.fuel.unrefinedCrPerTon);
    assert.equal(tonsToFill(40, 50), 0);
    assert.equal(refuelCost(40, 40, 'refined'), 0);
    const line = refuelLine(DAY, 40, 0, 'refined');
    assert.equal(line.amount, -(40 * generated.fuel.refinedCrPerTon));
    assert.equal(line.kind, 'expense');
    assert.equal(line.memo, 'Refuel, refined, 40 t');
    assert.equal(refuelLine(DAY, 40, 40, 'refined'), null);
});

test('Post this month writes the five upkeep boxes, and not the purchase or the tank', () => {
    assert.deepEqual([...MONTHLY_COST_FIELDS], [
        'Mortgage Cost',
        'Maintenance Cost',
        'Life Support Cost',
        'Salary Cost',
        'Running Cost',
    ]);
    const values = { 'Maintenance Cost': '1,200', 'Salary Cost': '0', 'Running Cost': 'none', 'Purchase Cost': '5000000', 'Fuel Tank Cost': '400' };
    const lines = monthlyLines(values, DAY);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].memo, 'Maintenance Cost');
    assert.equal(lines[0].amount, -1200);
    assert.equal(lines[0].kind, 'recurring');
    const all = { 'Purchase Cost': '99', 'Fuel Tank Cost': '99' };
    for (const name of MONTHLY_COST_FIELDS) all[name] = '10';
    const posted = monthlyLines(all, DAY);
    assert.equal(posted.length, 5);
    assert.deepEqual(posted.map((line) => line.memo), [...MONTHLY_COST_FIELDS]);
    assert.equal(monthlyLines(null, DAY).length, 0);
});

test('each starport class offers the grade the file names', () => {
    const table = generated.fuel.byStarportClass;
    assert.equal(table.E, 'none');
    assert.equal(table.X, 'none');
    for (const [letter, grade] of Object.entries(table)) {
        const offers = fuelOffers(letter, '', false, null);
        if (grade === 'none') {
            assert.deepEqual(offers, [], letter);
            continue;
        }
        assert.equal(offers.length, 1, letter);
        assert.equal(offers[0].from, 'starport');
        assert.equal(offers[0].grade, grade);
        assert.equal(offers[0].crPerTon, fuelCrPerTon(grade));
    }
    assert.deepEqual(fuelOffers('?', '', false, null), []);
});

test('each base offers what the file names, and only to a marked party vessel', () => {
    const bases = generated.fuel.bases;
    assert.equal(bases.N.fuel, 'refined');
    assert.equal(bases.N.crPerTon, null);
    assert.equal(bases.S.fuel, 'refined');
    assert.equal(bases.S.crPerTon, null);
    assert.equal(bases.C.fuel, null);
    assert.equal(bases.W.fuel, null);
    for (const [code, row] of Object.entries(bases)) {
        const mark = code === 'S' ? 'scout' : 'naval';
        const offers = fuelOffers('E', code, true, mark);
        if (row.fuel == null || row.fuel === 'none') {
            assert.deepEqual(offers, [], code);
            continue;
        }
        assert.equal(offers.length, 1, code);
        assert.equal(offers[0].from, 'base');
        assert.equal(offers[0].code, code);
        assert.equal(offers[0].grade, row.fuel);
        assert.equal(offers[0].crPerTon, null);
    }
    assert.deepEqual(fuelOffers('E', 'N', true, 'scout'), []);
    assert.deepEqual(fuelOffers('E', 'S', true, 'naval'), []);
    assert.deepEqual(fuelOffers('E', 'N', false, 'naval'), []);
    assert.deepEqual(fuelOffers('E', 'C', true, 'naval'), []);
    assert.deepEqual(fuelOffers('E', 'W', true, 'scout'), []);
    const both = fuelOffers('A', 'NS', true, 'naval');
    assert.equal(both.length, 2);
    assert.equal(both[0].from, 'starport');
    assert.equal(both[0].crPerTon, generated.fuel.refinedCrPerTon);
    assert.equal(both[1].from, 'base');
    assert.equal(both[1].code, 'N');
    assert.equal(both[1].crPerTon, null);
    assert.deepEqual(fuelOffers('X', 'NS', true, 'scout').map((row) => row.code), ['S']);
});
