/**
 * AQ1 round 3. The orbit picture publishes a date; the dossier hears it.
 * This file does not import the sim clock, so the only hearer is the one it adds.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishOrbitClock, subscribeOrbitClock } from '../../apps/web/src/orbit/running.ts';

test('a finite date is heard until the subscription stops; anything else is dropped', () => {
    const heard = [];
    const stop = subscribeOrbitClock((days) => heard.push(days));
    publishOrbitClock(Number.NaN);
    publishOrbitClock(Number.POSITIVE_INFINITY);
    publishOrbitClock(0);
    publishOrbitClock(12.5);
    assert.deepEqual(heard, [0, 12.5]);
    stop();
    publishOrbitClock(40);
    assert.deepEqual(heard, [0, 12.5]);
});

test('two hearers both get the date, and removing one leaves the other', () => {
    const first = [];
    const second = [];
    const stopFirst = subscribeOrbitClock((days) => first.push(days));
    const stopSecond = subscribeOrbitClock((days) => second.push(days));
    publishOrbitClock(1);
    stopFirst();
    publishOrbitClock(2);
    stopSecond();
    assert.deepEqual(first, [1]);
    assert.deepEqual(second, [1, 2]);
});
