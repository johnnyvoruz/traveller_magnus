/**
 * DT8: a jump offers its fuel, the referee approves. The hull from the sheet's Size box, the tons from the
 * file's rule (rules/mgt2e_space_travel.json jump.fuelHullFractionPerParsec through campaign/travel.ts), the
 * words beside the leg, the line the press posts and its once-per-jump check, the latest jump of a track,
 * and the strip's estimate with the hull in place of the assumption. The Track block and the orbit view are pinned.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ASSUMED_HULL_TONS, jumpFuelTons } from '../../apps/web/src/campaign/travel.ts';
import { jumpEstimateWords } from '../../apps/web/src/orbit/estimates.ts';
import {
    HULL_FIELD, NO_FUEL_ABOARD, NO_HULL, fuelTaken, fuelTakenLine, fuelTakenMemo, fuelTakenWords, hullTonsOf, jumpFuelOf, jumpFuelWords, latestJump,
} from '../../apps/web/src/workspace/jump_fuel.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(here, '../../rules/mgt2e_space_travel.json'), 'utf8'));

test('the hull is the sheet\'s Size box (Johnny 143), the first number in it', () => {
    assert.equal(HULL_FIELD, 'Size');
    assert.equal(hullTonsOf({ Size: '200' }), 200);
    assert.equal(hullTonsOf({ Size: '1,000 tons' }), 1000);
    assert.equal(hullTonsOf({ Size: ' 400 dT ' }), 400);
    assert.equal(hullTonsOf({ Size: '0' }), null);
    assert.equal(hullTonsOf({ Size: 'large' }), null);
    assert.equal(hullTonsOf({ Size: '' }), null);
    assert.equal(hullTonsOf({}), null);
    assert.equal(hullTonsOf(null), null);
});

test('the tons are the file\'s rule on the hull and the parsecs, never a number of their own', () => {
    const fraction = rules.jump.fuelHullFractionPerParsec;
    assert.equal(typeof fraction, 'number');
    const one = jumpFuelOf(200, 1);
    assert.deepEqual(one, { tons: fraction * 200 * 1, parsecs: 1, hullTons: 200 });
    assert.equal(one.tons, jumpFuelTons(200, 1));
    const two = jumpFuelOf(400, 2);
    assert.equal(two.tons, jumpFuelTons(400, 2));
    assert.equal(two.parsecs, 2);
    const zero = jumpFuelOf(200, 0);
    assert.equal(zero.parsecs, rules.jump.minimumParsecsCounted, 'the file\'s minimum is counted');
    assert.equal(zero.tons, jumpFuelTons(200, 0));
    assert.equal(jumpFuelOf(null, 1), null, 'no hull, no figure');
    assert.equal(jumpFuelOf(200, null), null, 'no distance, no figure');
});

test('the words: of the tanks, not enough, or the tanks not written', () => {
    const fuel = jumpFuelOf(100, 1);
    assert.equal(jumpFuelWords(fuel, 41), 'Jump fuel: ' + (fuel.tons >= 10 ? String(fuel.tons) : fuel.tons) + ' t of 41 t aboard');
    assert.equal(jumpFuelWords(jumpFuelOf(500, 1), 41), 'Jump fuel: 50 t of 41 t aboard: not enough');
    assert.equal(jumpFuelWords(fuel, null), 'Jump fuel: 10 t. ' + NO_FUEL_ABOARD);
    assert.equal(NO_HULL, 'Write the hull tonnage in the ship sheet’s Size box for the jump fuel.');
});

test('the line the press posts, found again on its day, and the words once posted', () => {
    const fuel = jumpFuelOf(100, 1);
    const when = { year: 1105, day: 21 };
    assert.equal(fuelTakenMemo('Ruie', fuel), 'Fuel: jump to Ruie, 1 parsec, −10 t');
    assert.equal(fuelTakenMemo('Efate', jumpFuelOf(200, 2)), 'Fuel: jump to Efate, 2 parsecs, −40 t');
    const line = fuelTakenLine(when, 'Ruie', fuel);
    assert.deepEqual(line, { when, amount: 0, memo: 'Fuel: jump to Ruie, 1 parsec, −10 t', kind: 'expense' });
    const lines = [{ when: { year: 1105, day: 20 }, amount: -1000, memo: 'Refuel', kind: 'expense' }, line];
    assert.equal(fuelTaken(lines, when, line.memo), line);
    assert.equal(fuelTaken(lines, { year: 1105, day: 22 }, line.memo), null, 'another day is another jump');
    assert.equal(fuelTaken(lines, when, 'Fuel: jump to Efate, 1 parsec, −10 t'), null);
    assert.equal(fuelTakenWords(line), 'Taken: −10 t on 021-1105');
});

test('the latest jump of a track', () => {
    const leg = (mode, n) => ({ mode, from: { kind: 'system', hexKey: 'S/0101' }, to: { kind: 'system', hexKey: 'S/0102' }, departs: n, arrives: n + 1 });
    assert.equal(latestJump([]), null);
    assert.equal(latestJump([leg('flight', 1), leg('docked', 3)]), null);
    const legs = [leg('jump', 1), leg('flight', 3), leg('jump', 5), leg('flight', 7)];
    assert.deepEqual(latestJump(legs), { leg: legs[2], n: 3 });
});

test('the strip\'s estimate reads the hull when the sheet has one, and the assumption when not', () => {
    assert.equal(jumpEstimateWords(1), '1 parsec · about ' + jumpFuelTons(ASSUMED_HULL_TONS, 1) + ' tons · ' + ASSUMED_HULL_TONS + '-ton hull assumed');
    assert.equal(jumpEstimateWords(1, null), jumpEstimateWords(1));
    assert.equal(jumpEstimateWords(1, 200), '1 parsec · ' + jumpFuelTons(200, 1) + ' tons of jump fuel · 200-ton hull');
    assert.equal(jumpEstimateWords(2, 400), '2 parsecs · ' + jumpFuelTons(400, 2) + ' tons of jump fuel · 400-ton hull');
});

test('pins: the Track block offers the fuel on the latest jump once, posts it against the tanks, and the orbit view hands the hull to the strip', () => {
    const block = src('workspace/TrackBlock.vue');
    assert.match(block, /const hull = computed\(\(\) => \(record\.value \? hullTonsOf\(fieldsOf\(record\.value\.sheet\)\) : null\)\);/);
    assert.match(block, /latestJump\(/);
    assert.match(block, /parsecsBetween\(/, 'the leg\'s parsecs from the chart');
    assert.match(block, /data-jump-fuel/);
    assert.match(block, /data-take-fuel/);
    assert.match(block, /data-jump-fuel-taken/);
    assert.match(block, /fuelTons: Math\.max\(0, aboard\.value - fuel\.tons\)/, 'the tanks less the tons, never below zero');
    assert.match(block, /const line = fuelTakenLine\(when, legDestination\.value, fuel\);[\s\S]*?postLedger\(ledgerOf\(now\), line\)/, 'the line the referee can remove');
    assert.match(block, /if \(!now \|\| props\.readOnly \|\| !fuel \|\| aboard\.value === null \|\| taken\.value\) return;/, 'nothing without the press, the tanks or once taken');
    assert.match(block, /data-jump-fuel-plan/, 'the fuel named before the jump is written (DT7\'s block)');
    assert.doesNotMatch(block, /#[0-9a-f]{3,6}\b/i, 'tokens only');
    assert.doesNotMatch(block, /\bwindow\.|\bdocument\./);
    const orbit = src('views/OrbitView.vue');
    assert.match(orbit, /jumpEstimateWords\(jumpParsecs\.value, shipRecord\.value \? hullTonsOf\(fieldsOf\(shipRecord\.value\.sheet\)\) : null\)/);
});
