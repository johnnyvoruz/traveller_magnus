/**
 * The store and the server's filters (streams/D.md D8, contract F2): once the catalogue is bigger than
 * a page, kinds are asked for as `family=` and one publisher as `author=`; while the loaded cards are
 * the whole catalogue the browser filters them and nothing is asked. The kind table is the server's.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PACKAGE_KIND_FAMILIES } from '@voyage/shared';
import { cataloguePath } from '../../apps/web/src/marketplace/catalogue.ts';
import { KIND_FAMILIES, kindFamily } from '../../apps/web/src/marketplace/covers.ts';
import { NO_FILTERS, readFilters, serverNarrowing } from '../../apps/web/src/workspace/market/filters.ts';

test('the catalogue address carries family (repeated) and author', () => {
    assert.equal(cataloguePath({ family: ['people', 'map'], author: ' varn ', sort: 'title' }), '/api/packages?family=people&family=map&author=varn&sort=title');
    assert.equal(cataloguePath({ family: [] }), '/api/packages?sort=updated');
});

test('nothing is asked while the loaded cards are the whole catalogue', () => {
    assert.equal(serverNarrowing(readFilters({ kind: 'people', by: 'varn' }), true), null);
    assert.equal(serverNarrowing(NO_FILTERS, false), null);
});

test('with more on the server, kinds go as family and one publisher as author', () => {
    assert.deepEqual(serverNarrowing(readFilters({ kind: ['people', 'map'] }), false), { family: ['map', 'people'] });
    assert.deepEqual(serverNarrowing(readFilters({ by: 'varn' }), false), { family: [], author: 'varn' });
    assert.deepEqual(serverNarrowing(readFilters({ kind: 'ship', by: 'varn' }), false), { family: ['ship'], author: 'varn' });
    // Two publishers can't be one `author`: they stay in the browser.
    assert.equal(serverNarrowing(readFilters({ by: ['varn', 'kett'] }), false), null);
    // Other sections are the browser's (contents, edition, tag, updated).
    assert.equal(serverNarrowing(readFilters({ tag: 'Regina', edition: 'CE' }), false), null);
});

test('the store\'s families are the server\'s table', () => {
    assert.equal(KIND_FAMILIES, PACKAGE_KIND_FAMILIES);
    assert.equal(kindFamily('Contact map'), 'map', 'first match, as the server\'s family= has it');
    assert.equal(kindFamily('dragons'), 'other');
});

test('the store asks again only when what the catalogue answers for changes', () => {
    const store = readFileSync(new URL('../../apps/web/src/workspace/market/PackagesView.vue', import.meta.url), 'utf8');
    assert.match(store, /watch\(\(\) => JSON\.stringify\(\[packageId\.value, mineView\.value, searched\.value, one\(route\.query\.sort\), one\(route\.query\.hidden\), session\.user \? session\.user\.id : ''\]\), \(\) => \{/);
    assert.match(store, /const narrowing = computed\(\(\) => serverNarrowing\(filters\.value, !nextCursor\.value\)\);/);
    assert.match(store, /const pool = computed\(\(\) => narrowCards\.value \?\? cards\.value\);/);
});
