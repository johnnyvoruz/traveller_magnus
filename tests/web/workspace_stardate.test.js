/**
 * The campaign date in words (apps/web/src/workspace/stardate.ts): DDD-YYYY, the weekday
 * names of campaign_manager_plan.md §7.9 with day 001 "Holiday", and a date typed back.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { HOLIDAY, parseStardate, sameDay, stardate, WEEKDAYS, weekdayName, withStardate } from '../../apps/web/src/workspace/stardate.ts';

test('day 001 is Holiday; day 002 is Wonday; the seven names repeat to day 365, Senday', () => {
    assert.deepEqual(WEEKDAYS, ['Wonday', 'Tuday', 'Thirday', 'Forday', 'Fiday', 'Sixday', 'Senday']);
    assert.equal(weekdayName(1), HOLIDAY);
    assert.equal(weekdayName(2), 'Wonday');
    assert.equal(weekdayName(8), 'Senday');
    assert.equal(weekdayName(9), 'Wonday');
    assert.equal(weekdayName(365), 'Senday');
    assert.equal(weekdayName(1.7), HOLIDAY, 'the time of day does not change the day');
});

test('a day count is said as DDD-YYYY with its weekday', () => {
    assert.deepEqual(stardate(totalDays(1105, 2)), { year: 1105, day: 2, date: '002-1105', weekday: 'Wonday' });
    assert.deepEqual(stardate(totalDays(1105, 1) + 0.5), { year: 1105, day: 1, date: '001-1105', weekday: 'Holiday' });
    assert.equal(stardate(totalDays(1106, 365)).date, '365-1106');
    assert.equal(stardate(totalDays(12, 9)).date, '009-0012');
    assert.equal(stardate(totalDays(-5, 9)).date, '009--0005');
});

test('a date typed back: forms accepted, the day held to the year, the time of day kept', () => {
    assert.deepEqual(parseStardate('009-1105', 1), { day: 9, year: 1105 });
    assert.deepEqual(parseStardate(' 9 - 1105 ', 1), { day: 9, year: 1105 });
    assert.deepEqual(parseStardate('009/1105', 1), { day: 9, year: 1105 });
    assert.deepEqual(parseStardate('009 1105', 1), { day: 9, year: 1105 });
    assert.deepEqual(parseStardate('120', 1105), { day: 120, year: 1105 }, 'a day alone keeps the year');
    assert.equal(parseStardate('000-1105', 1), null);
    assert.equal(parseStardate('366-1105', 1), null);
    assert.equal(parseStardate('Wonday', 1), null);
    assert.equal(parseStardate('', 1), null);
    const noon = totalDays(1105, 2) + 0.5;
    assert.equal(withStardate(noon, '009-1105'), totalDays(1105, 9) + 0.5);
    assert.equal(withStardate(noon, '001-1106'), totalDays(1106, 1) + 0.5);
    assert.equal(withStardate(noon, 'nonsense'), null);
    assert.equal(sameDay(noon, totalDays(1105, 2)), true);
    assert.equal(sameDay(noon, totalDays(1105, 3)), false);
});
