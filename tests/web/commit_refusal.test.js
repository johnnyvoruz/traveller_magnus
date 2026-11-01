/**
 * A refused campaign save keeps retrying. A sentence from the server stays visible.
 * A dropped connection stays offline.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { commit, flushCampaign, lastError, lastStatus, newRecordId, pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';

const saved = { fetch: transport.fetch, schedule: transport.schedule };

function holdSchedule() {
    const waits = [];
    transport.schedule = (_fn, ms) => {
        waits.push(ms);
        return () => {};
    };
    return waits;
}

function begin() {
    resetCampaign();
    const waits = holdSchedule();
    campaign.universeId = 'uni-1';
    return waits;
}

function row() {
    const id = newRecordId();
    return {
        id,
        type: 'person',
        kind: '',
        name: 'Ada',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        rev: 0,
        deleted: false,
        baseRev: 0,
    };
}

function answer(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function applied(id) {
    return answer(200, { ok: true, data: { applied: [{ table: 'records', id, rev: 1, seq: 1 }], conflicts: [] } });
}

test('a 429 and another refusal keep the sentence and the status, and the save is sent again', async () => {
    const person = row();
    const calls = [];
    let waits = [];
    try {
        waits = begin();
        commit({ records: [person] });
        transport.fetch = async (_url, init) => {
            calls.push(JSON.parse(init.body));
            if (calls.length === 1) return answer(429, { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } });
            return applied(person.id);
        };
        await flushCampaign();
        assert.equal(lastError.value, 'Too many requests.');
        assert.equal(lastStatus.value, 429);
        assert.equal(pending.value, true);
        assert.equal(waits.at(-1) > 0, true);
        await flushCampaign();
        assert.equal(calls.length, 2);
        assert.equal(calls[1].records[0].id, person.id);
        assert.equal(lastError.value, '');
        assert.equal(lastStatus.value, null);
        assert.equal(pending.value, false);

        const other = row();
        waits = begin();
        commit({ records: [other] });
        calls.length = 0;
        transport.fetch = async () => answer(400, { ok: false, error: { code: 'validation', message: 'Invalid request.' } });
        await flushCampaign();
        assert.equal(lastError.value, 'Invalid request.');
        assert.equal(lastStatus.value, 400);
        assert.equal(pending.value, true);

        const dropped = row();
        begin();
        commit({ records: [dropped] });
        transport.fetch = async () => { throw new Error('network'); };
        await flushCampaign();
        assert.equal(lastError.value, 'offline');
        assert.equal(lastStatus.value, null);
        assert.equal(pending.value, true);

        transport.fetch = async () => answer(500, { ok: false });
        await flushCampaign();
        assert.equal(lastError.value, 'offline');
        assert.equal(lastStatus.value, null);
        assert.equal(pending.value, true);

        transport.fetch = async () => answer(400, { ok: false, error: { message: '   ' } });
        await flushCampaign();
        assert.equal(lastError.value, 'offline');
        assert.equal(lastStatus.value, null);
    } finally {
        transport.fetch = saved.fetch;
        transport.schedule = saved.schedule;
        resetCampaign();
    }
});
