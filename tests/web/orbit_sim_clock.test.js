/**
 * AQ1 round 3. One clock for the orbit view and the surface map.
 * Every step stays off the animation loop, so this file never asks the window for a frame.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishOrbitClock } from '../../apps/web/src/orbit/running.ts';
import {
    clockDays, clockJumps, clockToNow, noteDriverState, offerStart, registerClockDriver,
    setClockDays, setClockPlaying, setClockRate, simClock, subscribeSimClock,
} from '../../apps/web/src/orbit/sim_clock.ts';

test('a start is taken once, a driver owns the controls, and Now stops on the campaign date', () => {
    assert.equal(clockDays(), 0);
    assert.equal(clockJumps(), 0);
    assert.equal(simClock.started, false);
    assert.equal(simClock.driver, 'local');
    assert.equal(simClock.playing, false);

    offerStart(Number.NaN);
    offerStart(Number.POSITIVE_INFINITY);
    assert.equal(simClock.started, false);
    assert.equal(clockDays(), 0);

    const heard = [];
    const stop = subscribeSimClock((days) => { heard.push(days); });
    offerStart(12.5);
    assert.equal(clockDays(), 12.5);
    assert.equal(simClock.days, 12.5);
    assert.equal(simClock.started, true);
    assert.deepEqual(heard, [12.5]);
    offerStart(99);
    assert.equal(clockDays(), 12.5);

    const calls = [];
    const driver = {
        setDays(days) { calls.push(['days', days]); },
        setPlaying(playing) { calls.push(['playing', playing]); },
        setRate(rate) { calls.push(['rate', rate]); },
        playing() { return true; },
        rate() { return 7; },
    };
    const release = registerClockDriver(driver);
    assert.equal(simClock.driver, 'orbit');
    assert.equal(simClock.playing, true);
    assert.equal(simClock.rate, 7);

    noteDriverState(false, 0);
    assert.equal(simClock.playing, false);
    assert.equal(simClock.rate, 7);
    noteDriverState(true, 30);
    assert.equal(simClock.playing, true);
    assert.equal(simClock.rate, 30);

    setClockRate(0);
    setClockRate(-1);
    assert.equal(simClock.rate, 30);
    assert.equal(calls.some((call) => call[0] === 'rate'), false);
    setClockRate(1);
    assert.equal(simClock.rate, 1);
    assert.deepEqual(calls.at(-1), ['rate', 1]);

    const jumps = clockJumps();
    setClockDays(Number.NaN);
    assert.equal(clockJumps(), jumps);
    assert.equal(clockDays(), 12.5);
    setClockDays(40);
    assert.equal(clockJumps(), jumps + 1);
    assert.equal(clockDays(), 40);
    assert.deepEqual(calls.at(-1), ['days', 40]);

    setClockPlaying(false);
    assert.equal(simClock.playing, false);
    assert.deepEqual(calls.at(-1), ['playing', false]);

    publishOrbitClock(41);
    assert.equal(clockDays(), 41);
    publishOrbitClock(Number.NaN);
    assert.equal(clockDays(), 41);

    release();
    assert.equal(simClock.driver, 'local');
    assert.equal(simClock.playing, false);
    noteDriverState(true, 2);
    assert.equal(simClock.playing, false);
    assert.equal(simClock.rate, 1);
    publishOrbitClock(100);
    assert.equal(clockDays(), 41);

    const second = {
        setDays() {},
        setPlaying() {},
        setRate() {},
        playing() { return false; },
        rate() { return 2; },
    };
    const releaseSecond = registerClockDriver(second);
    release();
    assert.equal(simClock.driver, 'orbit');
    assert.equal(simClock.rate, 2);
    releaseSecond();
    assert.equal(simClock.driver, 'local');

    const before = clockJumps();
    clockToNow(3);
    assert.equal(simClock.playing, false);
    assert.equal(clockDays(), 3);
    assert.equal(clockJumps(), before + 1);

    stop();
    const heardCount = heard.length;
    setClockDays(4);
    assert.equal(heard.length, heardCount);
    assert.equal(clockDays(), 4);
});
