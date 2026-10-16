<script setup lang="ts">
/**
 * The marketplace as a storefront (contracts/b_marketplace.md F2, F3, F17; prompts/d_storefront.md).
 * `/packages` is the catalogue: a featured row of the three most-imported packages, kind chips,
 * search and sort as a store's toolbar, and a grid of product cards with covers. `?mine=1` is the
 * signed-in author's own packages; `?kind=<family>` is a chip; `?tag=` a tag from a page.
 * `/packages/:packageId` is the product page (ProductPage.vue). Signed out, both read.
 * Everything is free: no price, cart or money word anywhere.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Icon from '../../design/Icon.vue';
import { loadSession, session, signIn } from '../../account/session.ts';
import { marketWire, type PackageCard, type PackageSort } from '../../marketplace/catalogue.ts';
import { defaultCoverUrl, FAMILY_WORDS, kindFamily, type KindFamily } from '../../marketplace/covers.ts';
import ImportsList from './ImportsList.vue';
import ProductPage from './ProductPage.vue';
import StoreCard from './StoreCard.vue';
import { familiesIn, featured, isFamily, ofFamily } from './storefront.ts';

const route = useRoute();
const router = useRouter();
const wire = marketWire();
const CDN = import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage';

const one = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '');
const packageId = computed(() => (typeof route.params.packageId === 'string' ? route.params.packageId : ''));
const mineView = computed(() => one(route.query.mine) === '1');
const watching = computed(() => {
    const n = Number(one(route.query.version));
    return Number.isInteger(n) && n > 0 ? n : 0;
});
const isAdmin = computed(() => !!session.user && session.user.role === 'admin');
/** Admins only: the catalogue lists taken-down packages. */
const hiddenView = computed(() => isAdmin.value && one(route.query.hidden) === '1');

const ready = ref(false);
const loading = ref(false);
const error = ref('');
const now = ref(Date.now());

// ---- the catalogue ----------------------------------------------------------------------------------------

const q = ref(one(route.query.q));
const tag = computed(() => one(route.query.tag));
/** The chip: a family, or "" for All. An old `?kind=` of any text reads as its family. */
const family = computed((): KindFamily | '' => {
    const text = one(route.query.kind);
    if (!text) return '';
    return isFamily(text) ? text : kindFamily(text);
});
const sort = ref<PackageSort>((['updated', 'installs', 'title'].includes(one(route.query.sort)) ? one(route.query.sort) : 'updated') as PackageSort);
const hiddenOnly = ref(one(route.query.hidden) === '1');
const cards = ref<PackageCard[]>([]);
const nextCursor = ref<string | null>(null);

const shown = computed(() => ofFamily(cards.value, family.value));
const chips = computed(() => familiesIn(cards.value));
const filtered = computed(() => !!(one(route.query.q) || tag.value || family.value));
/** The featured row: the landing view only, and only while the catalogue is not thin. */
const featuredCards = computed(() => (filtered.value || mineView.value || hiddenView.value ? [] : featured(cards.value)));

