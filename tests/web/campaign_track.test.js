import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { flushCampaign, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { appendLeg, positionAt, removeLastLeg, trackOf, whereAreWe } from '../../apps/web/src/campaign/track.ts';

const VESSEL = 'cr_11111111-1111-1111-1111-111111111111';
const STAMP = '2026-10-05T00:00:00.000Z';
const REGINA = { kind: 'system', hexKey: 'Spinward_Marches/1910' };
const JEWELL = { kind: 'system', hexKey: 'Spinward_Marches/1106' };

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function leg(departs, arrives, mode, to = REGINA) {
    return { from: REGINA, to, departs, arrives, mode };
}

function track() {
    return [
        leg(10, 20, 'docked'),
        { ...leg(20, 30, 'flight'), accelG: 2 },
        leg(30, 37, 'jump', JEWELL),
        leg(37, 50, 'orbit', JEWELL),
    ];
}

function vessel(over = {}) {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name: 'Far Margin',
        summary: '',
        details: '',
        tags: [],
        anchor: REGINA,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: { condition: { hull: 40 } },
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function appliedOf(body) {
    return (body.records || []).map((row, index) => ({
        table: 'records', id: row.id, rev: row.baseRev + 1, seq: index + 1,
    }));
}

function harness() {
    const requests = [];
    const fetchImpl = async (url, init = {}) => {
        const body = JSON.parse(init.body);
        requests.push({ url: String(url), method: init.method || 'GET', body });
        return jsonResponse(200, { ok: true, data: { applied: appliedOf(body), conflicts: [] } });
    };
    return { requests, fetchImpl };
}

function install(box) {
    resetCampaign();
    transport.fetch = box.fetchImpl;
    transport.schedule = () => () => {};
    campaign.universeId = 'uni-1';
    campaign.status = 'ready';
    campaign.records[VESSEL] = vessel();
}

test('positionAt at four dates, and Where are we follows the track', () => {
    const legs = track();
    assert.deepEqual(positionAt(legs, 15), REGINA);
    const flight = positionAt(legs, 25);
    assert.equal(flight.leg.mode, 'flight');
    assert.equal(flight.fraction, 0.5);
    const jump = positionAt(legs, 33.5);
    assert.equal(jump.leg.mode, 'jump');
    assert.equal(jump.fraction, 0.5);
    assert.equal(jump.leg.to.hexKey, 'Spinward_Marches/1106');
    assert.deepEqual(positionAt(legs, 40), JEWELL);

    const records = { [VESSEL]: vessel({ status: { track: legs } }) };
    const party = { vesselId: VESSEL, anchor: null };
    assert.equal(positionAt(legs, 5), null);
    assert.deepEqual(whereAreWe(party, records, 5), REGINA);
    assert.deepEqual(whereAreWe(party, records, 25), positionAt(legs, 25));
    const anchored = { [VESSEL]: vessel() };
    assert.deepEqual(whereAreWe(party, anchored, 25), REGINA);
    assert.equal(whereAreWe({ vesselId: null, anchor: JEWELL }, {}, 25), JEWELL);
});

test('a ship whose only leg was removed is at its anchor', async () => {
    const box = harness();
    install(box);
    assert.equal(appendLeg(VESSEL, leg(10, 20, 'docked')).ok, true);
    await flushCampaign();
    assert.equal(removeLastLeg(VESSEL).ok, true);
    await flushCampaign();
    const ship = campaign.records[VESSEL];
    assert.deepEqual(ship.status.track, []);
    assert.equal(trackOf(ship), null);
    assert.equal(positionAt([], 15), null);
    assert.deepEqual(whereAreWe({ vesselId: VESSEL, anchor: null }, campaign.records, 15), REGINA);
});

test('a leg out of time order is refused', () => {
    const box = harness();
    install(box);
    const first = appendLeg(VESSEL, leg(10, 20, 'docked'));
    assert.equal(first.ok, true);
    const refused = appendLeg(VESSEL, leg(19, 30, 'flight'));
    assert.equal(refused.ok, false);
    assert.equal(refused.message, 'Legs must stay in time order.');
    assert.equal(campaign.records[VESSEL].status.track.length, 1);
});

test('append and remove a leg through the campaign changes', async () => {
    const box = harness();
    install(box);
    assert.equal(appendLeg(VESSEL, leg(10, 20, 'docked')).ok, true);
    await flushCampaign();
    assert.equal(appendLeg(VESSEL, { ...leg(20, 30, 'flight'), accelG: 2 }).ok, true);
    await flushCampaign();
    assert.equal(removeLastLeg(VESSEL).ok, true);
    await flushCampaign();
    assert.equal(box.requests.length, 3);
    const bodies = box.requests.map((item) => item.body);
    for (const item of box.requests) {
        assert.equal(item.method, 'PATCH');
        assert.equal(item.url, '/api/universes/uni-1/campaign/changes');
    }
    assert.equal(bodies[0].records[0].status.track.length, 1);
    assert.equal(bodies[0].records[0].status.condition.hull, 40);
    assert.equal(bodies[0].records[0].status.track[0].departs, 10);
    assert.equal(bodies[0].records[0].baseRev, 1);
    assert.equal(bodies[1].records[0].status.track.length, 2);
    assert.equal(bodies[1].records[0].status.track[1].mode, 'flight');
    assert.equal(bodies[1].records[0].status.track[1].accelG, 2);
    assert.equal(bodies[1].records[0].baseRev, 2);
    assert.equal(bodies[2].records[0].status.track.length, 1);
    assert.equal(bodies[2].records[0].baseRev, 3);
    assert.equal(campaign.records[VESSEL].status.track.length, 1);
});
