/**
 * AQ4 round 2. The AI snapshot of a campaign, pasted back through pastedBatch.
 * The paste cases live in tests/web/fixtures/ai_snapshot/ai_paste_cases.json.
 * directives/contracts/ai_paste_cases.json is not in the tree.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiSnapshot } from '../../apps/web/src/campaign/ai_snapshot.ts';
import { findBlock, pastedBatch } from '../../apps/web/src/campaign/proposals.ts';
import { buildCampaigns } from './roundtrip_campaign.js';

const cases = JSON.parse(readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures/ai_snapshot/ai_paste_cases.json'),
    'utf8',
));
const notJson = cases.find((item) => item.expect && item.expect.code === 'not_json');

test('twenty snapshots pasted back propose nothing', () => {
    assert.ok(notJson, 'the paste cases name a block that is not JSON');
    const built = buildCampaigns('aq4-round-2-snapshot', 20);
    assert.equal(built.length, 20);
    for (const [index, item] of built.entries()) {
        const text = aiSnapshot(item.campaign, {
            universeId: item.campaign.universe.id,
            origin: 'https://traveller.voyage',
            parts: 'all',
        });
        const found = findBlock(text);
        assert.ok(found, `campaign ${index} has a json fence`);
        assert.equal(found.from, 'block');
        assert.equal(found.json.includes('"format": "voyage-proposals"'), true);
        assert.equal(found.json.includes('[ ... ]'), true);
        const pasted = pastedBatch(text);
        assert.equal(pasted.ok, false, `campaign ${index}`);
        assert.equal(pasted.code, notJson.expect.code, `campaign ${index}`);
        assert.deepEqual(pasted.problems, notJson.expect.problems, `campaign ${index}`);
        assert.deepEqual(pasted.sentences, notJson.expect.sentences, `campaign ${index}`);
        assert.equal(pasted.batch, undefined, `campaign ${index}`);
    }
});
