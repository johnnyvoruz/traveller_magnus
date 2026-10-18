/**
 * Empty states that teach (stream E, EU12): a search with no packages, and a dossier system with
 * no records of yours, use the shared empty card. The store's other empties stay in its frame.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel) => readFileSync(new URL('../../apps/web/src/' + rel, import.meta.url), 'utf8');

test('a store search with no match is the shared empty card', () => {
    const store = read('workspace/market/PackagesView.vue');
    assert.match(store, /v-else-if="!shown\.length && filtered" class="camp-first ui-ground"/);
    assert.match(store, /<h2>No packages match<\/h2>\s*<p>Try fewer filters, or search with other words\.<\/p>/);
    assert.match(store, /@click="clearFilters\(\)">Clear all<\/button>/);
});

test('a records list with nothing to show is the shared empty card', () => {
    const list = read('workspace/CampaignList.vue');
    assert.match(list, /v-else-if="query" class="camp-first ui-ground"/);
    assert.match(list, /<h2>No records match<\/h2>/);
    assert.match(list, /Clear the search/);
    assert.match(list, /v-else-if="atHere && here" class="camp-first ui-ground"/);
    assert.match(list, /Show every record/);
    assert.match(list, /Add one\. It stays in your campaign\./);
    assert.doesNotMatch(list, /class="camp-empty"/);
    assert.doesNotMatch(list, /\.camp-empty/);
});

test('the timeline, a missing record, and a journal list use the shared empty card', () => {
    const timeline = read('workspace/TimelineList.vue');
    assert.match(timeline, /v-if="model\.count === 0" class="camp-first ui-ground"/);
    assert.match(timeline, /No campaign date yet/);
    assert.match(timeline, /Nothing on the timeline yet/);
    assert.match(timeline, /Nothing on the timeline matches/);
    assert.match(timeline, /Choose All types, or turn off Only this ship\./);
    assert.doesNotMatch(timeline, /class="camp-empty"/);

    const page = read('workspace/RecordPage.vue');
    assert.match(page, /v-else class="camp-first ui-ground"/);
    assert.match(page, /This record was deleted/);
    assert.match(page, /You can put it back\./);
    assert.match(page, /This record is gone/);
    assert.match(page, /It is not in this campaign\./);
    assert.match(page, /Undo the delete/);
    assert.doesNotMatch(page, /class="camp-empty"/);

    const journal = read('workspace/journal/JournalList.vue');
    assert.match(journal, /<h2>No entries match<\/h2>/);
    assert.match(journal, /Clear the search/);
    assert.match(journal, /Add one\. It stays in your campaign\./);
    assert.match(journal, /Nothing of yours here/);
    assert.match(journal, /Show every entry/);
    assert.doesNotMatch(journal, /class="jn-none"/);
    assert.doesNotMatch(journal, /class="camp-empty"/);
});

test('a dossier with no records of yours is the shared empty card', () => {
    const here = read('workspace/RecordsHere.vue');
    assert.match(here, /class="camp-first ui-ground"/);
    assert.match(here, /<h2>Nothing of yours here yet<\/h2>/);
    assert.match(here, /Add a record here\. It stays in your campaign\./);
    assert.match(here, /Add a record on this world\. It stays in your campaign\./);
    assert.match(here, /label="Add a person"/);
    assert.match(here, /class="here-note" role="status">Loading your records\./);
    assert.doesNotMatch(here, /class="here-note">Nothing of yours here yet/);
});
