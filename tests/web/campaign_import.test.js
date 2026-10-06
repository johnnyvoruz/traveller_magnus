import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { importCampaign, parseExport } from '../../apps/web/src/campaign/import.ts';

const STAMP = '2026-10-05T00:00:00.000Z';
const HASH = 'a'.repeat(64);
const THUMB = 'b'.repeat(64);
const TARGET = 'uni-1';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function recordId(n) {
    return `cr_00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function linkId(n) {
    return `cl_00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function settings(rev = 7) {
    return {
        party: { vesselId: null, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev,
    };
}

function record(n) {
    return {
        id: recordId(n),
        type: 'person',
        kind: '',
        name: `Person ${n}`,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: n === 0
            ? [{ hash: HASH, thumbHash: THUMB, width: 20, height: 10, bytes: 4 }]
            : null,
        provenance: null,
        rev: 4,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
    };
}

function link(n, from, to) {
    return {
        id: linkId(n),
        from,
        to,
        kind: 'ally',
        role: '',
        order: n,
        since: null,
        until: null,
        notes: '',
        visibility: 'referee',
        provenance: null,
        rev: 2,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
    };
}

function document(recordCount, linkCount) {
    const records = [];
    for (let n = 0; n < recordCount; n += 1) records.push(record(n));
    const links = [];
    for (let n = 0; n < linkCount; n += 1) links.push(link(n, recordId(0), recordId(1)));
    return {
        universe: { id: 'uni-source', name: 'Old game', truthVersion: 'truth-1' },
        exportedAt: STAMP,
        records,
        links,
        settings: settings(7),
        clock: { days: 40, rev: 3 },
    };
}

function appliedOf(body) {
    const applied = [];
    let seq = 1;
    for (const row of body.records || []) applied.push({ table: 'records', id: row.id, rev: 1, seq: seq++ });
    for (const row of body.links || []) applied.push({ table: 'links', id: row.id, rev: 1, seq: seq++ });
    if (body.settings) applied.push({ table: 'settings', id: 'campaignSettings', rev: body.settings.baseRev + 1, seq: seq++ });
    if (body.clock) applied.push({ table: 'clock', id: 'campaignTime', rev: body.clock.baseRev + 1, seq: seq++ });
    return applied;
}

function harness(failAt = 0) {
    const requests = [];
    const fetchImpl = async (url, init = {}) => {
        const method = init.method || 'GET';
        const body = init.body == null ? null : JSON.parse(init.body);
        requests.push({ url: String(url), method, body });
        if (method === 'PATCH' && requests.length === failAt) {
            return jsonResponse(500, { ok: false, error: { code: 'internal', message: 'no' } });
        }
        return jsonResponse(200, { ok: true, data: { applied: appliedOf(body), conflicts: [] } });
    };
    return { requests, fetchImpl };
}

function openEmpty() {
    resetCampaign();
    campaign.status = 'ready';
    campaign.universeId = TARGET;
    campaign.settings = settings(2);
    campaign.clock = null;
}

test('a 450-row document goes in three patches, records then links then settings and the clock', async () => {
    const box = harness();
    openEmpty();
    transport.fetch = box.fetchImpl;
    transport.schedule = () => () => {};
    const parsed = parseExport(JSON.stringify(document(250, 200)));
    assert.equal(parsed.ok, true);
    const result = await importCampaign(parsed.document, TARGET);
    assert.equal(result.ok, true);
    assert.equal(result.landed, 452);
    assert.equal(box.requests.length, 3);
    const bodies = box.requests.map((item) => item.body);
    for (const item of box.requests) {
        assert.equal(item.method, 'PATCH');
        assert.equal(item.url, `/api/universes/${TARGET}/campaign/changes`);
    }
    assert.equal(bodies[0].records.length, CAMPAIGN_LIMITS.patchRows);
    assert.equal(bodies[0].links, undefined);
    assert.equal(bodies[0].settings, undefined);
    assert.equal(bodies[0].clock, undefined);
    assert.equal(bodies[0].records[0].id, recordId(0));
    assert.equal(bodies[0].records[0].baseRev, 0);
    assert.equal(bodies[0].records[0].images[0].hash, HASH);
    assert.equal(bodies[0].records[0].images[0].thumbHash, THUMB);
    assert.equal(bodies[0].records[199].id, recordId(199));
    assert.equal(bodies[1].records.length, 50);
    assert.equal(bodies[1].records[0].id, recordId(200));
    assert.equal(bodies[1].links.length, 150);
    assert.equal(bodies[1].links[0].id, linkId(0));
    assert.equal(bodies[1].settings, undefined);
    assert.equal(bodies[1].clock, undefined);
    assert.equal(bodies[2].records, undefined);
    assert.equal(bodies[2].links.length, 50);
    assert.equal(bodies[2].links[0].id, linkId(150));
    assert.equal(bodies[2].links[49].id, linkId(199));
    assert.equal(bodies[2].settings.baseRev, 2);
    assert.equal(bodies[2].settings.calendar.dateFormat, 'imperial');
    assert.deepEqual(bodies[2].clock, { days: 40, baseRev: 0 });
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.records[recordId(0)].images[0].hash, HASH);
});

test('a bad document is refused with its message', () => {
    const text = JSON.stringify({
        universe: { id: 'uni-source', name: 'Old game', truthVersion: null },
        exportedAt: STAMP,
        records: 'no',
        links: [],
        settings: settings(),
        clock: null,
    });
    const parsed = parseExport(text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.message, 'records: Expected array, received string');
});

test('a non-empty target is refused', async () => {
    const box = harness();
    openEmpty();
    transport.fetch = box.fetchImpl;
    transport.schedule = () => () => {};
    campaign.records[recordId(0)] = record(0);
    const parsed = parseExport(JSON.stringify(document(1, 0)));
    assert.equal(parsed.ok, true);
    const result = await importCampaign(parsed.document, TARGET);
    assert.equal(result.ok, false);
    assert.equal(result.message, 'That campaign is not empty.');
    assert.equal(result.landed, 0);
    assert.equal(box.requests.length, 0);
    assert.equal(campaign.records[recordId(0)].name, 'Person 0');
});

test('a failed second batch reports the count', async () => {
    const box = harness(2);
    openEmpty();
    transport.fetch = box.fetchImpl;
    transport.schedule = () => () => {};
    const parsed = parseExport(JSON.stringify(document(201, 0)));
    assert.equal(parsed.ok, true);
    const result = await importCampaign(parsed.document, TARGET);
    assert.equal(result.ok, false);
    assert.equal(result.landed, CAMPAIGN_LIMITS.patchRows);
    assert.equal(result.message, '200 rows imported. The next batch did not save.');
    assert.equal(box.requests.length, 2);
    assert.equal(box.requests[0].body.records.length, 200);
    assert.equal(box.requests[1].body.records.length, 1);
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.universeId, TARGET);
    assert.equal(campaign.records[recordId(0)].name, 'Person 0');
});
