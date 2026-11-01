/**
 * AQ4 round 1. A campaign file goes out through the export document shape and
 * comes back through parseExport and importCampaign.
 * The writer is apps/api/src/routes/campaign_export.ts. The reader is
 * apps/web/src/campaign/import.ts. apps/web/src/campaign/index.ts is the
 * record index, not the file export.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_ENTRY_KINDS, CAMPAIGN_LINK_KINDS, CAMPAIGN_RECORD_TYPES } from '@voyage/shared';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { importCampaign, parseExport } from '../../apps/web/src/campaign/import.ts';
import { buildCampaigns } from './roundtrip_campaign.js';

const TARGET = 'uni-open';
const SEED = 'aq4-round-1-export';

function jsonResponse(body) {
    return { ok: true, status: 200, json: async () => body };
}

/** The save answers with the rev the file already carried, so the stored row can match the file. */
function harness(file) {
    const requests = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body == null ? null : JSON.parse(init.body);
        requests.push({ url: String(url), method: init.method || 'GET', body });
        const applied = [];
        let seq = 1;
        for (const row of body.records || []) applied.push({ table: 'records', id: row.id, rev: row.rev, seq: seq += 1 });
        for (const row of body.links || []) applied.push({ table: 'links', id: row.id, rev: row.rev, seq: seq += 1 });
        for (const row of body.journal || []) applied.push({ table: 'journal', id: row.id, rev: row.rev, seq: seq += 1 });
        if (body.settings) applied.push({ table: 'settings', id: 'campaignSettings', rev: body.settings.rev, seq: seq += 1 });
        if (body.clock) applied.push({ table: 'clock', id: 'campaignTime', rev: file.clock.rev, seq: seq += 1 });
        return jsonResponse({ ok: true, data: { applied, conflicts: [] } });
    };
    return { requests, fetchImpl };
}

function openEmpty() {
    resetCampaign();
    campaign.status = 'ready';
    campaign.role = 'owner';
    campaign.universeId = TARGET;
    campaign.settings = {
        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 2,
    };
    campaign.clock = null;
}

function canon(value) {
    return JSON.parse(JSON.stringify(value));
}

function diffs(left, right) {
    const out = [];
    function walk(path, a, b) {
        if (Object.is(a, b)) return;
        const aObj = a !== null && typeof a === 'object';
        const bObj = b !== null && typeof b === 'object';
        if (aObj && bObj && Array.isArray(a) === Array.isArray(b)) {
            if (Array.isArray(a)) {
                if (a.length !== b.length) out.push(`${path} length ${a.length} !== ${b.length}`);
                const count = Math.min(a.length, b.length);
                for (let i = 0; i < count; i += 1) walk(`${path}[${i}]`, a[i], b[i]);
                return;
            }
            const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
            for (const key of keys) walk(path ? `${path}.${key}` : key, a[key], b[key]);
            return;
        }
        out.push(`${path} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    }
    walk('', left, right);
    return out;
}

function assertSame(label, left, right) {
    const found = diffs(canon(left), canon(right));
    assert.equal(found.length, 0, `${label}\n${found.slice(0, 8).join('\n')}`);
}

function storedRows(map, rows) {
    assert.equal(Object.keys(map).length, rows.length);
    return rows.map((row) => {
        assert.ok(map[row.id], row.id);
        return map[row.id];
    });
}

test('twenty seeded campaigns export and import field for field', async () => {
    const built = buildCampaigns(SEED, 20);
    assert.equal(built.length, 20);
    const seen = {
        types: new Set(),
        links: new Set(),
        entries: new Set(),
        fence: false,
        image: false,
        ledger: false,
        passenger: false,
        track: false,
        mark: new Set(),
        tables: false,
        reply: false,
        dropped: false,
    };

    for (const [index, item] of built.entries()) {
        const file = item.exported;
        const text = JSON.stringify(file);
        const parsed = parseExport(text);
        assert.equal(parsed.ok, true, parsed.ok ? '' : `${index} ${parsed.message}`);
        assertSame(`campaign ${index} parsed export`, parsed.document, file);

        const box = harness(file);
        openEmpty();
        transport.fetch = box.fetchImpl;
        transport.schedule = () => () => {};
        const result = await importCampaign(parsed.document, TARGET);
        assert.equal(result.ok, true, result.ok ? '' : `${index} ${result.message}`);
        const clockRow = file.clock ? 1 : 0;
        assert.equal(result.landed, file.records.length + file.links.length + file.journal.length + 1 + clockRow);
        assert.equal(campaign.universeId, TARGET);
        assertSame(`campaign ${index} records`, storedRows(campaign.records, file.records), file.records);
        assertSame(`campaign ${index} links`, storedRows(campaign.links, file.links), file.links);
        assertSame(`campaign ${index} journal`, storedRows(campaign.journal, file.journal), file.journal);
        assertSame(`campaign ${index} settings`, campaign.settings, file.settings);
        assertSame(`campaign ${index} clock`, campaign.clock, file.clock);

        const source = item.campaign;
        assert.equal(source.records.some((row) => row.deleted), true);
        assert.equal(file.records.some((row) => row.deleted), false);
        assert.equal(file.records.some((row) => row.name === `dropped ${index}`), false);
        seen.dropped = true;
        for (const row of file.records) {
            seen.types.add(row.type);
            if (row.images) seen.image = true;
            if (row.details.includes(':::referee')) seen.fence = true;
            const status = row.status;
            if (status && status.ledger && status.ledger.length > 0) seen.ledger = true;
            if (status && status.passengers && status.passengers.length > 0) seen.passenger = true;
            if (status && status.track && status.track.length > 0) seen.track = true;
            if (status && status.fuelMark) seen.mark.add(status.fuelMark);
        }
        for (const row of file.links) seen.links.add(row.kind);
        for (const row of file.journal) {
            seen.entries.add(row.kind);
            if (row.parent) seen.reply = true;
            if (row.body.includes(':::referee')) seen.fence = true;
            if (row.images) seen.image = true;
        }
        if (file.settings.tableSets && file.settings.tableSets.trade) seen.tables = true;
    }

    assert.deepEqual([...seen.types].sort(), [...CAMPAIGN_RECORD_TYPES].sort());
    assert.deepEqual([...seen.links].sort(), CAMPAIGN_LINK_KINDS.map((row) => row.kind).sort());
    assert.deepEqual([...seen.entries].sort(), [...CAMPAIGN_ENTRY_KINDS].sort());
    assert.equal(seen.fence, true);
    assert.equal(seen.image, true);
    assert.equal(seen.ledger, true);
    assert.equal(seen.passenger, true);
    assert.equal(seen.track, true);
    assert.deepEqual([...seen.mark].sort(), ['naval', 'scout']);
    assert.equal(seen.tables, true);
    assert.equal(seen.reply, true);
    assert.equal(seen.dropped, true);
    resetCampaign();
});
