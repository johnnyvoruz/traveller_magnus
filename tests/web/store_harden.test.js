/**
 * The marketplace hardened (prompts/d_store_harden.md): the store in the app's frame, filters that
 * hold still, the manifesto's rules, Publish from the store, and the version videos' look. The
 * browser measurements are findings/storefront/steady.log; these read the sources and run the
 * pure parts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { nextTick } from 'vue';
import { session } from '../../apps/web/src/account/session.ts';
import { byPath, kindPath, tagPath } from '../../apps/web/src/workspace/market/market.ts';
import { MARKETPLACE_PATH, offerMarketplace, offerMyPackages, publishAsk } from '../../apps/web/src/workspace/market/command.ts';
import { backToResults, easeOut, tokenMs } from '../../apps/web/src/workspace/market/steady.ts';
import { dateWords, isNew } from '../../apps/web/src/workspace/market/storefront.ts';

const read = (rel) => readFileSync(new URL('../../apps/web/src/' + rel, import.meta.url), 'utf8');
const store = read('workspace/market/PackagesView.vue');

test('item 1: the store renders in the app frame, the rail marking Marketplace', () => {
    assert.match(store, /<Rail\s[\s\S]*?market-open\s*\/>/);
    assert.match(store, /<AccountMenu :open="accountOpen"/);
    assert.doesNotMatch(store, /<Icon name="arrow-left"[^>]*\/>Map<\/RouterLink>/, 'no Map button of the store\'s own');
    // The rail's items run commands: the store registers the ones the map would.
    for (const id of ['home', 'account', 'campaign', 'build']) assert.match(store, new RegExp(`registerCommand\\(\\{ id: '${id}'`), id);
    // Build is on the store's rail for anyone signed in, as on the map (DF4): no wait on a campaign.
    assert.match(store, /const buildOffered = computed\(\(\) => session\.user !== null\);/);
    const rail = read('shell/Rail.vue');
    assert.match(rail, /marketOpen\?: boolean;/);
    assert.match(rail, /:aria-current="marketOpen \? 'page' : undefined"/);
    assert.match(rail, /\.rail-item\[aria-current="page"\] \{/);
});

test('item 2: a filter, chip or sort replaces the entry; a search pushes', () => {
    assert.match(store, /void \(push && !sheetOpen\.value \? router\.push\(to\) : router\.replace\(to\)\);/);
    assert.match(store, /function search\(\): void \{\s*go\(\{ q: q\.value \}, true\);/);
    assert.match(store, /function pick\(key: FilterKey, value: string\): void \{\s*go\(\{ filters: toggle\(filters\.value, key, value\) \}\);/);
    assert.match(store, /<select v-model="sort" class="mk-box" @change="go\(\{ sort \}\)">/);
    // The Filters sheet is a push, so Back closes it.
    assert.match(store, /function openSheet\(\): void \{\s*sheetPushed = true;\s*void router\.push\(/);
});

test('item 2: the results hold their height through a change and never clamp the scroller', () => {
    assert.match(store, /if \(next !== resultsKey\.value\) holdResults\(\);/);
    assert.match(store, /:style="heldHeight \? \{ minHeight: heldHeight \+ 'px' \} : undefined"/);
    assert.match(store, /\.mk-results \{\n  min-width: 0;\n  min-height: 100vh;/);
    assert.match(store, /else glide\(el, to, releaseResults\);/);
    assert.match(store, /if \(resultsBody\.value\) dissolve\(resultsBody\.value\);/);
    // The imports left the storefront for My packages.
    assert.match(store, /<ImportsList v-if="session\.user && mineView" \/>/);
});

test('item 2: the glide goes back to the results only when their top has left the window', () => {
    assert.equal(backToResults(300, 40, 0, 12), null, 'in view: no glide');
    assert.equal(backToResults(300, -150, 0, 12), 138);
    assert.equal(backToResults(10, -150, 0, 12), 0, 'never above the top');
    assert.equal(tokenMs('300ms'), 300);
    assert.equal(tokenMs(' 0.45s'), 450);
    assert.equal(tokenMs(''), 0);
    assert.equal(easeOut(0), 0);
    assert.equal(easeOut(1), 1);
    assert.ok(easeOut(0.5) > 0.5, 'eases out');
});

test('item 3: every name is a link to the store filtered by it', () => {
    assert.equal(kindPath('people'), '/packages?kind=people');
    assert.equal(byPath('traveller_voyage'), '/packages?by=traveller_voyage');
    assert.equal(tagPath('Spinward Marches'), '/packages?tag=Spinward%20Marches');
    const card = read('workspace/market/StoreCard.vue');
    assert.match(card, /<RouterLink class="mk-card-title mk-card-link" :to="packagePath\(card\.id\)">/);
    assert.match(card, /<RouterLink class="mk-badge" :to="kindPath\(cover\.family\)"/);
    assert.match(card, /<RouterLink class="mk-card-by" :to="byPath\(card\.authorHandle\)">/);
    assert.match(card, /\.mk-card:has\(\.mk-card-link:focus-visible\) \{\n  outline: 2px solid var\(--focus-ring\);/);
    const page = read('workspace/market/ProductPage.vue');
    assert.match(page, /<nav class="mk-crumbs" aria-label="Breadcrumb">\s*<RouterLink to="\/packages">Marketplace<\/RouterLink>\s*<span aria-hidden="true">\/<\/span>\s*<RouterLink :to="kindPath\(family\)">/);
    assert.match(page, /by <RouterLink :to="byPath\(page\.authorHandle\)">/);
    assert.match(page, /:to="tagPath\(t\)"/);
});

test('item 3: confirmations go through the one toast; the publish forms use the store\'s fine print', () => {
    for (const file of ['ProductPage.vue', 'ImportsList.vue']) {
        const text = read('workspace/market/' + file);
        assert.match(text, /showToast\(/, file);
        assert.doesNotMatch(text, /said\.value =/, file);
    }
    for (const file of ['PublishForm.vue', 'RecordsPublish.vue']) {
        const text = read('workspace/market/' + file);
        assert.match(text, /<p class="mk-fine">A package holds up to/, file);
        assert.doesNotMatch(text, /build-fine/, file);
    }
});

test('item 3: the command palette has Open the Marketplace, My packages and Publish records', async () => {
    const names = [];
    const register = (command) => { names.push(command.name); return () => { names.splice(names.indexOf(command.name), 1); }; };
    offerMarketplace(register);
    assert.deepEqual(names, ['Open the Marketplace']);
    assert.equal(MARKETPLACE_PATH, '/packages');
    session.user = null;
    offerMyPackages(register);
    assert.deepEqual(names, ['Open the Marketplace']);
    session.user = { id: 'me', email: null, role: 'user', profile: { handle: 'varn' } };
    await nextTick();
    assert.deepEqual(names, ['Open the Marketplace', 'My packages', 'Publish records']);
    session.user = null;
    await nextTick();
    assert.deepEqual(names, ['Open the Marketplace']);
    assert.equal(publishAsk.records, false);
    // The records list takes the ask once the campaign is open.
    assert.match(read('workspace/CampaignList.vue'), /watch\(\(\) => \[publishAsk\.records, campaign\.status\] as const/);
    // Publish selection is Build's, with Build on and a selection.
    assert.match(read('workspace/build/commands.ts'), /\{ id: 'build-publish', name: 'Publish selection…' \}/);
});

test('item 3: the first paint holds the page: placeholders for the grid, the featured frame and Browse by kind', () => {
    assert.match(store, /<template v-if="firstLoad && plainStore">\s*<section class="mk-featured ui-frame is-ghost" aria-hidden="true">/);
    assert.match(store, /<ul v-if="firstLoad" class="mk-grid" aria-busy="true" aria-label="Loading packages">/);
    // Covers have their size.
    assert.match(read('workspace/market/StoreCard.vue'), /<img :src="cover\.thumb" alt="" loading="lazy" decoding="async" width="640" height="360">/);
});

test('item 4: Publish in the store\'s header opens the chooser in the shared modal frame', () => {
    assert.match(store, /<button v-if="!visitor" type="button" class="ui-btn is-primary" :class="\{ 'is-unknown': !ready \}" aria-haspopup="dialog" data-publish @click="openChooser\(\)">/);
    // DS9: signed out it is "Sign in to publish", at the end of the row, and signs in.
    assert.match(store, /<button v-else type="button" class="ui-btn" data-publish-sign-in @click="chooserSignIn\(\)">Sign in to publish<\/button>/);
    assert.match(store, /const visitor = computed\(\(\) => ready\.value && !session\.user\);/);
    assert.doesNotMatch(store, />Publish a package</);
    const chooser = read('workspace/market/PublishChooser.vue');
    assert.match(chooser, /<div class="ui-modal mk-choose" role="dialog" aria-modal="true"/);
    assert.match(chooser, /data-way="records"[\s\S]*Publish records from your campaign\./);
    assert.match(chooser, /data-way="hexes"[\s\S]*Publish part of your map, with its records\./);
    // Records, or Map hexes, can't be taken signed out: one sentence says what to do first.
    assert.match(store, /sayFirst\('Sign in first: records are published from your own campaign\.', true\)/);
    assert.match(store, /if \(!build\.on\) setBuildOn\(true\);\s*build\.selecting = true;/);
    // The empty store names both ways.
    assert.equal((store.match(/Publish records from your campaign \(people, ships, organizations\), or part of your map \(systems, a subsector, a sector\)\./g) || []).length, 2);
});

test('item 5: the version videos\' look, from the shared pieces', () => {
    assert.match(store, /<span class="ui-brand" aria-hidden="true">Traveller<span class="ui-brand-dot">\.<\/span>voyage<\/span>/);
    assert.match(store, /<div class="ui-ground mk-ground" aria-hidden="true"><\/div>/);
    assert.match(store, /<div class="ui-rule mk-title-rule" aria-hidden="true"><\/div>/);
    assert.match(store, /class="mk-featured ui-frame" aria-labelledby="mk-featured-h">\s*<h2 id="mk-featured-h" class="ui-frame-label">/);
    assert.match(read('workspace/market/StoreFilters.vue'), /<h2 class="mk-fhead ui-kicker">Tags<\/h2>/);
    const page = read('workspace/market/ProductPage.vue');
    assert.match(page, /<span v-if="isNew\(page\.updatedAt, now\)" class="ui-new">New<\/span>/);
    assert.match(page, /<time class="ui-date" :datetime="page\.updatedAt"/);
    assert.match(page, /class="mk-sec mk-inside-frame ui-frame"/);
    assert.match(read('workspace/market/ImportPanel.vue'), /<section class="mk-imp ui-frame"/);
    assert.match(read('design/tokens.css'), /--ease-video: cubic-bezier\(0\.33, 1, 0\.68, 1\);/);
});

test('item 5: the date box and the NEW tag', () => {
    assert.equal(dateWords('2026-10-15T23:30:00.000Z'), 'October 15, 2026');
    assert.equal(dateWords('nonsense'), '');
    const now = Date.parse('2026-10-17T12:00:00.000Z');
    assert.equal(isNew('2026-10-11T12:00:00.000Z', now), true);
    assert.equal(isNew('2026-10-09T12:00:00.000Z', now), false);
    assert.equal(isNew('', now), false);
});
