import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commit, pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { loadDemo } from '../../apps/web/src/campaign/demo.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';

const SHIP = 'cr_11111111-1111-4111-8111-111111111111';
const NOTE = 'cj_44444444-4444-4444-8444-444444444444';
const STAMP = '2026-10-04T00:00:00.000Z';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function projection() {
    return {
        records: [{
            id: SHIP,
            type: 'vessel',
            kind: '',
            name: 'Open barge',
            summary: '',
            details: '',
            tags: [],
            anchor: null,
            when: null,
            visibility: 'players',
            playerNotes: null,
            sheet: null,
            status: null,
            images: null,
            createdAt: STAMP,
            updatedAt: STAMP,
            deleted: false,
        }],
        links: [],
        journal: [],
        settings: {
            party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
        },
        clock: null,
    };
}

test('a stubbed example loads read-only, and a write makes no request', async () => {
    resetCampaign();
    const calls = [];
    transport.fetch = async (url, init) => {
        calls.push({ url: String(url), credentials: init && init.credentials });
        return jsonResponse(200, { ok: true, data: projection() });
    };
    transport.schedule = () => {
        throw new Error('the example does not poll');
    };
    const page = await loadDemo();
    assert.ok(page);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/demo/campaign');
    assert.equal(calls[0].credentials, 'omit');
    assert.equal(campaign.role, 'player');
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.universeId, null);
    assert.equal(campaign.records[SHIP].name, 'Open barge');
    assert.equal(campaign.records[SHIP].rev, 0);
    commit({ records: [{ id: SHIP, name: 'Renamed', baseRev: 0 }] });
    commit({
        journal: [{
            id: NOTE,
            kind: 'note',
            title: '',
            body: 'A players note',
            when: null,
            realDate: null,
            sequence: null,
            author: 'players',
            visibility: 'players',
            anchor: null,
            mentions: [],
            images: null,
            createdAt: STAMP,
            updatedAt: STAMP,
            deleted: false,
            baseRev: 0,
        }],
    });
    assert.equal(campaign.records[SHIP].name, 'Open barge');
    assert.equal(campaign.journal[NOTE], undefined);
    assert.equal(pending.value, false);
    assert.equal(calls.length, 1);
});

test('404 and 503 give null and leave the store', async () => {
    for (const status of [404, 503]) {
        resetCampaign();
        campaign.status = 'signed-out';
        transport.fetch = async () => jsonResponse(status, { ok: false });
        const page = await loadDemo();
        assert.equal(page, null);
        assert.equal(campaign.status, 'signed-out');
        assert.equal(campaign.role, null);
        assert.equal(Object.keys(campaign.records).length, 0);
    }
});
