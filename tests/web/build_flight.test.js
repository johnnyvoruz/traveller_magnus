/**
 * Generation in flight (apps/web/src/workspace/build/flight.ts, state.ts jobLine): which hexes
 * of a job are waiting and which have landed, read from each row's revision against the one it
 * had at the click.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endFlight, flight, flightSplit, renameFlight, startFlight } from '../../apps/web/src/workspace/build/flight.ts';
import { jobLine } from '../../apps/web/src/workspace/build/state.ts';

test('a hex has landed when its row moved past the revision it had at the click', () => {
    const revs = { 'A/0101': -1, 'A/0102': 3, 'A/0103': -1 };
    const rev = (key) => revs[key] ?? -1;
    startFlight(['A/0101', 'A/0102', 'A/0103'], rev);
    assert.deepEqual(flight.from, { 'A/0101': -1, 'A/0102': 3, 'A/0103': -1 });
    assert.deepEqual(flightSplit(flight.keys, flight.from, rev), { waiting: ['A/0101', 'A/0102', 'A/0103'], landed: [] });
    // An empty hex gets its first row; a filled one generated again moves to a later revision.
    revs['A/0101'] = 1;
    revs['A/0102'] = 4;
    assert.deepEqual(flightSplit(flight.keys, flight.from, rev), { waiting: ['A/0103'], landed: ['A/0101', 'A/0102'] });
    endFlight();
    assert.deepEqual(flight.keys, []);
});

test('the hexes of an empty slot follow their real keys once the sector is made', () => {
    startFlight(['~slot_3_1/0101', 'A/0505'], () => -1);
    renameFlight({ '~slot_3_1/0101': 'S1/0101' });
    assert.deepEqual(flight.keys, ['S1/0101', 'A/0505']);
    assert.deepEqual(flight.from, { 'S1/0101': -1, 'A/0505': -1 });
    endFlight();
});

test('a running job in one line', () => {
    assert.equal(jobLine({ label: 'Generating 80 hexes', total: 80, done: 12, failed: [], state: 'running' }), 'Generating 80 hexes · 12 of 80');
    assert.equal(jobLine({ label: 'Generating 1,280 hexes', total: 1280, done: 1000, failed: ['A/0101', 'A/0102'], state: 'running' }), 'Generating 1,280 hexes · 1,000 of 1,280 · 2 failed');
});