async function loadCards(more = false): Promise<void> {
    loading.value = true;
    error.value = '';
    now.value = Date.now();
    try {
        const page = await wire.catalogue({ q: one(route.query.q), tag: tag.value, sort: sort.value, mine: mineView.value, hidden: hiddenView.value, cursor: more && nextCursor.value ? nextCursor.value : undefined });
        cards.value = more ? [...cards.value, ...page.items] : page.items;
        nextCursor.value = page.nextCursor;
    } catch (err) {
        if (!more) cards.value = [];
        error.value = err instanceof Error && err.message ? err.message : 'The packages could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
}

function go(change: { q?: string; kind?: string; tag?: string; sort?: string }): void {
    const query: Record<string, string> = {};
    const nextQ = change.q !== undefined ? change.q : one(route.query.q);
    const nextKind = change.kind !== undefined ? change.kind : family.value;
    const nextTag = change.tag !== undefined ? change.tag : tag.value;
    const nextSort = change.sort !== undefined ? change.sort : sort.value;
    if (nextQ.trim()) query.q = nextQ.trim();
    if (nextKind) query.kind = nextKind;
    if (nextTag) query.tag = nextTag;
    if (nextSort !== 'updated') query.sort = nextSort;
    if (mineView.value) query.mine = '1';
    if (hiddenOnly.value && isAdmin.value) query.hidden = '1';
    void router.replace({ path: '/packages', query });
}

function search(): void {
    go({ q: q.value });
}

function clearFilters(): void {
    q.value = '';
    go({ q: '', kind: '', tag: '' });
}

function load(): void {
    if (!packageId.value) void loadCards();
}

watch(() => [packageId.value, mineView.value, one(route.query.q), one(route.query.tag), one(route.query.sort), one(route.query.hidden), session.user ? session.user.id : ''] as const, () => {
    q.value = one(route.query.q);
    hiddenOnly.value = one(route.query.hidden) === '1';
    load();
});

onMounted(async () => {
    await loadSession();
    ready.value = true;
    load();
});
</script>

<template>
  <main class="mk-page" :class="{ 'is-store': !packageId }">
    <header class="mk-bar">
      <RouterLink class="ui-btn" to="/"><Icon name="arrow-left" :size="13" />Map</RouterLink>
      <RouterLink v-if="packageId || mineView" class="ui-btn" to="/packages"><Icon name="store" :size="13" />Marketplace</RouterLink>
      <RouterLink v-if="session.user && !mineView" class="ui-btn" to="/packages?mine=1">My packages</RouterLink>
      <h1 v-if="!packageId" class="mk-title">{{ mineView ? 'My packages' : 'Marketplace' }}</h1>
    </header>

    <div v-if="ready && mineView && !session.user" class="mk-empty">
      <p><b>Sign in to see your packages.</b></p>
      <button type="button" class="ui-btn is-primary" @click="signIn()">Sign in</button>
    </div>

    <template v-else-if="!packageId">
      <section v-if="featuredCards.length" class="mk-featured" aria-labelledby="mk-featured-h">
        <h2 id="mk-featured-h" class="ui-heading">Most imported</h2>
        <ul class="mk-featured-row">
          <li v-for="item in featuredCards" :key="item.id"><StoreCard :card="item" :cdn="CDN" :now="now" wide /></li>
        </ul>
      </section>

      <div class="mk-toolbar">
        <form class="mk-find" role="search" @submit.prevent="search">
          <input v-model="q" class="mk-box mk-q" type="search" placeholder="Search titles, descriptions and tags" aria-label="Search packages" maxlength="100" />
          <button type="submit" class="ui-btn">Search</button>
        </form>
        <label class="mk-sort">
          <span>Sort by</span>
          <select v-model="sort" class="mk-box" @change="go({ sort })">
            <option value="updated">Recently updated</option>
            <option value="installs">Most imported</option>
            <option value="title">Title</option>
          </select>
        </label>
        <label v-if="isAdmin && !mineView" class="mk-check"><input v-model="hiddenOnly" type="checkbox" @change="go({})" /> Hidden</label>
      </div>

      <div v-if="chips.length || family || tag" class="mk-chips" role="group" aria-label="Kind">
        <button type="button" class="mk-chip" :aria-pressed="family === '' ? 'true' : 'false'" @click="go({ kind: '' })">All</button>
        <button v-for="name in chips" :key="name" type="button" class="mk-chip" :aria-pressed="family === name ? 'true' : 'false'" @click="go({ kind: name })">{{ FAMILY_WORDS[name] }}</button>
        <button v-if="family && !chips.includes(family)" type="button" class="mk-chip" aria-pressed="true" @click="go({ kind: '' })">{{ FAMILY_WORDS[family] }}</button>
        <button v-if="tag" type="button" class="mk-chip is-tag" aria-pressed="true" :aria-label="'Tag ' + tag + '. Clear the tag.'" @click="go({ tag: '' })">Tag: {{ tag }} <Icon name="xmark" :size="10" /></button>
      </div>

      <p v-if="error" class="mk-err" role="alert">{{ error }} <button type="button" class="build-link" @click="loadCards()">Try again</button></p>
      <ul v-if="!ready || (loading && !cards.length)" class="mk-grid" aria-busy="true" aria-label="Loading packages">
        <li v-for="n in 8" :key="n" class="mk-card is-ghost"><span class="mk-cover"></span><span class="mk-card-body"><b>&nbsp;</b><small>&nbsp;</small><small>&nbsp;</small></span></li>
      </ul>
      <div v-else-if="!shown.length && !error && (filtered || mineView || hiddenView)" class="mk-empty">
        <template v-if="mineView && !filtered">
          <p><b>You have not published a package yet.</b></p>
          <p>To publish one, open the map, turn on Build, select hexes, a subsector, or a sector, and then select Publish selection.</p>
        </template>
        <p v-else-if="hiddenView && !filtered"><b>No package is hidden.</b></p>
        <template v-else>
          <p><b>No packages match.</b></p>
          <button type="button" class="ui-btn" @click="clearFilters()">Clear filters</button>
        </template>
      </div>
      <div v-else-if="!shown.length && !error" class="mk-empty is-first">
        <img class="mk-empty-art" :src="defaultCoverUrl('other', true)" alt="" width="640" height="360">
        <p><b>No packages yet.</b></p>
        <template v-if="session.user">
          <p>Share a sector, a ship, or your contacts. Open the map, turn on Build, select what to share, and then select Publish selection.</p>
          <RouterLink class="ui-btn is-primary" to="/">Publish a package</RouterLink>
        </template>
      </div>
      <ul v-else class="mk-grid">
        <li v-for="item in shown" :key="item.id"><StoreCard :card="item" :cdn="CDN" :now="now" /></li>
      </ul>
      <div v-if="nextCursor" class="mk-more"><button type="button" class="ui-btn" :disabled="loading" @click="loadCards(true)">Show more</button></div>
      <ImportsList v-if="session.user && !mineView" />
    </template>

    <ProductPage
      v-else
      :package-id="packageId"
      :cdn="CDN"
      :ready="ready"
      :watching="watching"
      :import-for="one(route.query.import)"
      :update-id="one(route.query.update)"
      :placed-back="one(route.query.placed) === '1'"
    />
  </main>
</template>
<style>
.mk-page {
  box-sizing: border-box;
  width: min(1240px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: 20px 16px 40px;
  background: var(--bg-0);
  color: var(--text-0);
}

.mk-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.mk-bar .ui-btn,
.mk-empty .ui-btn {
  text-decoration: none;
}

.mk-title {
  flex: 1 1 100%;
  margin: 6px 0 0;
  font: 700 24px/1.2 var(--font-display);
}

/* The grid: 4 columns at 1600 px, 2 at 768, 1 at 390. */
.mk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mk-grid.is-more {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.mk-card.is-ghost .mk-card-body b,
.mk-card.is-ghost .mk-card-body small {
  display: block;
  width: 70%;
  margin-bottom: 4px;
  border-radius: var(--r-1);
  background: var(--line-soft);
}

.mk-featured {
  margin-bottom: 20px;
}

.mk-featured-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mk-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 12px;
}

.mk-find {
  display: flex;
  flex: 1 1 320px;
  gap: 8px;
}

.mk-find .mk-q {
  flex: 1 1 auto;
  min-width: 0;
}

.mk-sort {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.mk-sort .mk-box {
  width: auto;
}

.mk-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.mk-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 14px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-pill);
  background: var(--panel-raised);
  color: var(--text-1);
  font: 600 13px/1.2 var(--font-text);
  cursor: pointer;
}

.mk-chip:hover {
  border-color: var(--signal-line);
  color: var(--text-0);
}

.mk-chip[aria-pressed="true"] {
  border-color: var(--signal);
  background: var(--signal);
  color: var(--on-signal);
}

.mk-chip.is-tag[aria-pressed="true"] {
  border-color: var(--signal);
  background: var(--wash);
  color: var(--signal);
}

.mk-card small,
.mk-line {
  color: var(--text-muted);
  font-size: 12.5px;
}

.mk-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 18px;
  margin: 0;
}

