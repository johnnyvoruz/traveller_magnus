/**
 * Dice at the table (streams/D.md DU8; backlog U8): a roll from a box on the character sheet, Roll
 * again, the strip of the last eight, and the words. Nothing is interpreted (Q6): 2D, the DM the
 * box says, the box's name on the roll.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    clearRolls,
    diceAsk,
    HISTORY,
    makeRoll,
    parseDm,
    recentRolls,
    roll3ddPick,
    rollAgain,
    rollCount,
    rollD3Pick,
    rollD66Pick,
    rollFrom,
    rollLine,
    setMode,
} from '../../apps/web/src/dice/command.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

function facesOf(faces) {
    let i = 0;
    return () => faces[i++];
}

test('a DM is read as the box holds it, and nothing else is a DM', () => {
    assert.equal(parseDm('+1'), 1);
    assert.equal(parseDm(' -2 '), -2);
    assert.equal(parseDm('−3'), -3);
    assert.equal(parseDm('0'), 0);
    assert.equal(parseDm('2'), 2);
    assert.equal(parseDm(''), null);
    assert.equal(parseDm('1/2'), null);
    assert.equal(parseDm('two'), null);
    assert.equal(parseDm('+'), null);
    assert.equal(parseDm(true), null);
    assert.equal(parseDm(undefined), null);
});

test('a roll from a box is 2D with that DM, named after the box, and opens the roller', () => {
    clearRolls();
    diceAsk.count = 3;
    setMode('boon');
    const rolled = rollFrom(' Strength ', 1, facesOf([3, 4]));
    assert.equal(diceAsk.open, true);
    assert.equal(diceAsk.mode, 'plain');
    assert.equal(diceAsk.count, 2);
    assert.equal(diceAsk.dm, 1);
    assert.equal(rolled.total, 7);
    assert.equal(rolled.dm, 1);
    assert.equal(diceAsk.rolls[0].from, 'Strength');
    assert.equal(diceAsk.rolls[0].dice.length, 2);
    // No DM in the box: the roll takes none, and the roller's DM is put back to 0.
    rollFrom('Pilot (spacecraft)', null, facesOf([1, 1]));
    assert.equal(diceAsk.dm, 0);
    assert.equal(diceAsk.rolls[0].dm, 0);
    assert.equal(diceAsk.rolls[0].from, 'Pilot (spacecraft)');
    // Beyond the roller's range: none, the name stays.
    rollFrom('Endurance', 7, facesOf([6, 6]));
    assert.equal(diceAsk.dm, 0);
    assert.equal(diceAsk.rolls[0].dm, 0);
    assert.equal(diceAsk.rolls[0].from, 'Endurance');
    rollFrom('Dexterity', -6, facesOf([6, 6]));
    assert.equal(diceAsk.rolls[0].dm, -6);
    // A roll from the roller has no origin.
    rollCount(1, facesOf([5]));
    assert.equal(diceAsk.rolls[0].from, null);
    clearRolls();
});

test('Roll again throws the last roll once more: the same dice, mode, DM and origin', () => {
    clearRolls();
    assert.equal(rollAgain(), null);
    rollFrom('Strength', 2, facesOf([1, 2]));
    const again = rollAgain(facesOf([6, 5]));
    assert.equal(again.total, 11);
    assert.equal(again.dm, 2);
    assert.equal(diceAsk.rolls[0].from, 'Strength');
    assert.equal(diceAsk.rolls[0].dice.length, 2);
    assert.equal(diceAsk.rolls.length, 2);
    // Boon: three thrown, two kept.
    setMode('boon');
    rollCount(2, facesOf([1, 2, 3]));
    rollAgain(facesOf([6, 6, 1]));
    assert.equal(diceAsk.rolls[0].mode, 'boon');
    assert.equal(diceAsk.rolls[0].total, 12);
    assert.equal(diceAsk.rolls[0].from, null);
    // D66, 3DD, D3 and 2D3 keep their kind.
    rollD66Pick(facesOf([3, 4]));
    rollAgain(facesOf([6, 1]));
    assert.equal(diceAsk.rolls[0].mode, 'd66');
    assert.equal(diceAsk.rolls[0].total, 61);
    roll3ddPick(facesOf([1, 1, 1]));
    rollAgain(facesOf([2, 2, 2]));
    assert.equal(diceAsk.rolls[0].mode, '3dd');
    assert.equal(diceAsk.rolls[0].total, 60);
    rollD3Pick(2, facesOf([1, 6]));
    rollAgain(facesOf([6, 6]));
    assert.equal(diceAsk.rolls[0].mode, '2d3');
    assert.equal(diceAsk.rolls[0].total, 6);
    // 1D plain stays 1D; the picks show it.
    rollCount(1, facesOf([2]));
    rollAgain(facesOf([4]));
    assert.equal(diceAsk.rolls[0].dice.length, 1);
    assert.equal(diceAsk.count, 1);
    assert.equal(diceAsk.mode, 'plain');
    clearRolls();
});

test('the strip is the last eight, newest first, out of the twenty the page keeps', () => {
    clearRolls();
    assert.equal(HISTORY, 8);
    assert.deepEqual(recentRolls(), []);
    for (let n = 1; n <= 12; n++) {
        diceAsk.count = 1;
        makeRoll(() => ((n - 1) % 6) + 1);
    }
    assert.equal(diceAsk.rolls.length, 12);
    const strip = recentRolls();
    assert.equal(strip.length, 8);
    assert.equal(strip[0].id, diceAsk.rolls[0].id);
    assert.equal(strip[0].dice[0], ((12 - 1) % 6) + 1);
    assert.equal(strip[7].dice[0], ((5 - 1) % 6) + 1);
    clearRolls();
});

test('a roll in a few characters', () => {
    assert.equal(rollLine({ mode: 'plain', dice: [3, 4], kept: [true, true], total: 7, dm: 0 }), '2D 7');
    assert.equal(rollLine({ mode: 'plain', dice: [3, 4], kept: [true, true], total: 7, dm: 2 }), '2D+2 = 9');
    assert.equal(rollLine({ mode: 'plain', dice: [3], kept: [true], total: 3, dm: -1 }), '1D−1 = 2');
    assert.equal(rollLine({ mode: 'boon', dice: [3, 4, 1], kept: [true, true, false], total: 7, dm: 0 }), 'Boon 7');
    assert.equal(rollLine({ mode: 'bane', dice: [3, 4, 1], kept: [false, true, true], total: 5, dm: 1 }), 'Bane+1 = 6');
    assert.equal(rollLine({ mode: 'd66', dice: [3, 4], kept: [true, true], total: 34, dm: 0 }), 'D66 34');
    assert.equal(rollLine({ mode: '3dd', dice: [1, 2, 3], kept: [true, true, true], total: 60, dm: 0 }), '3DD 60');
    assert.equal(rollLine({ mode: 'd3', dice: [5], kept: [true], total: 3, dm: 0 }), 'D3 3');
    assert.equal(rollLine({ mode: '2d3', dice: [5, 1], kept: [true, true], total: 4, dm: 0 }), '2D3 4');
});

test('the screens: a die beside every characteristic and skill row, Roll again and the strip in the picks, the card names the box', () => {
    const sheet = read('workspace/CharacterSheet.vue');
    assert.equal((sheet.match(/data-sheet-roll/g) ?? []).length, 5, 'the characteristic row, the skill head, the numbered lines, the added lines, the blank rows');
    assert.match(sheet, /import \{ parseDm, rollFrom \} from '\.\.\/dice\/command\.ts';/);
    assert.match(sheet, /rollFrom\(from, parseDm\(dm\)\)/);
    assert.match(sheet, /@click="roll\(charName\(cell\), held\(cell\.dm\)\)"/);
    assert.match(sheet, /@click="roll\(skillFrom\(skillName\(group\.head\), group\.head\.specialism\), held\(group\.head\.modifier\)\)"/);
    assert.match(sheet, /grid-template-columns: minmax\(0, 1fr\) 54px 62px 24px;/);
    assert.doesNotMatch(sheet, /target number|effect/i);
    const picks = read('dice/DiceButton.vue');
    assert.match(picks, /data-dice-again/);
    assert.match(picks, /@click="rollAgain\(\)"/);
    assert.match(picks, /data-dice-history/);
    assert.match(picks, /@click="rollCount\(count\)"/);
    const roller = read('dice/DiceRoller.vue');
    assert.match(roller, /\{\{ latest\.from \? latest\.from \+ ' · ' : '' \}\}\{\{ formula \|\| title \}\}/);
});

describe('the picks render', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-dice-table-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    test('Roll again waits for a roll; after nine rolls the strip shows eight, the newest first with the box it came from', async () => {
        const command = await server.ssrLoadModule('/src/dice/command.ts');
        const view = (await server.ssrLoadModule('/src/dice/DiceButton.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        command.clearRolls();
        const empty = await renderToString(createSSRApp({ render: () => h(view) }));
        assert.match(empty, /data-dice-again[^>]*disabled/);
        assert.doesNotMatch(empty, /data-dice-history/);
        for (let n = 1; n <= 8; n++) command.rollCount(2, () => 2);
        command.rollFrom('Pilot (spacecraft)', 1, facesOf([3, 4]));
        const full = (await renderToString(createSSRApp({ render: () => h(view) }))).replace(/<!--[\s\S]*?-->/g, '');
        assert.doesNotMatch(full, /data-dice-again[^>]*disabled/);
        assert.equal((full.match(/class="dice-past"/g) ?? []).length, 8);
        assert.match(full, /dice-past-from">Pilot \(spacecraft\)<\/span><span class="dice-past-line">2D\+1 = 8</);
        assert.match(full, /aria-label="Roll again: Pilot \(spacecraft\) · 2D\+1 = 8"/);
        command.clearRolls();
    });
});
