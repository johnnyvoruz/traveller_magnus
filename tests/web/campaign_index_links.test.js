/**
 * AQ1. linkIdsFrom, linkIdsTo, and recordIdsForWord read the rebuilt index.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkIdsFrom, linkIdsTo, rebuildCampaignIndex, recordIdsForWord } from '../../apps/web/src/campaign/index.ts';

const A = 'cr_11111111-1111-1111-1111-111111111111';
const B = 'cr_22222222-2222-2222-2222-222222222222';
const STAMP = '2026-10-06T00:00:00.000Z';

function record(id, over) {
    return {
        id,
        type: 'note',
        kind: '',
        name: 'Note',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function link(id, from, to, deleted) {
    return {
        id,
        from,
        to,
        kind: 'related',
        role: '',
        notes: '',
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: !!deleted,
    };
}

test('links are listed by end, and a word is the lower-case token', () => {
    const records = {
        [A]: record(A, { name: 'Far-Margin', summary: 'At Regina', tags: ['Scout'] }),
        [B]: record(B, { name: 'Ada', summary: 'regina dock' }),
    };
    const links = {
        cl_b: link('cl_b', A, B),
        cl_a: link('cl_a', A, B),
        cl_dead: link('cl_dead', B, A, true),
    };
    rebuildCampaignIndex(records, links, null);
    assert.deepEqual(linkIdsFrom(A), ['cl_a', 'cl_b']);
    assert.deepEqual(linkIdsTo(B), ['cl_a', 'cl_b']);
    assert.deepEqual(linkIdsFrom(B), []);
    assert.deepEqual(linkIdsTo(A), []);
    assert.deepEqual(linkIdsFrom(''), []);
    assert.deepEqual(recordIdsForWord('Regina'), [A, B]);
    assert.deepEqual(recordIdsForWord('FAR'), [A]);
    assert.deepEqual(recordIdsForWord('margin'), [A]);
    assert.deepEqual(recordIdsForWord('scout'), [A]);
    assert.deepEqual(recordIdsForWord(''), []);
    assert.deepEqual(recordIdsForWord('missing'), []);

    records[A].deleted = true;
    rebuildCampaignIndex(records, links, null);
    assert.deepEqual(recordIdsForWord('regina'), [B]);
    assert.deepEqual(linkIdsFrom(A), ['cl_a', 'cl_b']);
});
