// tools/examples/records_only_v2.mjs (stream Z, Z4): the plan publishes version n+1 of "Regina highport contacts"
// and "Jewell patrons" with no hexes and the latest version's record ids, skips a package that is already
// records-only, and refuses a missing, duplicated or unfinished package before anything is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECORDS_ONLY_TITLES, checkManifest, planRecordsOnly } from '../../tools/examples/records_only_v2.mjs';

const row = (title, extra = {}) => ({ id: 'pk_' + title.length, title, universe_id: 'u_' + title.length, version: 1, state: 'done', hex_count: 3, record_ids: JSON.stringify(['r1', 'r2']), ...extra });

test('the two packs named by answer 6', () => {
    assert.deepEqual(RECORDS_ONLY_TITLES, ['Regina highport contacts', 'Jewell patrons']);
});

test('a pack with hexes gets version n+1 with the same record ids; a records-only pack is skipped', () => {
    const plan = planRecordsOnly([row('Regina highport contacts'), row('Jewell patrons', { version: 2, hex_count: 0 })]);
    assert.deepEqual(plan[0], { action: 'publish', packageId: 'pk_24', title: 'Regina highport contacts', universeId: 'u_24', from: 1, to: 2, hexes: 3, recordIds: ['r1', 'r2'] });
    assert.equal(plan[1].action, 'skip');
    assert.equal(plan[1].to, 2);
});

test('a missing, duplicated, unfinished or empty pack is refused', () => {
    assert.throws(() => planRecordsOnly([row('Regina highport contacts')]), /Expected one package titled "Jewell patrons".*found 0/);
    assert.throws(() => planRecordsOnly([row('Regina highport contacts'), row('Jewell patrons'), row('Jewell patrons')]), /found 2/);
    assert.throws(() => planRecordsOnly([row('Regina highport contacts', { state: 'queued' }), row('Jewell patrons')]), /is queued, not done/);
    assert.throws(() => planRecordsOnly([row('Regina highport contacts', { record_ids: '[]' }), row('Jewell patrons')]), /has no records/);
});

test('the published manifest must keep the id, hold no hexes and count the same records', () => {
    const step = { packageId: 'pk_1', recordIds: ['a', 'b'] };
    assert.deepEqual(checkManifest({ packageId: 'pk_1', hexes: {}, records: { count: 2 } }, step), []);
    assert.deepEqual(checkManifest({ packageId: 'pk_2', hexes: { 'Spinward_Marches/1910': {} }, records: { count: 1 } }, step), ['packageId is pk_2', '1 hexes', 'records.count is 1, expected 2']);
});