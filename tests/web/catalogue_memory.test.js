/**
 * The catalogue seen once (streams/D.md D2): the store keeps each query's last first page for the
 * session, shows it at once on a return, and swaps in the server's fresh answer only when it differs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { differs, forgetCatalogue, keep, keepContents, keepPage, KEPT, memoryKey, recall, recallContents, recallPage, storeSeen } from '../../apps/web/src/workspace/market/catalogue_memory.ts';

const query = (over = {}) => ({ q: '', sort: 'updated', mine: false, hidden: false, user: '', ...over });
const card = (id, over = {}) => ({ id, title: id, authorHandle: 'varn', kind: 'system', truthVersion: 'v10', edition: 'MgT2E', hexCount: 1, tags: [], latestVersion: 1, installs: 0, updatedAt: '2026-10-16T00:00:00.000Z', hidden: false, cover: null, ...over });

test('an answer is kept per query and comes back for the same query only', () => {
    forgetCatalogue();
    keep(query(), { items: [card('a')], nextCursor: null });
    assert.deepEqual(recall(query()).items.map((c) => c.id), ['a']);
    assert.equal(recall(query({ q: 'regina' })), null);
    assert.equal(recall(query({ user: 'me' })), null, 'another account sees its own');
    assert.equal(memoryKey(query({ q: ' regina ' })), memoryKey(query({ q: 'regina' })));
});

test('the kept answer is a copy, and the oldest goes past the cap', () => {
    forgetCatalogue();
    const items = [card('a')];
    keep(query(), { items, nextCursor: null });
    items.push(card('b'));
    assert.equal(recall(query()).items.length, 1);
    for (let i = 0; i < KEPT + 3; i++) keep(query({ q: 'q' + i }), { items: [], nextCursor: null });
    assert.equal(recall(query()), null);
    assert.equal(recall(query({ q: 'q2' })), null);
    assert.ok(recall(query({ q: 'q' + (KEPT + 2) })));
});

test('a fresh answer replaces the kept one only when something shown differs', () => {
    const kept = { items: [card('a'), card('b')], nextCursor: null };
    assert.equal(differs(kept, { items: [card('a'), card('b')], nextCursor: null }), false);
    assert.equal(differs(kept, { items: [card('a'), card('b', { installs: 1 })], nextCursor: null }), true);
    assert.equal(differs(kept, { items: [card('b'), card('a')], nextCursor: null }), true);
    assert.equal(differs(kept, { items: [card('a'), card('b')], nextCursor: 'x' }), true);
});

test('forgetting clears the answers and the session flag', () => {
    keep(query(), { items: [card('a')], nextCursor: null });
    storeSeen.session = true;
    forgetCatalogue();
    assert.equal(recall(query()), null);
    assert.equal(storeSeen.session, false);
});

test('the store paints a kept answer at once and refreshes behind it', () => {
    const store = readFileSync(new URL('../../apps/web/src/workspace/market/PackagesView.vue', import.meta.url), 'utf8');
    assert.match(store, /const ready = ref\(storeSeen\.session\);/);
    assert.match(store, /const remembered = packageId\.value \? null : recall\(catalogueQuery\(\)\);\nconst cards = ref<PackageCard\[\]>\(remembered \? remembered\.items : \[\]\);/);
    // Placeholders only while nothing is shown.
    assert.match(store, /const firstLoad = computed\(\(\) => !cards\.value\.length && \(!ready\.value \|\| loading\.value\)\);/);
    // A fresh answer that differs is swapped in held and settled, as a filter change is.
    assert.match(store, /keep\(query, page\);\n\s*if \(!cardsAre\(page\)\) \{\n\s*if \(cards\.value\.length\) holdResults\(\);/);
    assert.match(store, /if \(!more && !kept\) cards\.value = \[\];/);
});

test('a package\'s page and a version\'s contents are kept for the session (D9)', () => {
    forgetCatalogue();
    assert.equal(recallPage('pk_a'), null);
    keepPage({ id: 'pk_a', title: 'A', latestVersion: 2 });
    assert.equal(recallPage('pk_a').title, 'A');
    keepContents('pk_a', 2, { keys: ['x/0101'], ownSectors: [], records: [] });
    assert.deepEqual(recallContents('pk_a', 2).keys, ['x/0101']);
    assert.equal(recallContents('pk_a', 1), null, 'per version');
    for (let i = 0; i < KEPT + 1; i++) keepPage({ id: 'pk_' + i, title: String(i), latestVersion: 1 });
    assert.equal(recallPage('pk_a'), null, 'the oldest goes past the cap');
    forgetCatalogue();
    assert.equal(recallPage('pk_3'), null);
});

test('the product page paints a kept page at once and reads it again behind', () => {
    const page = readFileSync(new URL('../../apps/web/src/workspace/market/ProductPage.vue', import.meta.url), 'utf8');
    assert.match(page, /const kept = recallPage\(id\);/);
    assert.match(page, /if \(kept\) \{\n\s*page\.value = kept;\n\s*showContents\(id, kept\);/);
    assert.match(page, /loading\.value = !kept;/);
    assert.match(page, /keepPage\(fresh\);/);
    // A failed read keeps a kept page on screen; a 404 clears it.
    assert.match(page, /if \(!kept\) page\.value = null;/);
    // More by: the store's kept catalogue at once, kept again when read.
    assert.match(page, /const keptList = recall\(\{ q: '', sort: 'installs', mine: false, hidden: false, user \}\);/);
    assert.match(page, /keep\(\{ q: '', sort: 'installs', mine: false, hidden: false, user \}, list\);/);
});