.mk-tag {
  padding: 2px 10px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-pill);
  background: var(--panel-raised);
  color: var(--text-1);
  font: 600 12px/1.5 var(--font-text);
  text-decoration: none;
}

.mk-tag:hover {
  border-color: var(--signal-line);
  color: var(--text-0);
}

.mk-empty {
  padding: 28px 16px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  text-align: center;
}

.mk-empty > p {
  margin: 0 0 12px;
}

.mk-empty.is-first p {
  max-width: 460px;
  margin-inline: auto;
}

.mk-empty-art {
  display: block;
  width: min(360px, 100%);
  height: auto;
  margin: 0 auto 12px;
  border-radius: var(--r-3);
}

.mk-page .mk-err {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-2);
  color: var(--text-1);
}

.mk-status {
  padding: 8px 10px;
  border-left: 3px solid var(--signal);
  background: var(--bg-2);
}

.mk-status[data-state="failed"] {
  border-left-color: var(--danger);
}

.mk-desc {
  max-width: 72ch;
  color: var(--text-1);
  white-space: pre-wrap;
}

.mk-st {
  padding: 1px 8px;
  border-radius: var(--r-pill);
  background: var(--neutral-wash);
  color: var(--text-1);
  font: 700 11.5px/1.5 var(--font-text);
}

.mk-st[data-state="done"] {
  background: var(--wash);
  color: var(--signal);
}

.mk-st[data-state="failed"] {
  background: var(--zone-red-wash);
  color: var(--zone-red);
}

.mk-page .mk-box {
  box-sizing: border-box;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.35 var(--font-text);
}

.mk-more {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}

.mk-shape {
  margin: 0;
  padding: 8px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
  text-align: center;
}

.mk-shape svg {
  display: block;
  width: 100%;
  max-width: 240px;
  height: 160px;
  margin: 0 auto;
}

.mk-shape polygon {
  fill: var(--wash);
  stroke: var(--signal);
  stroke-width: 0.12;
}

.mk-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 640px) {
  .mk-featured-row {
    display: flex;
    gap: 12px;
    margin: 0 -16px;
    padding: 0 16px 4px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 16px;
  }

  .mk-featured-row > li {
    flex: 0 0 84%;
    scroll-snap-align: start;
  }
}
</style>
