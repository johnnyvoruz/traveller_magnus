/**
 * AQ1. newLinkId and newEntryId are the prefixes the commit queue stores.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newEntryId, newLinkId } from '../../apps/web/src/campaign/commit.ts';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

test('a link id is cl_ plus a uuid, and an entry id is cj_ plus a uuid', () => {
    const link = newLinkId();
    const entry = newEntryId();
    assert.match(link, new RegExp('^cl_' + UUID + '$'));
    assert.match(entry, new RegExp('^cj_' + UUID + '$'));
    assert.notEqual(newLinkId(), link);
    assert.notEqual(newEntryId(), entry);
});
