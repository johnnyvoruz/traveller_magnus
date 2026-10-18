import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { passengerTable, rollPassenger, usePassengerTable } from '../../apps/web/src/campaign/passengers.ts';

function passengerSet(text) {
    const tables = JSON.parse(readFileSync('rules/mgt2e_random_passenger.json', 'utf8'));
    tables.entries.find((entry) => entry.roll === '11').text = text;
    return {
        schemaVersion: 1,
        kind: 'randomPassenger',
        id: 'ts_chosen',
        name: 'Chosen passengers',
        basedOn: 'official:randomPassenger',
        edition: 'MgT2E',
        tables,
    };
}

function facesOf(faces) {
    let i = 0;
    return () => faces[i++];
}

function filesUnder(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) filesUnder(path, out);
        else out.push(path);
    }
    return out;
}

test('every roll from 11 to 66 is reachable and held once', () => {
    const rolls = passengerTable().entries.map((entry) => entry.roll);
    const counts = new Map();
    for (const roll of rolls) counts.set(roll, (counts.get(roll) ?? 0) + 1);
    assert.equal(rolls.length, 36);
    for (let tens = 1; tens <= 6; tens += 1) {
        for (let units = 1; units <= 6; units += 1) {
            const roll = String(tens) + String(units);
            assert.equal(counts.get(roll), 1, roll);
            const result = rollPassenger(facesOf([tens, units, 1, 1, 1]));
            assert.equal(result.roll, roll);
            assert.equal(result.text.length > 0, true);
            assert.equal(result.dice[0], tens);
            assert.equal(result.dice[1], units);
        }
    }
    const sourceHits = filesUnder('apps/web/src').filter((path) => readFileSync(path, 'utf8').includes('mgt2e_random_passenger'));
    assert.deepEqual(sourceHits.map((path) => path.replaceAll('\\', '/')), ['apps/web/src/campaign/passengers.ts']);
    const module = readFileSync('apps/web/src/campaign/passengers.ts', 'utf8');
    assert.equal(module.includes('findings/'), false);
});

test('a sub-roll and a skill use the codes on the entry', () => {
    const tourist = rollPassenger(facesOf([2, 2, 4]));
    assert.equal(tourist.roll, '22');
    assert.equal(tourist.subText, 'Charming');
    assert.deepEqual(tourist.dice, [2, 2, 4]);
    const trouble = rollPassenger(facesOf([3, 4, 6]));
    assert.equal(trouble.roll, '34');
    assert.equal(trouble.subText, 'Insane');
    const engineer = rollPassenger(facesOf([3, 6, 2, 1]));
    assert.equal(engineer.roll, '36');
    assert.deepEqual(engineer.skills, [
        { name: 'Mechanic', level: 1 },
        { name: 'Engineer', level: 0 },
    ]);
    assert.deepEqual(engineer.dice, [3, 6, 2, 1]);
    const gambler = rollPassenger(facesOf([5, 1, 1]));
    assert.deepEqual(gambler.skills, [{ name: 'Gambler', level: 0 }]);
    const plain = rollPassenger(facesOf([1, 1]));
    assert.equal(plain.roll, '11');
    assert.equal(plain.subText, undefined);
    assert.equal(plain.skills, undefined);
    assert.deepEqual(plain.dice, [1, 1]);
});

test('a chosen table replaces the published one', () => {
    const published = passengerTable();
    usePassengerTable({
        dice: 'D66',
        entries: [{ roll: '11', text: 'A stand-in' }],
    });
    try {
        assert.equal(rollPassenger(facesOf([1, 1])).text, 'A stand-in');
        assert.equal(rollPassenger(facesOf([1, 2])), null);
        usePassengerTable({ dice: 'other', entries: published.entries });
        assert.equal(rollPassenger(facesOf([1, 1])), null);
    } finally {
        usePassengerTable(published);
    }
    assert.equal(rollPassenger(facesOf([6, 6])).roll, '66');
});

test('the roller reads the official file unless a chosen set passes', () => {
    const published = passengerTable();
    const officialText = rollPassenger(facesOf([1, 1])).text;
    usePassengerTable(null);
    assert.equal(rollPassenger(facesOf([1, 1])).text, officialText);
    usePassengerTable(passengerSet('A chosen passenger'));
    try {
        assert.equal(rollPassenger(facesOf([1, 1])).text, 'A chosen passenger');
        assert.equal(rollPassenger(facesOf([6, 6])).roll, '66');
        const broken = passengerSet('A chosen passenger');
        broken.tables.entries = broken.tables.entries.filter((entry) => entry.roll !== '66');
        usePassengerTable(broken);
        assert.equal(rollPassenger(facesOf([1, 1])).text, officialText);
        usePassengerTable({ ...passengerSet('A chosen passenger'), kind: 'patrons' });
        assert.equal(rollPassenger(facesOf([1, 1])).text, officialText);
    } finally {
        usePassengerTable(published);
    }
});

test('a table passed to one roll does not replace the installed table', () => {
    const published = passengerTable();
    const officialText = rollPassenger(facesOf([1, 1])).text;
    const standIn = { dice: 'D66', entries: [{ roll: '11', text: 'Passed for this roll' }] };
    assert.equal(rollPassenger(standIn, facesOf([1, 1])).text, 'Passed for this roll');
    assert.equal(rollPassenger(standIn, facesOf([1, 2])), null);
    assert.equal(rollPassenger(facesOf([1, 1])).text, officialText);
    assert.equal(passengerTable(), published);
});
