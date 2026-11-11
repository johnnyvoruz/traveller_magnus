import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendStatus } from '../../apps/web/src/campaign/append.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, rereadPlayerPages, transport } from '../../apps/web/src/campaign/store.ts';

const KEPT = 'cr_22222222-2222-2222-2222-222222222222';
const GONE = 'cr_11111111-1111-1111-1111-111111111111';
const STAMP = '2026-10-04T00:00:00.000Z';
const HEX = 'Spinward_Marches/1910';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function record(id, name) {
    return {
        id,
        type: 'vessel',
        kind: '',
        name,
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
    };
}

function settings() {
    return {
        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
    };
}

function page(name) {
    return {
        records: [record(KEPT, name)],
        links: [],
        journal: [],
        settings: settings(),
        clock: null,
        seq: 4,
        done: true,
        visible: { records: [KEPT], links: [], journal: [] },
    };
}

function holdOpen() {
    resetCampaign();
    campaign.status = 'ready';
    campaign.role = 'player';
    campaign.universeId = 'uni-play';
    campaign.settings = settings();
    campaign.records[KEPT] = record(KEPT, 'Before');
    campaign.records[GONE] = record(GONE, 'Old');
}

test('a player re-read replaces the rows and the loading flag stays down', async () => {
    holdOpen();
    const seen = [];
    transport.fetch = async () => {
        seen.push(campaign.status);
        return jsonResponse(200, { data: page('After') });
    };
    await rereadPlayerPages('uni-play');
    assert.deepEqual(seen, ['ready']);
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.records[KEPT].name, 'After');
    assert.equal(campaign.records[GONE], undefined);
    assert.equal(campaign.universeId, 'uni-play');
    assert.equal(campaign.role, 'player');
});

test('a landed press re-reads in place', async () => {
    holdOpen();
    const seen = [];
    transport.fetch = async (url) => {
        seen.push(campaign.status);
        if (String(url).includes('/changes')) {
            return jsonResponse(200, { data: { applied: [{ table: 'records', id: KEPT, rev: 2, seq: 4 }] } });
        }
        return jsonResponse(200, { data: page('After') });
    };
    const result = await appendStatus(KEPT, { cargo: { add: [] } });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(seen, ['ready', 'ready']);
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.records[KEPT].name, 'After');
    assert.equal(campaign.records[GONE], undefined);
});
