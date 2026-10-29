/**
 * DF14 (found): a vessel's place line follows its track, the same on the record card, the record
 * page's header, the records list and the relationship web. The helper's rule is RecordCard's; the
 * callers are checked by source.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('one rule: a vessel where its track puts it at the campaign date, under way in the Party tab words', () => {
    const helper = read('workspace/place_now.ts');
    assert.match(helper, /if \(record\.type !== 'vessel'\) return placeLine\(record, campaign\.records\);/);
    assert.match(helper, /const at = vesselWhere\(record, campaign\.records, campaignDays\(campaign\.clock\)\);/);
    assert.match(helper, /return at\.underway \? at\.underway\.text : placeLine\(\{ \.\.\.record, anchor: at\.anchor \}, campaign\.records\);/);
});

test('the header, the list row and the web bar say it; none reads the stored anchor directly', () => {
    assert.match(read('workspace/RecordPage.vue'), /<span>· \{\{ placeNow\(record\) \}\}<\/span>/);
    // DU34: in a grouped list the heading says the kind, so the row says the place alone (records_tab.ts rowMeta).
    assert.match(read('workspace/CampaignList.vue'), /\{\{ rowMeta\(typeInfo\(item\.record\.type\)\.one, placeNow\(item\.record\), grouped\) \}\}/);
    assert.match(read('workspace/web/RelationshipWeb.vue'), /\{\{ placeNow\(pointedRecord\) \}\}/);
    for (const file of ['workspace/RecordPage.vue', 'workspace/CampaignList.vue', 'workspace/web/RelationshipWeb.vue']) {
        assert.doesNotMatch(read(file), /placeLine\(/, file);
    }
});
