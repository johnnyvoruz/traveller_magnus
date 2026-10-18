/**
 * setFor (findings/trade_tables_design.md §9.3). A kind left out is the official
 * set. A named set that cannot be read falls back, and says so.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setFor } from '../../apps/web/src/campaign/table_sets.ts';

function envelope(kind, tables, id = `official:${kind}`) {
    return {
        schemaVersion: 1,
        kind,
        id,
        name: kind === 'trade' ? 'Official trade' : 'Official passengers',
        basedOn: null,
        edition: 'MgT2E',
        tables,
    };
}

const passengers = JSON.parse(readFileSync('rules/mgt2e_random_passenger.json', 'utf8'));
const trade = JSON.parse(readFileSync('rules/mgt2e_trade.json', 'utf8'));
const officials = {
    randomPassenger: envelope('randomPassenger', passengers),
    trade: envelope('trade', trade),
};

function chosenPassenger(text) {
    const tables = structuredClone(passengers);
    tables.entries.find((entry) => entry.roll === '11').text = text;
    return envelope('randomPassenger', tables, 'ts_house');
}

test('a kind left out is the official set and says nothing', () => {
    const resolved = setFor('randomPassenger', { tableSets: { trade: 'official:trade' } }, [], officials);
    assert.equal(resolved.fellBack, false);
    assert.equal(resolved.words, null);
    assert.equal(resolved.set.id, 'official:randomPassenger');
    assert.equal(resolved.set.tables.entries.length, 36);
});

test('the official id and a matching own id are that set', () => {
    const named = setFor('trade', { tableSets: { trade: 'official:trade' } }, [], officials);
    assert.equal(named.set.id, 'official:trade');
    assert.equal(named.words, null);
    const house = chosenPassenger('House passenger');
    const own = setFor('randomPassenger', { tableSets: { randomPassenger: 'ts_house' } }, [house], officials);
    assert.equal(own.fellBack, false);
    assert.equal(own.words, null);
    assert.equal(own.set.tables.entries.find((entry) => entry.roll === '11').text, 'House passenger');
});

test('a missing, wrong-kind, or broken set falls back to the official file', () => {
    const missing = setFor('randomPassenger', { tableSets: { randomPassenger: 'ts_gone' } }, [], officials);
    assert.equal(missing.fellBack, true);
    assert.equal(missing.set.id, 'official:randomPassenger');
    assert.equal(missing.words, "This campaign's randomPassenger table could not be read; using the official table.");

    const house = chosenPassenger('House passenger');
    house.kind = 'trade';
    const wrong = setFor('randomPassenger', { tableSets: { randomPassenger: 'ts_house' } }, [house], officials);
    assert.equal(wrong.fellBack, true);
    assert.equal(wrong.set.id, 'official:randomPassenger');

    const broken = chosenPassenger('House passenger');
    broken.tables.entries = broken.tables.entries.filter((entry) => entry.roll !== '66');
    const failed = setFor('randomPassenger', { tableSets: { randomPassenger: 'ts_house' } }, [broken], officials);
    assert.equal(failed.fellBack, true);
    assert.equal(failed.set.tables.entries.find((entry) => entry.roll === '66').text.length > 0, true);
    assert.equal(failed.words.includes('using the official table'), true);
});

test('a kind with no roller is refused', () => {
    const resolved = setFor('patrons', { tableSets: { patrons: 'ts_patrons' } }, [], officials);
    assert.equal(resolved.set, null);
    assert.equal(resolved.fellBack, true);
    assert.equal(resolved.words, 'This app has no roller for that table.');
});
