/**
 * AQ1 round 1. The starport's local time from the subsolar fraction.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localDaysPerSecond, portTimeText } from '../../apps/web/src/orbit/sun.ts';

function sun(over) {
    return {
        latDeg: 0,
        lonFromPortDeg: 0,
        locked: false,
        solarDayHours: 24,
        portDayFraction: 0,
        turning: { lockedToStar: false, solarDayHours: 24 },
        ...over,
    };
}

test('port time is HH:MM of the world\'s day, and absent when the day is not known', () => {
    assert.equal(portTimeText(sun({ portDayFraction: null })), null);
    assert.equal(portTimeText(sun({ solarDayHours: null })), null);
    assert.equal(portTimeText(sun({ solarDayHours: 0 })), null);
    assert.equal(portTimeText(sun({ portDayFraction: 0 })), '00:00');
    assert.equal(portTimeText(sun({ portDayFraction: 0.5 })), '12:00');
    assert.equal(portTimeText(sun({ portDayFraction: 1 })), '00:00');
    assert.equal(portTimeText(sun({ solarDayHours: 20, portDayFraction: 0.25 })), '05:00');
});

test('local days a second follow the clock rate and the world\'s day, and a missing day is zero', () => {
    assert.equal(localDaysPerSecond(1, null), 0);
    assert.equal(localDaysPerSecond(1, 0), 0);
    assert.equal(localDaysPerSecond(1, 24), 1);
    assert.equal(localDaysPerSecond(-2, 24), 2);
    assert.equal(localDaysPerSecond(1, 12), 2);
});
