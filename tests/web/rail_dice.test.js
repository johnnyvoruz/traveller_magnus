/**
 * AD1: Dice is a rail item on every route that mounts the rail. The popover
 * mounts DiceButton, whose count buttons call rollCount. The campaign panel
 * no longer has that button. Palette Roll dice is unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clearRolls, diceAsk, offerDice, rollCount } from '../../apps/web/src/dice/command.ts';

const root = new URL('../../apps/web/src/', import.meta.url);

function text(path) {
    return readFileSync(new URL(path, root), 'utf8');
}

test('the Dice rail item is on every route that mounts the rail, and the campaign panel has none', () => {
    const rail = text('shell/Rail.vue');
    const diceAt = rail.indexOf('aria-label="Dice"');
    const marketAt = rail.indexOf('aria-label="Marketplace"');
    assert.ok(diceAt > 0 && marketAt > diceAt);
    assert.match(rail, /class="dice-rail-pop"/);
    assert.match(rail, /<DiceButton \/>/);
    assert.match(rail, /aria-label="Close dice"/);
    assert.match(rail, /class="ui-btn is-icon dice-rail-x"/);
    assert.match(rail, /@media \(max-width: 390px\)/);
    assert.match(rail, /name="dice"/);
    const mounts = [
        'views/MapView.vue',
        'views/OrbitView.vue',
        'workspace/market/PackagesView.vue',
        'views/DesignView.vue',
    ];
    for (const file of mounts) assert.match(text(file), /<Rail[\s>]/, file);
    assert.equal(text('workspace/CampaignPanel.vue').includes('DiceButton'), false);
    assert.match(text('dice/DiceButton.vue'), /@click="rollCount\(count\)"/);
    assert.match(text('design/Icon.vue'), /name === 'dice'/);
});

test('the popover picks roll 2D, and the palette still owns Roll dice', () => {
    clearRolls();
    rollCount(2, () => 4);
    assert.equal(diceAsk.rolls.length, 1);
    assert.equal(diceAsk.rolls[0].dice.length, 2);
    assert.equal(diceAsk.rolls[0].total, 8);
    const registered = [];
    offerDice((command) => {
        registered.push(command);
        return () => {};
    }, () => false);
    assert.equal(registered[0].name, 'Roll dice');
    assert.deepEqual(registered[0].keys, ['r']);
    clearRolls();
});
