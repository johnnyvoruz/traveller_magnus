/**
 * The store's filter column (prompts/d_store_2.md item 2, workspace/market/filters.ts): the query
 * read and written, OR within a section and AND across, counts that leave out their own section,
 * the active chips, the results line, and the featured row's truthful heading. A choice never
 * vanishes under the pointer (prompts/d_store_harden.md item 2): at a count of 0 it stays, dimmed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    activeCount, activeFilters, applyFilters, facets, filterQuery, NO_FILTERS, readFilters, remember, resultsWords, TAGS_SHOWN, toggle,
} from '../../apps/web/src/workspace/market/filters.ts';
import { featured } from '../../apps/web/src/workspace/market/storefront.ts';

const NOW = Date.parse('2026-10-15T12:00:00.000Z');
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

function card(id, over = {}) {
    return {
        id, title: id, authorHandle: 'traveller_voyage', kind: 'system', truthVersion: 'v10', edition: 'MgT2E', hexCount: 1, tags: [],
        latestVersion: 1, installs: 0, updatedAt: daysAgo(1), hidden: false, cover: null, ...over,
    };
}

const CARDS = [
    card('a', { kind: 'sector piece', hexCount: 6, tags: ['Regina', 'example'], updatedAt: daysAgo(2) }),
    card('b', { kind: 'system', tags: ['Regina'], updatedAt: daysAgo(10) }),
    card('c', { kind: 'ships', hexCount: 5, tags: ['traders'], authorHandle: 'varn', edition: 'CE', updatedAt: daysAgo(40) }),
    card('d', { kind: 'patrons', hexCount: 0, tags: ['example'], updatedAt: daysAgo(3) }),
    card('e', { kind: 'people', tags: ['example'], updatedAt: daysAgo(20) }),
];

test('the query: lists as repeated keys, one choice as a string, an old ?kind= of any text as its family', () => {
    const f = readFilters({ kind: ['ship', 'map'], tag: 'Regina', edition: ['CE', 'CE', ' '], updated: '30', by: 'varn', contents: ['records', 'nonsense'] });
    assert.deepEqual(f, { kinds: ['map', 'ship'], contents: ['records'], editions: ['CE'], tags: ['Regina'], updated: '30', by: ['varn'] });
    assert.deepEqual(filterQuery(f), { kind: ['map', 'ship'], contents: 'records', edition: 'CE', tag: 'Regina', by: 'varn', updated: '30' });
    // A link from before the column: ?kind=sector%20piece is the Maps family.
    assert.deepEqual(readFilters({ kind: 'sector piece' }).kinds, ['map']);
    assert.deepEqual(readFilters({ updated: '90' }).updated, '');
    assert.deepEqual(filterQuery(NO_FILTERS), {});
    assert.deepEqual(readFilters(filterQuery(f)), f);
});

test('OR within a section, AND across sections', () => {
    const maps = readFilters({ kind: ['map', 'ship'] });
    assert.deepEqual(applyFilters(CARDS, maps, NOW).map((c) => c.id), ['a', 'c']);
    const and = readFilters({ kind: ['map', 'ship'], tag: 'Regina' });
    assert.deepEqual(applyFilters(CARDS, and, NOW).map((c) => c.id), ['a']);
    assert.deepEqual(applyFilters(CARDS, readFilters({ contents: 'records' }), NOW).map((c) => c.id), ['d']);
    assert.deepEqual(applyFilters(CARDS, readFilters({ contents: 'hexes' }), NOW).map((c) => c.id), ['a', 'b', 'c', 'e']);
    assert.deepEqual(applyFilters(CARDS, readFilters({ updated: '7' }), NOW).map((c) => c.id), ['a', 'd']);
    assert.deepEqual(applyFilters(CARDS, readFilters({ by: 'varn' }), NOW).map((c) => c.id), ['c']);
    assert.deepEqual(applyFilters(CARDS, readFilters({ edition: 'MgT2E', tag: ['traders', 'Regina'] }), NOW).map((c) => c.id), ['a', 'b']);
});

test('a section counts over what the other sections let through, so a count is what ticking it shows', () => {
    const f = readFilters({ kind: 'map', tag: 'example' });
    const got = facets(CARDS, f, NOW);
    // Kind leaves out Kind: the example-tagged cards are a (map), d (patrons), e (people). The other
    // kinds the loaded cards have stay listed, dimmed at 0.
    assert.deepEqual(got.kinds.map((x) => [x.value, x.count, x.on, x.dim]), [['map', 1, true, false], ['system', 0, false, true], ['ship', 0, false, true], ['people', 1, false, false], ['patrons', 1, false, false]]);
    // Tags leave out Tags: only a is a map; its tags are Regina and example. traders stays, dimmed.
    assert.deepEqual(got.tags.map((x) => [x.value, x.count, x.on, x.dim]), [['example', 1, true, false], ['Regina', 1, false, false], ['traders', 0, false, true]]);
    // Updated: over the map with the example tag.
    assert.deepEqual(got.updated.map((x) => [x.words, x.count, x.on]), [['Last 7 days', 1, false], ['Last 30 days', 1, false], ['Any time', 1, true]]);
});

test('a section shows when a loaded card has a value for it; Publisher with one publisher too', () => {
    const all = facets(CARDS, NO_FILTERS, NOW);
    assert.deepEqual(all.contents.map((x) => [x.words, x.count]), [['Has map hexes', 4], ['Records only', 1]]);
    assert.deepEqual(all.by.map((x) => [x.words, x.count]), [['@traveller_voyage', 4], ['@varn', 1]]);
    assert.deepEqual(all.editions.map((x) => [x.value, x.count]), [['MgT2E', 4], ['CE', 1]]);
    const mapsOnly = CARDS.filter((c) => c.hexCount > 0 && c.authorHandle === 'traveller_voyage');
    const some = facets(mapsOnly, NO_FILTERS, NOW);
    assert.deepEqual(some.contents.map((x) => x.words), ['Has map hexes']);
    // A package page's author link filters by publisher, so the section is there with one handle.
    assert.deepEqual(some.by.map((x) => [x.words, x.count]), [['@traveller_voyage', 3]]);
});

test('what the column listed this visit stays listed, dimmed at 0, in its place', () => {
    const seen = remember({}, facets(CARDS, NO_FILTERS, NOW));
    assert.deepEqual(seen.tags, ['example', 'Regina', 'traders']);
    assert.equal(remember(seen, facets(CARDS, NO_FILTERS, NOW)), seen, 'nothing new: the same object');
    // A new search loads only b: what was listed before stays, at 0.
    const narrow = facets([CARDS[1]], NO_FILTERS, NOW, seen);
    assert.deepEqual(narrow.contents.map((x) => [x.value, x.count, x.dim]), [['hexes', 1, false], ['records', 0, true]]);
    assert.deepEqual(narrow.tags.map((x) => [x.value, x.count, x.dim]), [['Regina', 1, false], ['example', 0, true], ['traders', 0, true]]);
    assert.deepEqual(narrow.kinds.map((x) => x.value), ['system', 'map', 'ship', 'people', 'patrons']);
    // Ticking never reorders a list: the order is the loaded cards', not the counts'.
    const ticked = facets(CARDS, readFilters({ kind: 'people' }), NOW, seen);
    assert.deepEqual(ticked.tags.map((x) => x.value), ['example', 'Regina', 'traders']);
});

test('tags rank by use; a choice that is on stays listed at a count of 0', () => {
    const many = Array.from({ length: 14 }, (_, i) => card('t' + i, { tags: ['common', 'tag' + String(i).padStart(2, '0')] }));
    const got = facets(many, NO_FILTERS, NOW);
    assert.equal(got.tags[0].value, 'common');
    assert.equal(got.tags.length, 15);
    assert.ok(got.tags.length > TAGS_SHOWN);
    const gone = facets(CARDS, readFilters({ kind: 'ship', edition: 'MgT2E' }), NOW);
    assert.deepEqual(gone.kinds.find((x) => x.value === 'ship'), { value: 'ship', words: 'Ships', count: 0, on: true, dim: false });
});

test('toggle adds and removes; Updated is one of three', () => {
    let f = toggle(NO_FILTERS, 'kinds', 'ship');
    f = toggle(f, 'kinds', 'map');
    assert.deepEqual(f.kinds, ['map', 'ship']);
    f = toggle(f, 'kinds', 'ship');
    assert.deepEqual(f.kinds, ['map']);
    f = toggle(f, 'updated', '7');
    assert.equal(f.updated, '7');
    f = toggle(f, 'updated', '');
    assert.equal(f.updated, '');
    f = toggle(toggle(f, 'tags', 'Regina'), 'by', 'varn');
    assert.equal(activeCount(f), 3);
    assert.deepEqual(activeFilters({ ...f, updated: '30', editions: ['CE'], contents: ['records'] }).map((x) => x.words), [
        'Maps', 'Records only', 'Edition: CE', 'Tag: Regina', 'Updated: Last 30 days', 'By @varn',
    ]);
});

test('the results line', () => {
    assert.equal(resultsWords(24, 31, false, 'regina'), '1–24 of 31 results for “regina”');
    assert.equal(resultsWords(7, 7, false, ''), '7 results');
    assert.equal(resultsWords(1, 1, false, ''), '1 result');
    assert.equal(resultsWords(24, 100, true, ''), '1–24 of at least 100 results');
    assert.equal(resultsWords(0, 0, false, 'zzz'), 'No results for “zzz”');
});

test('the featured row says what it is: Most imported only when something was imported, else New in the store', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => card(id, { updatedAt: daysAgo(i) }));
    const fresh = featured(six);
    assert.equal(fresh.heading, 'New in the store');
    assert.deepEqual(fresh.cards.map((c) => c.id), ['a', 'b', 'c']);
    const imported = featured(six.map((c) => (c.id === 'e' ? { ...c, installs: 2 } : c)));
    assert.equal(imported.heading, 'Most imported');
    assert.deepEqual(imported.cards.map((c) => c.id), ['e', 'a', 'b']);
    assert.deepEqual(featured(six.slice(0, 5)), { heading: '', cards: [] });
});
