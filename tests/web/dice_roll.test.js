import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chooseMode, clearRolls, closeRoller, diceAsk, makeRoll, offerDice, openRoller, roll3ddPick, rollCount, rollD3Pick, rollD66Pick, rollDefault, setMode, stepDm } from '../../apps/web/src/dice/command.ts';
import { cryptoFace, d3Face, roll3dd, rollD66, rollSix, threeDdLine } from '../../apps/web/src/dice/roll.ts';
import { rankResults } from '../../apps/web/src/search/omni.ts';

function facesOf(faces) {
    let i = 0;
    return () => faces[i++];
}

test('Boon keeps the two highest and Bane the two lowest', () => {
    const boon = rollSix(2, 'boon', facesOf([1, 6, 3]));
    assert.equal(boon.total, 9);
    assert.deepEqual(boon.dice, [1, 6, 3]);
    assert.deepEqual(boon.kept, [false, true, true]);
    const bane = rollSix(2, 'bane', facesOf([1, 6, 3]));
    assert.equal(bane.total, 4);
    assert.deepEqual(bane.kept, [true, false, true]);
    const plain = rollSix(2, 'plain', facesOf([4, 2]));
    assert.deepEqual(plain.dice, [4, 2]);
    assert.deepEqual(plain.kept, [true, true]);
    assert.equal(plain.total, 6);
});

test('the page keeps the last 20 rolls', () => {
    clearRolls();
    let face = 0;
    for (let n = 0; n < 21; n++) {
        diceAsk.count = 1;
        makeRoll(() => (face++ % 6) + 1);
    }
    assert.equal(diceAsk.rolls.length, 20);
    assert.equal(diceAsk.rolls[0].dice[0], (20 % 6) + 1);
    clearRolls();
});

test('a toggle does not roll, and only 2D throws while it is on', () => {
    clearRolls();
    setMode('boon');
    assert.equal(diceAsk.mode, 'boon');
    assert.equal(diceAsk.count, 2);
    assert.equal(diceAsk.rolls.length, 0);
    rollCount(1, facesOf([6]));
    rollCount(3, facesOf([1, 1, 1]));
    assert.equal(diceAsk.rolls.length, 0);
    rollCount(2, facesOf([2, 5, 4]));
    assert.equal(diceAsk.rolls.length, 1);
    assert.equal(diceAsk.rolls[0].dice.length, 3);
    assert.equal(diceAsk.rolls[0].total, 9);
    setMode('bane');
    assert.equal(diceAsk.mode, 'bane');
    assert.equal(diceAsk.rolls.length, 1);
    rollCount(2, facesOf([2, 5, 4]));
    assert.equal(diceAsk.rolls[0].total, 6);
    setMode('bane');
    assert.equal(diceAsk.mode, 'plain');
    const roller = readFileSync(new URL('../../apps/web/src/dice/DiceRoller.vue', import.meta.url), 'utf8');
    assert.match(roller, /opacity: 0\.35/);
    assert.match(roller, /class="card-die"/);
    assert.equal(roller.includes('>{{ face }}'), false);
    clearRolls();
});

