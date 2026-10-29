/**
 * AQ1. findPlaying reads the playing list and returns the matching row.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPlaying } from '../../apps/web/src/campaign/membership.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { transport } from '../../apps/web/src/campaign/store.ts';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const played = { id: 'uni-play', name: 'Regina', ownerHandle: 'ref', truthVersion: 'v9' };

function install(answer) {
    resetCampaign();
    transport.fetch = async () => answer;
    transport.schedule = () => () => {};
}

test('the matching campaign is returned, and a miss or a failed list is null', async () => {
    install(jsonResponse(200, { ok: true, data: { items: [played] } }));
    assert.deepEqual(await findPlaying('uni-play'), played);
    assert.equal(await findPlaying('uni-other'), null);
    assert.equal(await findPlaying(''), null);

    install(jsonResponse(200, { ok: true, data: { items: [] } }));
    assert.equal(await findPlaying('uni-play'), null);

    install(jsonResponse(500, { ok: false, error: { code: 'internal', message: 'no' } }));
    assert.equal(await findPlaying('uni-play'), null);

    install(jsonResponse(401, { ok: false, error: { code: 'unauthenticated', message: 'Sign in.' } }));
    assert.equal(await findPlaying('uni-play'), null);
});
