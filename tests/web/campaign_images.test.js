import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { flushCampaign, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { addImage, makePrimary, prepareImage } from '../../apps/web/src/campaign/images.ts';

const RECORD = 'cr_11111111-1111-1111-1111-111111111111';
const STAMP = '2026-10-05T00:00:00.000Z';
const FULL = new Uint8Array([1, 2, 3, 4]);
const THUMB = new Uint8Array([5, 6, 7]);

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function record() {
    return {
        id: RECORD,
        type: 'person',
        kind: '',
        name: 'Voss',
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
    };
}

async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encoder() {
    const calls = [];
    const encode = async (source, longest, quality) => {
        calls.push({ longest, quality, source });
        if (longest === 2048) return { bytes: FULL, width: 4000, height: 2000 };
        if (longest === 320) return { bytes: THUMB, width: 320, height: 160 };
        return null;
    };
    return { calls, encode };
}

function harness(mode) {
    const requests = [];
    const fetchImpl = async (url, init = {}) => {
        const method = init.method || 'GET';
        requests.push({
            url: String(url),
            method,
            body: init.body,
            type: new Headers(init.headers).get('content-type'),
            credentials: init.credentials,
        });
        if (method === 'PUT') {
            const n = requests.filter((item) => item.method === 'PUT').length;
            if (mode === 'fail' && n === 1) {
                return jsonResponse(500, { ok: false, error: { code: 'internal', message: 'no' } });
            }
            if (mode === 'quota' && n === 1) {
                return jsonResponse(400, { ok: false, error: { code: 'too_large', message: 'Over the image quota.' } });
            }
            return jsonResponse(n === 1 ? 201 : 200, { ok: true, data: {} });
        }
        if (method === 'PATCH') {
            const body = JSON.parse(init.body);
            const applied = (body.records || []).map((row) => ({
                table: 'records', id: row.id, rev: row.baseRev + 1, seq: 1,
            }));
            return jsonResponse(200, { ok: true, data: { applied, conflicts: [] } });
        }
        throw new Error('unexpected ' + method + ' ' + url);
    };
    return { requests, fetchImpl };
}

function install(box) {
    resetCampaign();
    transport.fetch = box.fetchImpl;
    transport.schedule = () => () => {};
    campaign.universeId = 'uni-1';
    campaign.status = 'ready';
    campaign.records[RECORD] = record();
}

test('prepareImage hashes a webp and a thumbnail', async () => {
    const stub = encoder();
    const prepared = await prepareImage(new Blob(['photo']), stub.encode);
    assert.equal(prepared.ok, true);
    assert.equal(stub.calls.length, 2);
    assert.deepEqual(stub.calls.map((call) => call.longest), [2048, 320]);
    assert.deepEqual(stub.calls.map((call) => call.quality), [0.85, 0.85]);
    assert.equal(prepared.image.hash, await sha256Hex(FULL));
    assert.equal(prepared.image.thumbHash, await sha256Hex(THUMB));
    assert.equal(prepared.image.width, 4000);
    assert.equal(prepared.image.height, 2000);
    assert.equal(prepared.image.bytes, FULL.byteLength);
});

test('a browser that cannot encode WebP is refused', async () => {
    const prepared = await prepareImage(new Blob(['photo']), async () => null);
    assert.equal(prepared.ok, false);
    assert.equal(prepared.message, 'This browser cannot encode WebP.');
});

test('adding an image puts both objects and then one record change', async () => {
    const stub = encoder();
    const prepared = await prepareImage(new Blob(['photo']), stub.encode);
    const box = harness();
    install(box);
    const added = await addImage(RECORD, prepared.image);
    assert.equal(added.ok, true);
    await flushCampaign();
    assert.deepEqual(box.requests.map((item) => item.method), ['PUT', 'PUT', 'PATCH']);
    assert.equal(box.requests[0].url, `/api/universes/uni-1/objects/${prepared.image.hash}`);
    assert.equal(box.requests[1].url, `/api/universes/uni-1/objects/${prepared.image.thumbHash}`);
    assert.equal(box.requests[0].type, 'image/webp');
    assert.equal(box.requests[1].type, 'image/webp');
    assert.equal(box.requests[0].credentials, 'same-origin');
    assert.deepEqual(box.requests[0].body, FULL);
    assert.deepEqual(box.requests[1].body, THUMB);
    const change = JSON.parse(box.requests[2].body);
    assert.equal(change.records.length, 1);
    assert.equal(change.records[0].id, RECORD);
    assert.equal(change.records[0].baseRev, 1);
    assert.deepEqual(change.records[0].images, [{
        hash: prepared.image.hash,
        thumbHash: prepared.image.thumbHash,
        width: 4000,
        height: 2000,
        bytes: FULL.byteLength,
    }]);
    assert.equal(campaign.records[RECORD].images.length, 1);
});

test('a failed upload changes no record', async () => {
    const stub = encoder();
    const prepared = await prepareImage(new Blob(['photo']), stub.encode);
    const box = harness('fail');
    install(box);
    const added = await addImage(RECORD, prepared.image);
    assert.equal(added.ok, false);
    await flushCampaign();
    assert.deepEqual(box.requests.map((item) => item.method), ['PUT']);
    assert.equal(campaign.records[RECORD].images, null);
});

test('too_large from an upload is a message and changes no record', async () => {
    const stub = encoder();
    const prepared = await prepareImage(new Blob(['photo']), stub.encode);
    const box = harness('quota');
    install(box);
    const added = await addImage(RECORD, prepared.image);
    assert.equal(added.ok, false);
    assert.equal(added.message, 'Over the image quota.');
    await flushCampaign();
    assert.deepEqual(box.requests.map((item) => item.method), ['PUT']);
    assert.equal(campaign.records[RECORD].images, null);
});

test('makePrimary moves the chosen image to the front', async () => {
    const first = { hash: 'a'.repeat(64), thumbHash: 'b'.repeat(64), width: 10, height: 20, bytes: 3 };
    const second = { hash: 'c'.repeat(64), thumbHash: 'd'.repeat(64), width: 30, height: 40, bytes: 4 };
    const box = harness();
    install(box);
    campaign.records[RECORD].images = [first, second];
    makePrimary(RECORD, second.hash);
    await flushCampaign();
    assert.deepEqual(campaign.records[RECORD].images.map((image) => image.hash), [second.hash, first.hash]);
    const change = JSON.parse(box.requests[0].body);
    assert.deepEqual(change.records[0].images.map((image) => image.hash), [second.hash, first.hash]);
});
