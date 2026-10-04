/**
 * The orbit view's clock (apps/web/src/orbit/clock.ts). Expected values are computed from the
 * formulas findings/legacy_orbit_inventory.md §3 records, not typed from memory.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    advance, clockText, dateText, DAY_SECONDS, DEFAULT_START, DISPLAY_YEAR_DAYS, elapsedOrbitYears,
    FASTEST, formatLinkDate, HOUR, isRealTime, ORBIT_YEAR_DAYS, parseLinkDate, REAL_TIME,
    scrubbed, secondsOfDay, SHUTTLE_DEFAULT_LIMIT, SHUTTLE_LIMITS, shuttleRate, shuttleText,
    skipHours, sliderFromSpeed, SPEED_SLIDER_MAX, speedFactorText, speedFromSlider, speedText,
    splitDays, START_HELP, startDays, TICK_CAP_SECONDS, tickRate, timeFieldValue, totalDays, withDay,
    withTime, withYear,
} from '../../apps/web/src/orbit/clock.ts';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' is not ' + b);

test('a date is a count of days: 365-day display years, days from 1', () => {
    assert.equal(DISPLAY_YEAR_DAYS, 365);
    assert.equal(totalDays(0, 1), 0);
    assert.equal(totalDays(1105, 1), 1105 * 365);
    assert.equal(totalDays(1105, 203), 1105 * 365 + 202);
    assert.deepEqual(splitDays(0), { year: 0, day: 1 });
    assert.deepEqual(splitDays(1105 * 365 + 202), { year: 1105, day: 203 });
    // The day is a float in [1, 366): the last instant of a year is still that year.
    const last = splitDays(365 - 1 / DAY_SECONDS);
    assert.equal(last.year, 0);
    assert.ok(last.day >= 365 && last.day < 366);
    assert.deepEqual(splitDays(365), { year: 1, day: 1 });
    // Before day 0 the year is negative and the day still runs 1..365.
    assert.deepEqual(splitDays(-1), { year: -1, day: 365 });
    for (const days of [0, 12.25, 364.999, 365, 403325.5, -400.75]) {
        const { year, day } = splitDays(days);
        close(totalDays(year, day), days);
        assert.ok(day >= 1 && day < 366);
    }
});

test('the clock text is HH:MM:SS and wraps at a day', () => {
    assert.equal(clockText(0), '00:00:00');
    assert.equal(clockText(3 * 3600 + 4 * 60 + 5), '03:04:05');
    assert.equal(clockText(DAY_SECONDS - 1), '23:59:59');
    assert.equal(clockText(DAY_SECONDS), '00:00:00');
    assert.equal(clockText(DAY_SECONDS + 61), '00:01:01');
    // A value a hair under a whole second reads as that second (the legacy 1e-5 nudge).
    assert.equal(clockText(59.999995), '00:01:00');
    close(secondsOfDay(10.5), DAY_SECONDS / 2);
    close(secondsOfDay(-0.25), DAY_SECONDS * 0.75);
    assert.equal(timeFieldValue(10.5), '12:00:00');
});

test('the date text is Year, Day and time, as the legacy readout', () => {
    assert.equal(dateText(0), 'Year 0 · Day 1 · 00:00:00');
    assert.equal(dateText(totalDays(1105, 203) + 0.5), 'Year 1,105 · Day 203 · 12:00:00');
    assert.equal(dateText(totalDays(3, 365) + (3600 + 61) / DAY_SECONDS), 'Year 3 · Day 365 · 01:01:01');
});

test('orbital motion counts 365.25-day years, unlike the date on screen', () => {
    assert.equal(ORBIT_YEAR_DAYS, 365.25);
    assert.equal(elapsedOrbitYears(365.25), 1);
    close(elapsedOrbitYears(totalDays(1, 1)), 365 / 365.25);
});

test('the speed slider runs from real time to a year a second on a log scale', () => {
    assert.equal(REAL_TIME, 1 / DAY_SECONDS);
    close(speedFromSlider(0), REAL_TIME);
    close(speedFromSlider(SPEED_SLIDER_MAX), FASTEST);
    // Halfway is the geometric mean.
    close(speedFromSlider(SPEED_SLIDER_MAX / 2), Math.sqrt(REAL_TIME * FASTEST));
    for (const value of [0, 137, 500, 999, 1000]) close(sliderFromSpeed(speedFromSlider(value)), value, 1e-6);
    assert.equal(isRealTime(REAL_TIME), true);
    assert.equal(isRealTime(1.5 / DAY_SECONDS), false);
});

test('the speed readout picks its unit as the legacy formatter does', () => {
    assert.equal(speedText(REAL_TIME), 'Real time');
    assert.equal(speedText(1.4 / DAY_SECONDS), 'Real time');
    assert.equal(speedText(30 / DAY_SECONDS), '30 s/s');
    assert.equal(speedText(90 / DAY_SECONDS), '1.5 min/s');
    assert.equal(speedText(1200 / DAY_SECONDS), '20 min/s');
    assert.equal(speedText(2 * 3600 / DAY_SECONDS), '2 h/s');
    assert.equal(speedText(12 * 3600 / DAY_SECONDS), '12 h/s');
    assert.equal(speedText(2.5), '2.5 d/s');
    assert.equal(speedText(200), '200 d/s');
    assert.equal(speedText(364.5), '1 yr/s');
    assert.equal(speedText(FASTEST), '1 yr/s');
    assert.equal(speedFactorText(REAL_TIME), '1× real time');
    assert.equal(speedFactorText(1), '86,400× real time');
});

test('the shuttle is a cubic of the slider times its limit', () => {
    assert.deepEqual([...SHUTTLE_LIMITS], [1, 10, 365, 3650]);
    assert.equal(SHUTTLE_DEFAULT_LIMIT, 365);
    assert.equal(shuttleRate(0, 365), 0);
    assert.equal(shuttleRate(100, 365), 365);
    assert.equal(shuttleRate(-100, 3650), -3650);
    close(shuttleRate(50, 365), Math.pow(0.5, 3) * 365);
    close(shuttleRate(-50, 10), -Math.pow(0.5, 3) * 10);
    assert.equal(shuttleText(0), 'Stopped');
    assert.equal(shuttleText(45.625), '45.63 d/s');
    assert.equal(shuttleText(-365), '-365 d/s');
});

test('a tick moves the clock by rate times real seconds, never more than a quarter second of them', () => {
    assert.equal(TICK_CAP_SECONDS, 0.25);
    // Playing at real time: 16 ms of real time is 16 ms of game time.
    close(advance(100, 16, REAL_TIME), 100 + 0.016 / DAY_SECONDS);
    // A long frame (a background tab) is capped.
    close(advance(100, 5000, 1), 100 + 0.25);
    close(advance(100, 250, 365), 100 + 0.25 * 365);
    // Reverse shuttle runs backwards.
    close(advance(100, 100, -10), 100 - 1);
    assert.equal(advance(100, 16, 0), 100);
    // The shuttle wins over the running speed; a paused clock with no shuttle does not move.
    assert.equal(tickRate(false, REAL_TIME, 0), REAL_TIME);
    assert.equal(tickRate(true, REAL_TIME, 0), 0);
    assert.equal(tickRate(true, REAL_TIME, -45), -45);
    assert.equal(tickRate(false, REAL_TIME, 45), 45);
});

test('skip is an hour, scrub is an offset from where the drag began', () => {
    assert.equal(HOUR, 1 / 24);
    close(skipHours(10, 1), 10 + 1 / 24);
    close(skipHours(10, -1), 10 - 1 / 24);
    assert.equal(scrubbed(1000, -30), 970);
    assert.equal(scrubbed(1000, 12.5), 1012.5);
});

test('typed fields change one part of the date and keep the rest', () => {
    const start = totalDays(1105, 203) + 0.25;
    // Year: day and time stay.
    close(withYear(start, '1110'), totalDays(1110, 203) + 0.25);
    close(withYear(start, ''), totalDays(0, 203) + 0.25);
    close(withYear(start, '-2'), totalDays(-2, 203) + 0.25);
    // Day: clamped to 1..365, time stays.
    close(withDay(start, '1'), totalDays(1105, 1) + 0.25);
    close(withDay(start, '400'), totalDays(1105, 365) + 0.25);
    close(withDay(start, '0'), totalDays(1105, 1) + 0.25);
    close(withDay(start, 'x'), totalDays(1105, 1) + 0.25);
    // Time: the day stays.
    close(withTime(start, '18:30'), totalDays(1105, 203) + (18 * 3600 + 30 * 60) / DAY_SECONDS);
    close(withTime(start, '00:00:01'), totalDays(1105, 203) + 1 / DAY_SECONDS);
    assert.equal(withTime(start, ''), start);
    assert.equal(withTime(start, 'ab:cd'), start);
});

test('the link carries the date as DDD-YYYY, and a time as HHMM when it is not midnight', () => {
    assert.deepEqual(formatLinkDate(totalDays(1105, 2)), { date: '002-1105' });
    assert.deepEqual(formatLinkDate(totalDays(1105, 203) + (14 * 60 + 30) / 1440), { date: '203-1105', time: '1430' });
    // Seconds are not in the link: the minute is.
    assert.deepEqual(formatLinkDate(totalDays(990, 365) + (23 * 3600 + 59 * 60 + 59) / DAY_SECONDS), { date: '365-0990', time: '2359' });
    assert.deepEqual(formatLinkDate(totalDays(0, 1) + 61 / DAY_SECONDS), { date: '001-0000', time: '0001' });
    assert.deepEqual(formatLinkDate(totalDays(-3, 10)), { date: '010--0003' });

    assert.equal(parseLinkDate('002-1105'), totalDays(1105, 2));
    close(parseLinkDate('203-1105', '1430'), totalDays(1105, 203) + (14 * 60 + 30) / 1440);
    assert.equal(parseLinkDate(['365-0990', '001-0001']), totalDays(990, 365));
    assert.equal(parseLinkDate('010--0003'), totalDays(-3, 10));
    // A day outside 001-365 is invalid, not clamped; so is any other form.
    for (const bad of ['000-1105', '366-1105', '999-1105', '2-1105', '002/1105', '1105-002x', '', 'nonsense', null, undefined, 42]) {
        assert.equal(parseLinkDate(bad), null, String(bad));
    }
    // A time that is not HHMM within the day is ignored: the date opens at 0000.
    for (const bad of ['2460', '1299', '930', '14:30', 'noon', '', undefined]) {
        assert.equal(parseLinkDate('203-1105', bad), totalDays(1105, 203), String(bad));
    }
    // A link round-trips to the minute.
    for (const days of [totalDays(1105, 2), totalDays(1105, 203) + 0.75, totalDays(1, 365) + 0.999]) {
        const link = formatLinkDate(days);
        assert.ok(Math.abs(parseLinkDate(link.date, link.time) - days) < 1 / 1440);
    }
});

test('the clock starts at the link\u2019s date, else day 002 of a selected milieu, else 002-1105', () => {
    assert.deepEqual(DEFAULT_START, { year: 1105, day: 2 });
    assert.ok(START_HELP.startsWith('Default date 002-1105'));
    const standard = totalDays(1105, 2);
    assert.equal(startDays(undefined), standard);
    assert.equal(startDays(''), standard);
    assert.equal(startDays('nonsense'), standard);
    // An invalid day falls through; it is not clamped.
    assert.equal(startDays('400-1105'), standard);
    assert.equal(startDays('203-1105'), totalDays(1105, 203));
    close(startDays('203-1105', '0600'), totalDays(1105, 203) + 0.25);
    // A milieu other than 1105: day 002 of its year, at 0000. The link still wins.
    assert.equal(startDays(undefined, undefined, 1900), totalDays(1900, 2));
    assert.equal(startDays('366-1105', undefined, 1900), totalDays(1900, 2));
    assert.equal(startDays(undefined, undefined, 1105), standard);
    assert.equal(startDays(undefined, undefined, null), standard);
    assert.equal(startDays('010-1105', undefined, 1900), totalDays(1105, 10));
});
