/**
 * Records-only packages on the screens (prompts/d_store_3.md item 1; contract F18) and the
 * featured row left out of the grid (item 2): the card's facts, the page without the hex box,
 * import with no placement and the dropped-anchors sentence, Publish records from the records
 * list, and the grid without repeats.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { formProblems, kindOfRecords, NEEDS_ONE } from '../../apps/web/src/workspace/market/market.ts';
import { anchorsDroppedWords, previewLine } from '../../apps/web/src/workspace/market/place.ts';
import { cardFacts, featured, sizeWords, withoutFeatured } from '../../apps/web/src/workspace/market/storefront.ts';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');

test('a records-only card names its records, never "0 hexes"', () => {
    assert.equal(cardFacts({ kind: 'people', hexCount: 0, installs: 2 }), 'People · Records only · 2 imports');
    assert.equal(cardFacts({ kind: 'people', hexCount: 0, installs: 1, recordCount: 12 }), 'People · 12 records · 1 import');
    assert.equal(cardFacts({ kind: 'sector', hexCount: 40, installs: 0 }), 'Sector · 40 hexes · 0 imports');
    assert.equal(sizeWords(1), '1 hex');
    assert.equal(sizeWords(0, 1), '1 record');
    assert.equal(sizeWords(0, null), 'Records only');
});

test('the product page hides the hex box and shows the record count in its place', () => {
    const page = read('workspace/market/ProductPage.vue');
    assert.match(page, /<div v-if="page\.hexCount === 0" class="mk-inside-hexes is-records" data-records-only>\s*<p class="mk-inside-line"><b>\{\{ recordsInside \}\}<\/b><\/p>/);
    assert.match(page, /<div v-else class="mk-inside-hexes">\s*<p class="mk-inside-line"><b>\{\{ hexesInside\(/);
    assert.match(page, /const parts = p\.hexCount > 0 \? \[plural\(p\.hexCount, 'hex', 'hexes'\)\] : \[\];/);
});

test('import: the preview line and the dropped anchors, said before the install', () => {
    const preview = (hexes, records) => ({ hexes, sectorsCreated: [], conflicts: 0, records: { add: 0, replace: 0, conflicts: [], ...records } });
    assert.equal(previewLine(preview([], { add: 12 })), '12 records.');
    assert.equal(previewLine(preview([], { add: 0 })), '0 hexes.');
    assert.equal(anchorsDroppedWords(preview([], { anchorsDropped: 2 })), '2 records lose their place on the map.');
    assert.equal(anchorsDroppedWords(preview([], { anchorsDropped: 1 })), '1 record loses its place on the map.');
    assert.equal(anchorsDroppedWords(preview([], { anchorsDropped: 0 })), '');
    assert.equal(anchorsDroppedWords(preview([], {})), '', 'an older server sends no count: none');
    const panel = read('workspace/market/ImportPanel.vue');
    assert.match(panel, /const recordsOnly = computed\(\(\) => props\.page\.hexCount === 0\);/);
    assert.match(panel, /if \(props\.updateId \|\| recordsOnly\.value \|\| mode\.value !== 'place'\) return null;/, 'no placement is ever sent');
    assert.match(panel, /<div v-if="!updateId && !recordsOnly" class="ui-seg" role="group" aria-label="Where it goes">/);
    assert.match(panel, /<p v-if="dropped" class="mk-imp-dropped" role="status" data-anchors-dropped>\{\{ dropped \}\}<\/p>/);
    assert.ok(panel.indexOf('data-anchors-dropped') < panel.indexOf('@click="confirmImport()"'), 'before the Import button');
});

test('Publish records: at least one record, no hexes asked for, the kind from the records', () => {
    const base = { isNew: true, title: 'Cast', kind: 'people', description: '', tags: [], hexes: 0 };
    assert.deepEqual(formProblems({ ...base, records: 0, from: 'records' }), [{ field: 'records', text: NEEDS_ONE }]);
    assert.equal(NEEDS_ONE, 'A package needs at least one hex or one record.');
    assert.deepEqual(formProblems({ ...base, records: 3, from: 'records' }), []);
    assert.deepEqual(formProblems({ ...base, records: 501, from: 'records' }).map((item) => item.field), ['records']);
    assert.equal(formProblems({ ...base, records: 3 })[0].field, 'hexes', 'from Build, hexes are still asked for');
    assert.equal(kindOfRecords(['person', 'person']), 'people');
    assert.equal(kindOfRecords(['vessel']), 'ships');
    assert.equal(kindOfRecords(['person', 'vessel']), 'records');
    assert.equal(kindOfRecords([]), 'records');
    const dialog = read('workspace/market/RecordsPublish.vue');
    assert.match(dialog, /const path = await publish\(universe, \[\], chosen\.value\.map\(\(record\) => record\.id\)\);/);
    assert.match(dialog, /<PublishFields :problems="problems" :tried="tried" \/>/);
    assert.match(dialog, /<p v-if="marketUi\.error" class="mk-err" role="alert">\{\{ marketUi\.error \}\}<\/p>/, 'the server\'s sentence as written');
    const form = read('workspace/market/PublishForm.vue');
    assert.match(form, /<PublishFields :problems="problems" :tried="tried" \/>/, 'Build asks the same way');
    const list = read('workspace/CampaignList.vue');
    assert.match(list, /<button v-if="canPublish" type="button" class="ui-btn camp-publish"[^>]*data-publish-records @click="publishing = true">/);
    assert.match(list, /<RecordsPublish v-if="publishing" :start="publishStart" @close="publishing = false" \/>/);
    // The owner test moved out of the list into the gate it shares with a record's own page (ZB1).
    assert.match(list, /canPublishRecords\(props\.readOnly, all\.value\.length\)/);
    assert.match(read('workspace/market/market.ts'), /row\.ownerId !== session\.user\.id/);
});

test('the featured row is left out of the grid; the results line counts every result', () => {
    const card = (id, at) => ({ id, title: id, updatedAt: at, installs: 0 });
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => card(id, '2026-10-0' + (i + 1) + 'T00:00:00Z'));
    const row = featured(cards);
    assert.deepEqual(row.cards.map((item) => item.id), ['f', 'e', 'd']);
    assert.deepEqual(withoutFeatured(cards, row.cards).map((item) => item.id), ['a', 'b', 'c']);
    assert.deepEqual(withoutFeatured(cards, []).map((item) => item.id), ['a', 'b', 'c', 'd', 'e', 'f'], 'no row: the grid shows everything');
    const view = read('workspace/market/PackagesView.vue');
    assert.match(view, /const gridCards = computed\(\(\) => withoutFeatured\(matching\.value, featuredRow\.value\.cards\)\);/);
    assert.match(view, /const shown = computed\(\(\) => gridCards\.value\.slice\(0, pageCount\.value\)\);/);
    assert.match(view, /resultsWords\(shown\.value\.length \+ featuredRow\.value\.cards\.length, matching\.value\.length,/);
});
