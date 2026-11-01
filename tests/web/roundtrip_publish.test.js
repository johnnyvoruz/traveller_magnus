/**
 * AQ4 round 4. The client half of publish then install.
 * planPack is apps/web/src/pack/plan.ts. applyPlayersPage is apps/web/src/campaign/store.ts.
 * The server copy is apps/api/src/universe/publish_read.ts recordForPublish. That file is
 * Lane B's and Lane Z's. This test does not call it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playersView } from '@voyage/shared';
import { planPack } from '../../apps/web/src/pack/plan.ts';
import { applyPlayersPage, campaign } from '../../apps/web/src/campaign/store.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { buildCampaigns } from './roundtrip_campaign.js';

const INTERIOR = 'The crate mark stays in this block.';

function byId(rows) {
    const out = {};
    for (const row of rows) out[row.id] = row;
    return out;
}

function hashesOf(images) {
    if (!images) return [];
    return images.flatMap((image) => [image.hash, image.thumbHash]);
}

test('twenty player packs leave out the referee set, and the players page installs as that read', () => {
    const built = buildCampaigns('aq4-round-4-publish', 20);
    assert.equal(built.length, 20);

    for (const [index, item] of built.entries()) {
        const source = item.campaign;
        const records = byId(source.records);
        const links = byId(source.links);
        const journal = byId(source.journal);
        const plan = planPack({
            name: source.universe.name,
            clockDays: source.clock ? source.clock.days : null,
            records,
            links,
            journal,
            settings: source.settings,
        });

        const live = source.records.filter((row) => !row.deleted);
        const players = live.filter((row) => row.visibility === 'players');
        const referee = live.filter((row) => row.visibility !== 'players');
        assert.deepEqual(plan.records.map((row) => row.id).sort(), players.map((row) => row.id).sort(), `campaign ${index} records`);
        assert.equal(plan.counts.recordsLeftOut, referee.length, `campaign ${index} records left out`);

        const liveEntries = source.journal.filter((row) => !row.deleted);
        const shownEntries = liveEntries.filter((row) => row.visibility !== 'referee');
        const refereeEntries = liveEntries.filter((row) => row.visibility === 'referee');
        assert.deepEqual(plan.entries.map((row) => row.id).sort(), shownEntries.map((row) => row.id).sort(), `campaign ${index} entries`);
        assert.equal(plan.counts.entriesLeftOut, refereeEntries.length, `campaign ${index} entries left out`);
        assert.equal(plan.leftOut, referee.length + refereeEntries.length, `campaign ${index} left out`);

        const kept = new Set(players.map((row) => row.id));
        const liveLinks = source.links.filter((row) => !row.deleted);
        const shownLinks = liveLinks.filter((row) => kept.has(row.from) && kept.has(row.to));
        const hiddenLinks = liveLinks.filter((row) => !kept.has(row.from) || !kept.has(row.to));
        assert.equal(plan.counts.linksLeftOut, hiddenLinks.length, `campaign ${index} links left out`);
        assert.deepEqual(
            plan.links.map((row) => row.fromId + '>' + row.toId).sort(),
            shownLinks.map((row) => row.from + '>' + row.to).sort(),
            `campaign ${index} links`,
        );

        const packed = JSON.stringify(plan);
        assert.equal(packed.includes(INTERIOR), false, `campaign ${index} passage`);
        assert.equal(packed.includes(':::referee'), false, `campaign ${index} fence`);
        assert.equal(packed.includes('fuelMark'), false, `campaign ${index} mark`);
        for (const row of referee) {
            assert.equal(packed.includes(row.id), false, `campaign ${index} ${row.id}`);
            for (const hash of hashesOf(row.images)) assert.equal(packed.includes(hash), false, `campaign ${index} hash`);
            const lines = row.status && row.status.ledger ? row.status.ledger : [];
            for (const line of lines) assert.equal(packed.includes(line.memo), false, `campaign ${index} ${line.memo}`);
        }
        for (const row of refereeEntries) {
            for (const hash of hashesOf(row.images)) assert.equal(packed.includes(hash), false, `campaign ${index} entry hash`);
        }

        const view = playersView({
            records: source.records,
            links: source.links,
            journal: source.journal,
            settings: source.settings,
            clock: source.clock,
        });
        resetCampaign();
        campaign.status = 'ready';
        campaign.role = 'owner';
        campaign.universeId = 'uni-open';
        for (const row of source.records) campaign.records[row.id] = row;
        for (const row of source.links) campaign.links[row.id] = row;
        for (const row of source.journal) campaign.journal[row.id] = row;
        applyPlayersPage({
            records: view.records,
            links: view.links,
            journal: view.journal,
            settings: view.settings,
            clock: view.clock,
            seq: 4,
            done: true,
            visible: {
                records: view.records.map((row) => row.id),
                links: view.links.map((row) => row.id),
                journal: view.journal.map((row) => row.id),
            },
        });
        assert.deepEqual(Object.keys(campaign.records).sort(), view.records.map((row) => row.id).sort());
        assert.deepEqual(Object.keys(campaign.links).sort(), view.links.map((row) => row.id).sort());
        assert.deepEqual(Object.keys(campaign.journal).sort(), view.journal.map((row) => row.id).sort());
        for (const row of view.records) {
            assert.equal(campaign.records[row.id].rev, 0);
            assert.equal(campaign.records[row.id].provenance, null);
            const { rev: _rev, provenance: _provenance, ...rest } = campaign.records[row.id];
            assert.deepEqual(rest, row);
        }
        for (const row of view.links) {
            assert.equal(campaign.links[row.id].rev, 0);
            assert.equal(campaign.links[row.id].provenance, null);
            const { rev: _rev, provenance: _provenance, ...rest } = campaign.links[row.id];
            assert.deepEqual(rest, row);
        }
        for (const row of view.journal) {
            const { rev: _rev, ...rest } = campaign.journal[row.id];
            assert.equal(_rev, 0);
            assert.deepEqual(rest, row);
        }
        assert.equal(campaign.seq, 4);
        if (view.clock) assert.deepEqual(campaign.clock, { days: view.clock.days, rev: 0 });
        else assert.equal(campaign.clock, null);
        if (view.settings) {
            const { rev, ...rest } = campaign.settings;
            assert.equal(rev, 0);
            assert.deepEqual(rest, view.settings);
        }
    }
    resetCampaign();
});
