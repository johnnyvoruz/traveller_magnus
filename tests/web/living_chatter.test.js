/**
 * Selection (spec section 1.5): one sequence for a system and a day, no repeat
 * until every eligible line has been heard, the party places, and a day change
 * that re-seeds without moving the cursor.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashString, mulberry32 } from '@voyage/shared';
import { clearSequence, eligible, nextLine, sequenceCursor, sequenceFor } from '../../apps/web/src/living/chatter.ts';
import { sampleLines } from '../../apps/web/src/living/lines.ts';

const HEX = 'Spinward_Marches/1910';
const VERSION = 'truth-1';

function facts(over = {}) {
    return {
        hexKey: HEX, name: 'Regina', sector: 'Spinward Marches', subsector: 'Regina',
        starport: 'A', size: 7, atm: 8, hydro: 8, pop: 9, gov: 8, law: 9, tl: 12,
        tradeCodes: ['Hi', 'Ri'], zone: 'green', bases: 'NS', highport: true,
        gasGiants: 1, belts: 1, moons: 1, otherBodies: 2, xboat: true,
        party: 'away', day: 2, bodies: { gasGiant: 'Assiniboia', belt: 'Belt', moon: 'Lune', body: 'Orbit' },
        ...over,
    };
}

function ids(day, place) {
    return sequenceFor(HEX, VERSION, day, sampleLines(), facts({ party: place, day })).map((line) => line.id);
}

test('the same system on the same day hears the same sequence', () => {
    const lines = sampleLines();
    const here = facts();
    const first = sequenceFor(HEX, VERSION, 2, lines, here).map((line) => line.id);
    const second = sequenceFor(HEX, VERSION, 2, lines, here).map((line) => line.id);
    assert.deepEqual(first, second);
    assert.ok(first.length > 0);
    const ranked = lines.filter((line) => eligible(line, here)).map((line) => {
        const draw = mulberry32(hashString(HEX + '|' + VERSION + '|' + 2 + '|' + line.id))();
        return { id: line.id, key: draw / (line.weight === undefined ? 1 : line.weight) };
    }).sort((a, b) => a.key - b.key);
    assert.deepEqual(first, ranked.map((row) => row.id));
});

test('a line is not heard twice until every eligible line has been heard', () => {
    clearSequence(HEX);
    const sequence = sequenceFor(HEX, VERSION, 2, sampleLines(), facts());
    const heard = [];
    for (let i = 0; i < sequence.length; i += 1) heard.push(nextLine(HEX, sequence).id);
    assert.equal(new Set(heard).size, sequence.length);
    assert.deepEqual(heard, sequence.map((line) => line.id));
    assert.equal(nextLine(HEX, sequence).id, sequence[0].id);
    clearSequence(HEX);
    assert.equal(sequenceCursor(HEX), 0);
    assert.equal(nextLine(HEX, sequence).id, sequence[0].id);
    assert.equal(nextLine(HEX, []), null);
    assert.equal(sequenceCursor(HEX), 1);
});

test('the party places keep the lines written for them', () => {
    const lines = sampleLines();
    const away = ids(2, 'away');
    const docked = ids(2, 'docked');
    const aboard = ids(2, 'inSystem');
    const jumping = ids(2, 'inJump');
    assert.equal(away.includes('ship-005'), false);
    assert.equal(away.includes('ship-008'), false);
    assert.equal(away.includes('ship-011'), false);
    assert.equal(docked.includes('ship-005'), true);
    assert.equal(docked.includes('ship-008'), false);
    assert.equal(aboard.includes('ship-005'), true);
    assert.equal(aboard.includes('ship-008'), false);
    assert.equal(jumping.includes('ship-005'), true);
    assert.equal(jumping.includes('ship-008'), true);
    assert.equal(jumping.includes('ship-011'), true);
    const jumpFacts = facts({ party: 'inJump' });
    assert.equal(eligible(lines.find((line) => line.id === 'ship-008'), jumpFacts), true);
    assert.equal(eligible(lines.find((line) => line.id === 'ship-008'), facts()), false);
});

test('a new day re-seeds the sequence and keeps the cursor', () => {
    clearSequence(HEX);
    const day2 = sequenceFor(HEX, VERSION, 2, sampleLines(), facts({ day: 2 }));
    const day3 = sequenceFor(HEX, VERSION, 3, sampleLines(), facts({ day: 3 }));
    assert.notDeepEqual(day2.map((line) => line.id), day3.map((line) => line.id));
    assert.equal(nextLine(HEX, day2).id, day2[0].id);
    assert.equal(sequenceCursor(HEX), 1);
    assert.equal(nextLine(HEX, day3).id, day3[1].id);
    assert.equal(sequenceCursor(HEX), 2);
    clearSequence(HEX);
});