test('the palette command is Roll dice, rolls 2D, and yields R while R is taken', () => {
    clearRolls();
    const registered = [];
    offerDice((command) => {
        registered.push(command);
        return () => {};
    }, () => false);
    assert.equal(registered[0].name, 'Roll dice');
    assert.deepEqual(registered[0].keys, ['r']);
    assert.equal(registered[0].runnable(), true);
    registered[0].run();
    assert.equal(diceAsk.open, true);
    assert.equal(diceAsk.rolls[0].dice.length, 2);
    assert.equal(diceAsk.rolls[0].mode, 'plain');
    const listed = registered.map((command) => ({ kind: 'command', name: command.name, detail: 'Command', id: command.id }));
    assert.deepEqual(rankResults('boon', listed).map((row) => row.name), ['Boon']);
    assert.deepEqual(rankResults('bane', listed).map((row) => row.name), ['Bane']);
    const boon = registered.find((command) => command.id === 'dice-boon');
    boon.run();
    assert.equal(diceAsk.mode, 'boon');
    assert.equal(diceAsk.open, true);
    assert.equal(diceAsk.rolls[0].dice.length, 3);
    assert.equal(diceAsk.rolls[0].mode, 'boon');
    const bane = registered.find((command) => command.id === 'dice-bane');
    bane.run();
    assert.equal(diceAsk.mode, 'bane');
    assert.equal(diceAsk.rolls[0].dice.length, 3);
    assert.equal(diceAsk.rolls[0].mode, 'bane');
    chooseMode('boon');
    assert.equal(diceAsk.mode, 'boon');
    chooseMode('boon');
    assert.equal(diceAsk.mode, 'boon');
    closeRoller();
    assert.equal(diceAsk.open, false);
    openRoller();
    assert.equal(diceAsk.open, true);
    const blocked = [];
    offerDice((command) => {
        blocked.push(command);
        return () => {};
    }, () => true);
    assert.equal(blocked[0].runnable(), false);
    const registry = readFileSync(new URL('../../apps/web/src/shell/registry.ts', import.meta.url), 'utf8');
    assert.equal((registry.match(/offerDice\(registerCommand/g) || []).length, 1);
    setMode('boon');
    assert.equal(diceAsk.mode, 'plain');
    rollDefault(facesOf([3, 4]));
    assert.equal(diceAsk.rolls[0].total, 7);
    clearRolls();
});

test('D66 is tens then units, 11 to 66, and never a 0, 7, 8 or 9', () => {
    // assets/dice_conventions.txt lines 29 to 34.
    const seen = new Set();
    for (let tens = 1; tens <= 6; tens++) {
        for (let units = 1; units <= 6; units++) {
            const rolled = rollD66(facesOf([tens, units]));
            assert.deepEqual(rolled.dice, [tens, units]);
            assert.deepEqual(rolled.kept, [true, true]);
            assert.equal(rolled.total, tens * 10 + units);
            assert.equal(rolled.mode, 'd66');
            const text = String(rolled.total);
            assert.equal(text.length, 2);
            for (const digit of text) assert.ok('123456'.includes(digit), text);
            seen.add(rolled.total);
        }
    }
    assert.equal(seen.size, 36);
    clearRolls();
    setMode('boon');
    rollD66Pick(facesOf([3, 4]));
    assert.equal(diceAsk.mode, 'd66');
    assert.equal(diceAsk.rolls[0].total, 34);
    assert.deepEqual(diceAsk.rolls[0].dice, [3, 4]);
    const registered = [];
    offerDice((command) => {
        registered.push(command);
        return () => {};
    });
    const command = registered.find((item) => item.id === 'dice-d66');
    assert.equal(command.name, 'Roll D66');
    clearRolls();
    command.run();
    assert.equal(diceAsk.mode, 'd66');
    assert.equal(diceAsk.open, true);
    assert.equal(diceAsk.rolls[0].dice.length, 2);
    const roller = readFileSync(new URL('../../apps/web/src/dice/DiceRoller.vue', import.meta.url), 'utf8');
    assert.match(roller, /\.dice-total \{[^}]*font-family: var\(--font-data\)/);
    assert.match(roller, /\.dice-total \{[^}]*tabular-nums/);
    assert.match(roller, /aria-label="Close dice"/);
    assert.match(roller, /return 'D66'/);
    clearRolls();
});

test('a DM shifts the total, D3 halves each face, and D66 takes no DM', () => {
    // assets/dice_conventions.txt lines 14 to 18, and 19 to 26.
    assert.equal(d3Face(1), 1);
    assert.equal(d3Face(2), 1);
    assert.equal(d3Face(3), 2);
    assert.equal(d3Face(4), 2);
    assert.equal(d3Face(5), 3);
    assert.equal(d3Face(6), 3);
    clearRolls();
    for (let n = 0; n < 6; n++) stepDm(1);
    assert.equal(diceAsk.dm, 6);
    stepDm(1);
    assert.equal(diceAsk.dm, 6);
    for (let n = 0; n < 12; n++) stepDm(-1);
    assert.equal(diceAsk.dm, -6);
    stepDm(-1);
    assert.equal(diceAsk.dm, -6);
    clearRolls();
    stepDm(1);
    stepDm(1);
    stepDm(1);
    rollCount(2, facesOf([4, 4]));
    assert.equal(diceAsk.rolls[0].total, 8);
    assert.equal(diceAsk.rolls[0].dm, 3);
    assert.equal(diceAsk.rolls[0].total + diceAsk.rolls[0].dm, 11);
    rollD3Pick(1, facesOf([1, 2, 3, 4, 5, 6]));
    assert.equal(diceAsk.rolls[0].mode, 'd3');
    assert.equal(diceAsk.rolls[0].total, 1);
    rollD3Pick(2, facesOf([1, 6]));
    assert.equal(diceAsk.rolls[0].mode, '2d3');
    assert.equal(diceAsk.rolls[0].total, 4);
    assert.equal(diceAsk.rolls[0].dm, 3);
    clearRolls();
    rollD3Pick(2, facesOf([1, 1]));
    assert.equal(diceAsk.rolls[0].total, 2);
    clearRolls();
    rollD3Pick(2, facesOf([6, 6]));
    assert.equal(diceAsk.rolls[0].total, 6);
    diceAsk.dm = 3;
    rollD66Pick(facesOf([3, 4]));
    assert.equal(diceAsk.rolls[0].total, 34);
    assert.equal(diceAsk.rolls[0].dm, 0);
    const registered = [];
    offerDice((command) => {
        registered.push(command);
        return () => {};
    });
    assert.equal(registered.find((item) => item.id === 'dice-d3').name, 'Roll D3');
    assert.equal(registered.find((item) => item.id === 'dice-2d3').name, 'Roll 2D3');
    clearRolls();
});

test('3DD is three dice times ten, and a DM is ignored', () => {
    // Johnny, 2026-10-18 15:54: "3DD - roll 3D and x10 the result".
    const rolled = roll3dd(facesOf([2, 5, 6]));
    assert.deepEqual(rolled.dice, [2, 5, 6]);
    assert.deepEqual(rolled.kept, [true, true, true]);
    assert.equal(rolled.total, 130);
    assert.equal(rolled.dm, 0);
    assert.equal(rolled.mode, '3dd');
    assert.equal(threeDdLine(rolled.dice), '13 × 10 = 130');
    clearRolls();
    stepDm(3);
    assert.equal(diceAsk.dm, 3);
    roll3ddPick(facesOf([2, 5, 6]));
    assert.equal(diceAsk.mode, '3dd');
    assert.equal(diceAsk.rolls[0].total, 130);
    assert.equal(diceAsk.rolls[0].dm, 0);
    const registered = [];
    offerDice((command) => {
        registered.push(command);
        return () => {};
    });
    const command = registered.find((item) => item.id === 'dice-3dd');
    assert.equal(command.name, 'Roll 3DD');
    const button = readFileSync(new URL('../../apps/web/src/dice/DiceButton.vue', import.meta.url), 'utf8');
    assert.match(button, /roll3ddPick\(\)">3DD<\/button>/);
    const roller = readFileSync(new URL('../../apps/web/src/dice/DiceRoller.vue', import.meta.url), 'utf8');
    assert.match(roller, /return '3DD'/);
    assert.match(roller, /threeDdLine/);
    clearRolls();
});

test('cryptoFace stays inside the die', () => {
    for (let n = 0; n < 40; n++) {
        const face = cryptoFace();
        assert.ok(face >= 1 && face <= 6);
    }
});
