/**
 * AQ4 round 3. The players projection of a mixed campaign.
 * playersView is packages/shared/src/players_view.ts.
 * A link stays when both ends are player-visible. Its own visibility is not the rule
 * (tests/shared/players_view.test.js, "a link's own visibility is not read").
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playersView } from '@voyage/shared';
import { buildCampaigns } from './roundtrip_campaign.js';

const INTERIOR = 'The crate mark stays in this block.';

function hashesOf(images) {
    const found = [];
    if (!images) return found;
    for (const image of images) {
        found.push(image.hash);
        found.push(image.thumbHash);
    }
    return found;
}

function hasOwn(value, key) {
    if (Array.isArray(value)) return value.some((item) => hasOwn(item, key));
    if (value && typeof value === 'object') {
        if (Object.prototype.hasOwnProperty.call(value, key)) return true;
        return Object.values(value).some((item) => hasOwn(item, key));
    }
    return false;
}

test('twenty projections hide the referee set and project once', () => {
    const built = buildCampaigns('aq4-round-3-players', 20);
    assert.equal(built.length, 20);
    let hiddenHashes = 0;
    let shownHashes = 0;
    let hiddenMemos = 0;
    let shownMemos = 0;

    for (const [index, item] of built.entries()) {
        const source = item.campaign;
        const recordVis = new Set(source.records.map((row) => row.visibility));
        assert.equal(recordVis.has('players') && recordVis.has('referee'), true, `campaign ${index} mixes records`);
        const entryVis = new Set(source.journal.map((row) => row.visibility));
        assert.equal(entryVis.has('referee'), true, `campaign ${index} has a referee entry`);
        assert.equal(entryVis.has('players') || entryVis.has('public'), true, `campaign ${index} has a shown entry`);

        const read = {
            records: source.records,
            links: source.links,
            journal: source.journal,
            settings: source.settings,
            clock: source.clock,
        };
        const view = playersView(read);
        const again = playersView(view);
        assert.deepEqual(again, view, `campaign ${index} projects twice`);

        const kept = new Set(source.records.filter((row) => !row.deleted && row.visibility === 'players').map((row) => row.id));
        assert.deepEqual(view.records.map((row) => row.id), source.records.filter((row) => kept.has(row.id)).map((row) => row.id));
        assert.equal(view.records.some((row) => row.visibility !== 'players' || row.deleted), false);

        const keptLinks = source.links.filter((row) => !row.deleted && kept.has(row.from) && kept.has(row.to));
        assert.deepEqual(view.links.map((row) => row.id), keptLinks.map((row) => row.id));
        for (const link of view.links) {
            assert.equal(kept.has(link.from), true);
            assert.equal(kept.has(link.to), true);
        }

        const keptEntries = source.journal.filter((row) => !row.deleted && (row.visibility === 'players' || row.visibility === 'public'));
        assert.deepEqual(view.journal.map((row) => row.id), keptEntries.map((row) => row.id));
        assert.equal(view.journal.some((row) => row.visibility === 'referee' || row.deleted), false);

        const raw = JSON.stringify(view);
        assert.equal(raw.includes(INTERIOR), false, `campaign ${index} passage`);
        assert.equal(raw.includes(':::referee'), false, `campaign ${index} fence`);
        assert.equal(hasOwn(view, 'fuelMark'), false, `campaign ${index} mark`);
        assert.equal(raw.includes(`dropped ${index}`), false, `campaign ${index} tombstone`);

        for (const record of source.records) {
            const hidden = record.deleted || record.visibility !== 'players';
            for (const hash of hashesOf(record.images)) {
                assert.equal(raw.includes(hash), !hidden, `${index} record hash`);
                if (hidden) hiddenHashes += 1;
                else shownHashes += 1;
            }
            const lines = record.status && record.status.ledger ? record.status.ledger : [];
            for (const line of lines) {
                assert.equal(raw.includes(line.memo), !hidden, `${index} ledger ${line.memo}`);
                if (hidden) hiddenMemos += 1;
                else shownMemos += 1;
            }
            if (hidden) assert.equal(raw.includes(record.id), false, `${index} ${record.id}`);
        }
        for (const entry of source.journal) {
            const hidden = entry.deleted || entry.visibility === 'referee';
            for (const hash of hashesOf(entry.images)) {
                assert.equal(raw.includes(hash), !hidden, `${index} entry hash`);
                if (hidden) hiddenHashes += 1;
                else shownHashes += 1;
            }
        }
    }

    assert.equal(hiddenHashes > 0, true);
    assert.equal(shownHashes > 0, true);
    assert.equal(hiddenMemos > 0, true);
    assert.equal(shownMemos > 0, true);
});
