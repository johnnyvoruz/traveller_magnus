import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entryResults, rankResults } from '../../apps/web/src/search/omni.ts';
import { campaignMatches } from '../../apps/web/src/workspace/omni_campaign.ts';
import { newRecord } from '../../apps/web/src/workspace/records.ts';

const STAMP = '2026-10-17T12:00:00.000Z';

test('the palette finds a word in record details and in a journal body', () => {
    const depot = newRecord('place', 'cr_00000001-0000-4000-8000-000000000000', STAMP);
    depot.name = 'Depot';
    depot.details = 'The gate is shut.\nThe amber vault is under the port.';
    const quiet = newRecord('place', 'cr_00000002-0000-4000-8000-000000000000', STAMP);
    quiet.name = 'Quiet';
    quiet.details = 'Nothing stored here.';
    const gone = newRecord('place', 'cr_00000003-0000-4000-8000-000000000000', STAMP);
    gone.name = 'Gone';
    gone.details = 'The amber vault was moved.';
    gone.deleted = true;
    const records = { [depot.id]: depot, [quiet.id]: quiet, [gone.id]: gone };
    const found = campaignMatches('amber', records);
    assert.equal(found.total, 1);
    assert.equal(found.items[0].name, 'Depot');
    assert.equal(found.items[0].detail, 'The amber vault is under the port.');
    assert.deepEqual(found.items[0].mark, {
        before: 'The ',
        word: 'amber',
        after: ' vault is under the port.',
    });

    const entries = entryResults([
        { id: 'cj_1', title: 'Tuesday', body: 'We waited.\nWe found the amber vault.', deleted: false },
        { id: 'cj_2', title: 'Landfall on Regina', body: '', deleted: false },
        { id: 'cj_3', title: 'Moved', body: 'The amber vault was moved.', deleted: true },
    ], 'amber');
    const ranked = rankResults('amber', entries);
    assert.deepEqual(ranked.map((row) => row.id), ['cj_1']);
    assert.equal(ranked[0].detail, 'We found the amber vault.');
    assert.equal(ranked[0].mark.word, 'amber');
    assert.equal(ranked[0].mark.before, 'We found the ');
});
