import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { flushCampaign, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { appendLeg, positionAt, removeLastLeg, replaceLegsFrom, trackOf, whereAreWe } from '../../apps/web/src/campaign/track.ts';

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

test('replaceLegsFrom replaces the tail, removes it, and keeps a moved waypoint in one commit', async () => {
    const box = harness();
    install(box);
    const stored = track();
    campaign.records[VESSEL] = vessel({ status: { condition: { hull: 40 }, track: stored }, rev: 1 });
    const moved = [
        { ...leg(20, 28, 'flight', JEWELL), accelG: 2 },
        leg(28, 40, 'orbit', JEWELL),
    ];
    assert.deepEqual(replaceLegsFrom(VESSEL, 1, moved, 15), { ok: true });
    await flushCampaign();
    const after = campaign.records[VESSEL].status.track;
    assert.equal(after.length, 3);
    assert.equal(after[0].departs, 10);
    assert.equal(after[0].mode, 'docked');
    assert.equal(after[1].arrives, 28);
    assert.equal(after[1].to.hexKey, JEWELL.hexKey);
    assert.equal(after[2].arrives, 40);
    assert.equal(box.requests.length, 1);
    assert.equal(box.requests[0].body.records[0].baseRev, 1);
    assert.equal(box.requests[0].body.records[0].status.condition.hull, 40);

    assert.deepEqual(replaceLegsFrom(VESSEL, 1, [], 15), { ok: true });
    assert.equal(campaign.records[VESSEL].status.track.length, 1);
    assert.equal(campaign.records[VESSEL].status.track[0].departs, 10);
});

test('replaceLegsFrom takes a leg at the instant of its departure and a second before it, and refuses it a second after', async () => {
    const SECOND = 1 / 86400;
    for (const [when, ok] of [[20 - SECOND, true], [20, true], [20 + SECOND, false]]) {
        const box = harness();
        install(box);
        campaign.records[VESSEL] = vessel({ status: { track: track() }, rev: 1 });
        const result = replaceLegsFrom(VESSEL, 1, [{ ...leg(20, 28, 'flight', JEWELL), accelG: 2 }], when);
        assert.equal(result.ok, ok, 'at ' + when);
        if (!ok) assert.equal(result.message, 'That leg has already departed.');
        await flushCampaign();
        assert.equal(campaign.records[VESSEL].status.track.length, ok ? 2 : 4);
        assert.equal(box.requests.length, ok ? 1 : 0);
    }
});

test('replaceLegsFrom refuses history, an index past the end, a bad leg, a break in time, and 501 legs', () => {
    const box = harness();
    install(box);
    campaign.records[VESSEL] = vessel({ status: { track: track() }, rev: 1 });
    // A leg is history only once the date has passed its departure (ruled 2026-10-07).
    const SECOND = 1 / 86400;
    const history = replaceLegsFrom(VESSEL, 1, [leg(20, 28, 'flight')], 20 + SECOND);
    assert.equal(history.ok, false);
    assert.equal(history.message, 'That leg has already departed.');
    assert.equal(campaign.records[VESSEL].status.track.length, 4);
    assert.equal(box.requests.length, 0);
    const past = replaceLegsFrom(VESSEL, 5, [], 0);
    assert.equal(past.ok, false);
    assert.equal(past.message, 'There is no leg there.');
    const negative = replaceLegsFrom(VESSEL, -1, [], 0);
    assert.equal(negative.message, 'There is no leg there.');
    const bad = replaceLegsFrom(VESSEL, 3, [{ from: REGINA, to: JEWELL, departs: 50, arrives: 40, mode: 'flight' }], 36);
    assert.equal(bad.message, 'That leg is not a track leg.');
    const order = replaceLegsFrom(VESSEL, 3, [leg(30, 48, 'flight', JEWELL)], 36);
    assert.equal(order.message, 'Legs must stay in time order.');
    const many = [];
    for (let i = 0; i < 501; i += 1) many.push(leg(i * 2, i * 2 + 1, 'flight'));
    const capped = replaceLegsFrom(VESSEL, 0, many, -1);
    assert.equal(capped.message, 'A track can have 500 legs.');
    assert.equal(campaign.records[VESSEL].status.track.length, 4);
    assert.equal(box.requests.length, 0);
});

test('a typed leg keeps hoursTyped through append and replace', async () => {
    const box = harness();
    install(box);
    const typed = { ...leg(10, 20, 'docked'), hoursTyped: true };
    assert.equal(appendLeg(VESSEL, typed).ok, true);
    assert.equal(trackOf(campaign.records[VESSEL])[0].hoursTyped, true);
    const estimated = leg(20, 30, 'flight');
    assert.equal(replaceLegsFrom(VESSEL, 1, [estimated, { ...leg(30, 40, 'jump', JEWELL), hoursTyped: true }], 15).ok, true);
    const stored = trackOf(campaign.records[VESSEL]);
    assert.equal(stored[0].hoursTyped, true);
    assert.equal(stored[1].hoursTyped, undefined);
    assert.equal(stored[2].hoursTyped, true);
    await flushCampaign();
    const sent = box.requests[box.requests.length - 1].body.records[0].status.track;
    assert.equal(sent[0].hoursTyped, true);
    assert.equal(sent[1].hoursTyped, undefined);
    assert.equal(sent[2].hoursTyped, true);
});
