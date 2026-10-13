import assert from 'node:assert/strict';
import test from 'node:test';
import { allowanceSentence, resetsAt, utcDay } from '../../apps/api/src/auth/allowance_clock.ts';

test('the allowance day is the UTC date and resets at the next midnight', () => {
    const evening = new Date('2026-10-11T23:30:00.000Z');
    const midnight = new Date('2026-10-12T00:00:00.000Z');
    assert.equal(utcDay(evening), '2026-10-11');
    assert.equal(utcDay(midnight), '2026-10-12');
    assert.equal(resetsAt(evening), '2026-10-12T00:00:00.000Z');
    assert.equal(resetsAt(midnight), '2026-10-13T00:00:00.000Z');
    assert.equal(allowanceSentence(63), 'You can generate 63 more systems today. The allowance resets at 00:00 UTC.');
    assert.equal(allowanceSentence(1), 'You can generate 1 more system today. The allowance resets at 00:00 UTC.');
    assert.equal(allowanceSentence(0), 'You can generate 0 more systems today. The allowance resets at 00:00 UTC.');
});
