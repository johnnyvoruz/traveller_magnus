/**
 * AQ1 round 1. The paste block, the sentence a referee sees, and the batch list.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { findBlock, loadBatches, problemSentence, proposals, resetProposals } from '../../apps/web/src/campaign/proposals.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';

const BATCH = 'pb_0123456789ABCDEFGHJKMNPQRS';
const STAMP = '2026-10-18T22:18:00.000Z';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function listItem(pending) {
    return {
        id: BATCH,
        source: { kind: 'transcript', label: 'Session 12', realDate: '2026-10-16' },
        state: 'open',
        counts: { pending, accepted: 0, dropped: 0 },
        createdAt: STAMP,
        reviewedAt: null,
        expiresAt: '2026-11-17T22:18:00.000Z',
        reviewUrl: 'https://traveller.voyage/campaign/proposals/' + BATCH,
        pasted: true,
    };
}

test('a fenced json block, or a whole body that is only an object; anything else is none', () => {
    assert.equal(findBlock(''), null);
    assert.equal(findBlock('no json here'), null);
    assert.deepEqual(findBlock('```json\n{"a":1}\n```'), { from: 'block', json: '{"a":1}' });
    assert.deepEqual(findBlock('See this:\n```JSON\n[1]\n```\nThanks.'), { from: 'block', json: '[1]' });
    assert.deepEqual(findBlock('  {"a":1}  '), { from: 'whole', json: '{"a":1}' });
    assert.equal(findBlock('```\n{"a":1}\n```'), null);
});

test('a paste problem is one sentence, and the checker\'s path stays inside it', () => {
    assert.equal(problemSentence({ proposal: null, op: null, ref: null, path: 'proposals', message: 'Required' }), 'The batch: proposals is missing.');
    assert.equal(problemSentence({ proposal: 2, op: 'record.create', ref: 'a', path: 'name', message: 'Required' }), 'Proposal 2 (record.create): name is missing.');
    assert.equal(problemSentence({ proposal: 1, op: null, ref: null, path: '', message: 'Invalid discriminator value' }), 'Proposal 1: that action is not one this campaign takes.');
    assert.equal(problemSentence({ proposal: 1, op: null, ref: null, path: 'type', message: 'Invalid enum value' }), 'Proposal 1: the record type is not one this campaign has.');
    assert.equal(problemSentence({ proposal: 1, op: null, ref: null, path: 'tons', message: 'Expected number, received string' }), 'Proposal 1: tons has the wrong type of value.');
    assert.equal(problemSentence({ proposal: 1, op: null, ref: null, path: 'kind', message: 'Invalid literal value' }), 'Proposal 1: kind is not one this campaign reads.');
    assert.equal(problemSentence({ proposal: 1, op: null, ref: null, path: '', message: 'no' }), 'Proposal 1: a field could not be read.');
});

test('the batch list is empty with no campaign, offline on a bad answer, and the open count when the list arrives', async () => {
    resetCampaign();
    resetProposals();
    transport.fetch = async () => { throw new Error('should not fetch'); };
    assert.deepEqual(await loadBatches(), []);

    campaign.status = 'ready';
    campaign.role = 'owner';
    campaign.universeId = 'uni-a';
    transport.fetch = async () => jsonResponse(503, {});
    assert.deepEqual(await loadBatches(), []);
    assert.equal(proposals.error, 'offline');

    transport.fetch = async (url) => {
        assert.match(url, /\/api\/universes\/uni-a\/campaign\/proposals\?state=open$/);
        return jsonResponse(200, { data: { items: [listItem(2), listItem(1)], nextCursor: null } });
    };
    const open = await loadBatches();
    assert.equal(open.length, 2);
    assert.equal(proposals.pending, 3);
    assert.equal(proposals.error, '');

    proposals.pending = 9;
    transport.fetch = async (url) => {
        assert.match(url, /state=reviewed$/);
        return jsonResponse(200, { data: { items: [listItem(4)], nextCursor: null } });
    };
    const reviewed = await loadBatches('reviewed');
    assert.equal(reviewed.length, 1);
    assert.equal(proposals.pending, 9);
    resetCampaign();
    resetProposals();
});
