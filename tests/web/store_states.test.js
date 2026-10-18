/**
 * The store's empty, error and slow states (streams/D.md D7): one pattern in the videos' frame (a
 * kicker, one headline, one sentence, one action). A catalogue or a package that could not be read
 * says so in its place with Try again; a refresh that fails while cards are shown is one line over them.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel) => readFileSync(new URL('../../apps/web/src/workspace/market/' + rel, import.meta.url), 'utf8');
const store = read('PackagesView.vue');
const page = read('ProductPage.vue');

test('a catalogue that could not be read says so in the results\' place, with Try again', () => {
    assert.match(store, /<div v-else-if="error" class="ui-frame mk-state is-error" role="alert">\s*<p class="ui-frame-label">Not loaded<\/p>\s*<p class="mk-state-head">\{\{ error \}\}<\/p>/);
    assert.match(store, /<button type="button" class="ui-btn is-primary" :disabled="loading" @click="loadCards\(\)">Try again<\/button>/);
    // While cards are shown, a failed refresh is one line over them.
    assert.match(store, /<p v-if="error && cards\.length" class="mk-err" role="alert">/);
    // No "No results" while nothing could be read.
    assert.match(store, /<template v-if="!firstLoad && !\(error && !cards\.length\)">\{\{ resultsLine \}\}<\/template>/);
});

test('every empty state is the one pattern', () => {
    // A search with no match uses the shared empty card. empty_teach.test.js pins that card.
    for (const kicker of ['My packages', 'The store', 'Hidden']) assert.match(store, new RegExp('<p class="ui-frame-label">' + kicker + '</p>'), kicker);
    assert.doesNotMatch(store, /<p class="ui-frame-label">No match<\/p>/);
    assert.doesNotMatch(store, /class="mk-empty"/);
    const css = read('market.css');
    for (const sel of ['.mk-state {', '.mk-state-head {', '.mk-state-say {', '.mk-state-acts {']) assert.ok(css.includes(sel), sel);
});

test('a package that could not be read, or is gone, says so in the hero\'s place', () => {
    assert.match(page, /<div v-if="error && !page" class="ui-frame mk-state is-error" role="alert">[\s\S]*?@click="load\(\)">Try again<\/button>/);
    assert.match(page, /<div v-if="notFound" class="ui-frame mk-state">\s*<p class="ui-frame-label">Not found<\/p>\s*<p class="mk-state-head">This package is not in the store\.<\/p>/);
    assert.match(page, /<RouterLink class="ui-btn is-primary" to="\/packages">Back to the Marketplace<\/RouterLink>/);
});
