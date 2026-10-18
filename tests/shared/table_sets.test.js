/**
 * Table sets (findings/trade_tables_design.md §9, Johnny 20:39).
 * Both official files pass. One broken file per check fails with its path.
 * An unknown kind is refused. A set over 256 KB is refused.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TABLE_SET_BYTES, validateTableSet } from '@voyage/shared';

function readRules(name) {
    return JSON.parse(readFileSync(`rules/${name}.json`, 'utf8'));
}

function envelope(kind, tables) {
    return {
        schemaVersion: 1,
        kind,
        id: `official:${kind}`,
        name: kind === 'trade' ? 'Official trade' : 'Official passengers',
        basedOn: null,
        edition: 'MgT2E',
        tables,
    };
}

function passenger(mutate) {
    const tables = readRules('mgt2e_random_passenger');
    mutate?.(tables);
    return envelope('randomPassenger', tables);
}

function trade(mutate) {
    const tables = readRules('mgt2e_trade');
    mutate?.(tables);
    return envelope('trade', tables);
}

function problemsOf(set) {
    const result = validateTableSet(set);
    assert.equal(result.ok, false, JSON.stringify(result.problems));
    return result.problems;
}

function has(problems, pathPart, wordsPart) {
    const hit = problems.find((item) => item.path.includes(pathPart) && item.words.includes(wordsPart));
    assert.ok(hit, JSON.stringify(problems));
}

test('both official files validate', () => {
    const passengers = validateTableSet(passenger());
    const goods = validateTableSet(trade());
    assert.equal(passengers.ok, true, JSON.stringify(passengers.problems));
    assert.equal(goods.ok, true, JSON.stringify(goods.problems));
    assert.equal(passengers.set.kind, 'randomPassenger');
    assert.equal(goods.set.kind, 'trade');
    assert.deepEqual(passengers.problems, []);
    assert.deepEqual(goods.problems, []);
});

test('a passenger file fails one check at a time, with its path', () => {
    has(problemsOf(passenger((tables) => {
        tables.entries = tables.entries.filter((entry) => entry.roll !== '42');
    })), 'tables.entries', '42 is present 0 times');

    has(problemsOf(passenger((tables) => {
        const copy = tables.entries.find((entry) => entry.roll === '11');
        tables.entries.push({ ...copy });
    })), 'tables.entries', '11 is present 2 times');

    has(problemsOf(passenger((tables) => {
        tables.entries.find((entry) => entry.roll === '11').text = '  ';
    })), 'tables.entries[0].text', 'The text is empty.');

    has(problemsOf(passenger((tables) => {
        const row = tables.entries.find((entry) => entry.sub);
        row.sub.dice = '2d6';
    })), '.sub.dice', 'That dice string is not one the roller reads.');

    has(problemsOf(passenger((tables) => {
        const row = tables.entries.find((entry) => entry.sub && entry.sub.dice === '1D');
        row.sub.outcomes = [{ range: [1, 3], text: 'Only the low half' }];
    })), '.sub.outcomes', '4 is not covered.');

    has(problemsOf(passenger((tables) => {
        tables.dice = '2D';
    })), 'tables.dice', 'Random passengers are rolled on D66.');
});

test('a trade file fails one check at a time, with its path', () => {
    has(problemsOf(trade((tables) => {
        tables.goods.table = tables.goods.table.filter((row) => row.d66 !== '35');
    })), 'tables.goods.table', '35 is present 0 times');

    has(problemsOf(trade((tables) => {
        tables.goods.table[0].basePrice = -1;
    })), 'tables.goods.table[0].basePrice', 'A price or percent is a finite number, 0 or more.');

    has(problemsOf(trade((tables) => {
        tables.goods.table[0].tons = 'a handful';
    })), 'tables.goods.table[0].tons', 'That dice string is not one the roller reads.');

    has(problemsOf(trade((tables) => {
        tables.goods.table[0].purchaseDM.Agricultural = 1.5;
    })), 'tables.goods.table[0].purchaseDM.Agricultural', 'A DM is an integer.');

    has(problemsOf(trade((tables) => {
        tables.fares.rows = tables.fares.rows.filter((row) => row.parsecs !== 3);
    })), 'tables.fares.rows', 'Parsec 3 is missing.');

    has(problemsOf(trade((tables) => {
        const row = tables.passengers.traffic.table.find((band) => band.roll === '10');
        row.roll = '12';
    })), 'tables.passengers.traffic.table', 'overlaps');

    has(problemsOf(trade((tables) => {
        tables.modifiedPrice.rows = tables.modifiedPrice.rows.filter((row) => row.result !== '12');
    })), 'tables.modifiedPrice.rows', 'A gap sits between');

    has(problemsOf(trade((tables) => {
        tables.purchase.roll = 'two dice';
    })), 'tables.purchase.roll', 'That dice string is not one the roller reads.');

    has(problemsOf(trade((tables) => {
        tables.freight.lots[0].tons = 'many';
    })), 'tables.freight.lots[0].tons', 'That dice string is not one the roller reads.');

    has(problemsOf(trade((tables) => {
        tables.supplier.checks[0].time = 'soon';
    })), 'tables.supplier.checks[0].time', 'That dice string is not one the roller reads.');

    has(problemsOf(trade((tables) => {
        tables.modifiedPrice.rows[0].salePercent = -5;
    })), 'tables.modifiedPrice.rows[0].salePercent', 'A price or percent is a finite number, 0 or more.');

    has(problemsOf(trade((tables) => {
        delete tables.passengers;
    })), 'tables.passengers', '');
});

test('an unknown kind is refused', () => {
    const result = validateTableSet(envelope('patrons', {}));
    assert.equal(result.ok, false);
    assert.equal(result.set, null);
    assert.deepEqual(result.problems, [{ path: 'kind', words: 'This app has no roller for that table.' }]);
});

test('a set over 256 KB is refused', () => {
    const set = envelope('randomPassenger', { pad: 'x'.repeat(TABLE_SET_BYTES) });
    const result = validateTableSet(set);
    assert.equal(result.ok, false);
    assert.equal(result.set, null);
    assert.equal(JSON.stringify(set).length > TABLE_SET_BYTES, true);
    assert.deepEqual(result.problems, [{ path: '', words: 'A table set is at most 256 KB.' }]);
});

test('the envelope shape is strict', () => {
    const blank = passenger();
    blank.name = '   ';
    has(problemsOf(blank), 'name', '');
    const missing = passenger();
    delete missing.schemaVersion;
    has(problemsOf(missing), 'schemaVersion', '');
    const extra = passenger();
    extra.note = 'outside the envelope';
    assert.equal(validateTableSet(extra).ok, false);
});
