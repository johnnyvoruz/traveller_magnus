import assert from 'node:assert/strict';
import { test } from 'node:test';
import rules from '../../packages/engines/src/generated/rules/mgt2e_space_travel.js';
import {
    ASSUMED_HULL_TONS,
    MANOEUVRE_DRIVE_USES_FUEL,
    jumpFuelTons,
    jumpParsecsCounted,
    reactionFuelTons,
    rollJumpHours,
    transitSeconds,
} from '../../apps/web/src/campaign/travel.ts';

/** How many of the row's unit fit in a second. The table prints in that unit. */
const PER_SECOND = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };

/**
 * Cells where the formula, rounded to the printed precision, is not the table.
 * The book calls the table a summary. The formula is not bent to meet it.
 * formula is the formula's value in the row's unit, at two decimal places.
 */
const FORMULA_DIFFERS = [
    { distanceKm: 1000, g: 1, unit: 'seconds', table: 633, formula: 632.46 },
    { distanceKm: 100000, g: 2, unit: 'minutes', table: 74, formula: 74.54 },
    { distanceKm: 100000, g: 6, unit: 'minutes', table: 42, formula: 43.03 },
    { distanceKm: 300000, g: 6, unit: 'minutes', table: 74, formula: 74.54 },
    { distanceKm: 400000, g: 4, unit: 'minutes', table: 106, formula: 105.41 },
    { distanceKm: 30000000, g: 1, unit: 'hours', table: 30.42, formula: 30.43 },
    { distanceKm: 30000000, g: 3, unit: 'hours', table: 17.5, formula: 17.57 },
    { distanceKm: 150000000, g: 3, unit: 'hours', table: 39.2, formula: 39.28 },
    { distanceKm: 150000000, g: 5, unit: 'hours', table: 30.3, formula: 30.43 },
    { distanceKm: 900000000, g: 4, unit: 'hours', table: 83.4, formula: 83.33 },
    { distanceKm: 1000000000, g: 6, unit: 'days', table: 2.9, formula: 2.99 },
];

function decimals(value) {
    const text = String(value);
    const dot = text.indexOf('.');
    return dot < 0 ? 0 : text.length - dot - 1;
}

function roundTo(value, places) {
    const scale = 10 ** places;
    return Math.round(value * scale) / scale;
}

function inUnit(distanceKm, g, unit) {
    return transitSeconds(distanceKm, g) / PER_SECOND[unit];
}

function cellKey(distanceKm, g) {
    return distanceKm + ':' + g;
}

test('transit time is the formula, and refuses a distance or G that is not finite and positive', () => {
    assert.equal(transitSeconds(10000, 1), 2000);
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(() => transitSeconds(value, 1));
        assert.throws(() => transitSeconds(1, value));
    }
});

test('a jump counts at least the minimum number of parsecs', () => {
    const minimum = rules.jump.minimumParsecsCounted;
    assert.equal(jumpParsecsCounted(0), minimum);
    assert.equal(jumpParsecsCounted(minimum / 2), minimum);
    assert.equal(jumpParsecsCounted(minimum), minimum);
    assert.equal(jumpParsecsCounted(minimum + 1.5), minimum + 1.5);
});

test('jump fuel is the hull fraction times the hull times the counted parsecs', () => {
    const fraction = rules.jump.fuelHullFractionPerParsec;
    assert.equal(ASSUMED_HULL_TONS, 100);
    assert.equal(jumpFuelTons(ASSUMED_HULL_TONS, 2), ASSUMED_HULL_TONS * fraction * 2);
    const below = rules.jump.minimumParsecsCounted / 2;
    assert.equal(
        jumpFuelTons(ASSUMED_HULL_TONS, below),
        ASSUMED_HULL_TONS * fraction * rules.jump.minimumParsecsCounted,
    );
});

test('reaction fuel is the hull fraction per thrust per hour, and a manoeuvre drive burns none', () => {
    const fraction = rules.manoeuvre.reactionDriveHullFractionPerThrustPerHour;
    assert.equal(MANOEUVRE_DRIVE_USES_FUEL, rules.manoeuvre.manoeuvreDriveFuel !== 'none');
    assert.equal(MANOEUVRE_DRIVE_USES_FUEL, false);
    assert.equal(fraction * 4, 0.1);
    assert.equal(reactionFuelTons(200, 4, 1), 200 * 0.1);
    assert.equal(reactionFuelTons(ASSUMED_HULL_TONS, 2, 10), ASSUMED_HULL_TONS * fraction * 2 * 10);
    assert.equal(reactionFuelTons(ASSUMED_HULL_TONS, 2, 0), 0);
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(() => reactionFuelTons(value, 1, 1));
        assert.throws(() => reactionFuelTons(1, value, 1));
        assert.throws(() => reactionFuelTons(1, 1, value));
    }
});

test('a jump roll is the base hours plus the faces from the supplied source', () => {
    const draws = [0, 0.1, 0.2, 0.5, 0.9, 0.999999];
    let index = 0;
    const rolled = rollJumpHours(() => draws[index++]);
    assert.deepEqual(rolled.dice, [1, 1, 2, 4, 6, 6]);
    assert.equal(rolled.dice.length, rules.jump.durationHours.dice);
    const faces = rolled.dice.reduce((sum, face) => sum + face, 0);
    assert.equal(rolled.hours, rules.jump.durationHours.base + faces);
    assert.equal(index, draws.length);
});

test('every transitTimes cell matches the formula at the printed precision, except the known eleven', () => {
    const known = new Map(FORMULA_DIFFERS.map((cell) => [cellKey(cell.distanceKm, cell.g), cell]));
    assert.equal(known.size, FORMULA_DIFFERS.length);
    assert.equal(FORMULA_DIFFERS.length, 11);
    const found = [];
    for (const row of rules.transitTimes.rows) {
        rules.transitTimes.columnsG.forEach((g, index) => {
            const table = row.times[index];
            const value = inUnit(row.distanceKm, g, row.unit);
            const rounded = roundTo(value, decimals(table));
            const listed = known.get(cellKey(row.distanceKm, g));
            if (rounded === table) {
                assert.equal(listed, undefined, row.distanceKm + ' km at ' + g + 'G matches and is not a known difference');
                return;
            }
            assert.ok(listed, row.distanceKm + ' km at ' + g + 'G differs and is not in the known list');
            assert.equal(listed.unit, row.unit);
            assert.equal(listed.table, table);
            assert.equal(Number(value.toFixed(2)), listed.formula);
            found.push(listed);
        });
    }
    assert.equal(found.length, FORMULA_DIFFERS.length);
    assert.deepEqual(found, FORMULA_DIFFERS);
});
