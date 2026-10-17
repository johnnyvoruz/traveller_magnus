<script setup lang="ts">
/**
 * The marketplace as a storefront (contracts/b_marketplace.md F2, F3, F17; prompts/d_storefront.md,
 * d_store_2.md). `/packages` is the catalogue, laid out like a store's results page: the search box
 * across the top; at 1024 px and wider a filter column on the left (StoreFilters.vue), below it a
 * Filters sheet; then the results line, the active filters as chips, sort, the featured row on the
 * plain storefront, and a grid of product cards. The filters live in the query (filters.ts), so Back
 * and a shared link restore them; `?mine=1` is the signed-in author's own packages.
 * `/packages/:packageId` is the product page (ProductPage.vue). Signed out, both read.
 * Everything is free: no price, cart or money word anywhere.
 *
 * The page is its own full-window scroller (the app frame is fixed), and it keeps its scroll
 * position per history entry: Back and Forward return to the same place, a new path starts at the top.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Icon from '../../design/Icon.vue';
import { loadSession, session, signIn } from '../../account/session.ts';
import { marketWire, type PackageCard, type PackageSort } from '../../marketplace/catalogue.ts';
import { defaultCoverUrl } from '../../marketplace/covers.ts';
import { cancelFrame, nextFrame } from '../../platform/browser.ts';
import { activeCount, activeFilters, applyFilters, facets, filterQuery, NO_FILTERS, PAGE_SIZE, readFilters, resultsWords, toggle, type FilterKey, type StoreFilters } from './filters.ts';
import ImportsList from './ImportsList.vue';
import ProductPage from './ProductPage.vue';
import StoreCard from './StoreCard.vue';
import StoreFiltersBody from './StoreFilters.vue';
import { featured, withoutFeatured } from './storefront.ts';
import './market.css';

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
const searched = computed(() => one(route.query.q));
const filters = computed(() => readFilters(route.query));
const sort = ref<PackageSort>((['updated', 'installs', 'title'].includes(one(route.query.sort)) ? one(route.query.sort) : 'updated') as PackageSort);
const hiddenOnly = ref(one(route.query.hidden) === '1');
const cards = ref<PackageCard[]>([]);
const nextCursor = ref<string | null>(null);
/** Cards shown before "Show more": a page at a time. */
const pageCount = ref(PAGE_SIZE);

const matching = computed(() => applyFilters(cards.value, filters.value, now.value));
const counts = computed(() => facets(cards.value, filters.value, now.value));
const chips = computed(() => activeFilters(filters.value));
const chosen = computed(() => activeCount(filters.value));
const filtered = computed(() => !!searched.value || chosen.value > 0);
/** The featured row: the plain storefront only, like a store's home page; never on results. */
const featuredRow = computed(() => (filtered.value || mineView.value || hiddenView.value ? { heading: '', cards: [] } : featured(cards.value)));
/** The grid leaves out what the featured row shows, so nothing is shown twice. */
const gridCards = computed(() => withoutFeatured(matching.value, featuredRow.value.cards));
const shown = computed(() => gridCards.value.slice(0, pageCount.value));
/** The results line counts every result, the featured row's included. */
const resultsLine = computed(() => resultsWords(shown.value.length + featuredRow.value.cards.length, matching.value.length, !!nextCursor.value, searched.value));
const canShowMore = computed(() => shown.value.length < gridCards.value.length || !!nextCursor.value);

async function loadCards(more = false): Promise<void> {
    loading.value = true;
    error.value = '';
    now.value = Date.now();
    try {
        const page = await wire.catalogue({ q: searched.value, sort: sort.value, mine: mineView.value, hidden: hiddenView.value, cursor: more && nextCursor.value ? nextCursor.value : undefined });
        cards.value = more ? [...cards.value, ...page.items] : page.items;
        nextCursor.value = page.nextCursor;
    } catch (err) {
        if (!more) cards.value = [];
        error.value = err instanceof Error && err.message ? err.message : 'The packages could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
}

/** The next page: the loaded cards first, then the server's next page when they run out. */
async function showMore(): Promise<void> {
    pageCount.value += PAGE_SIZE;
    if (gridCards.value.length < pageCount.value && nextCursor.value) await loadCards(true);
}

// ---- the Filters sheet, below 1024 px -----------------------------------------------------------------------

/** The sheet is open while the query says so: Back closes it, and the filters chosen in it stay. */
const sheetOpen = computed(() => !packageId.value && one(route.query.filters) === '1');
const filtersBtn = ref<HTMLButtonElement | null>(null);
const sheetCard = ref<HTMLElement | null>(null);
/** Opened here with a push, so closing is a Back; a shared link with the sheet open closes by replace. */
let sheetPushed = false;
/** The filters as the sheet last left them, while it is open. */
let sheetFilters: StoreFilters | null = null;

/** The store's query: search, filters, sort and the views, as one URL. */
function storeQuery(change: { q?: string; filters?: StoreFilters; sort?: string; sheet?: boolean }): Record<string, string | string[]> {
    const nextQ = change.q !== undefined ? change.q : searched.value;
    const nextSort = change.sort !== undefined ? change.sort : sort.value;
    const query: Record<string, string | string[]> = {};
    if (nextQ.trim()) query.q = nextQ.trim();
    Object.assign(query, filterQuery(change.filters ?? filters.value));
    if (nextSort !== 'updated') query.sort = nextSort;
    if (mineView.value) query.mine = '1';
    if (hiddenOnly.value && isAdmin.value) query.hidden = '1';
    if (change.sheet ?? sheetOpen.value) query.filters = '1';
    return query;
}

/**
 * A new search, filter or sort is a new history entry, as on a store's results page: Back undoes it.
 * Inside the Filters sheet the sheet's own entry is changed instead, so Back closes the sheet.
 */
function go(change: { q?: string; filters?: StoreFilters; sort?: string }): void {
    const to = { path: '/packages', query: storeQuery(change) };
    void (sheetOpen.value ? router.replace(to) : router.push(to));
}

function pick(key: FilterKey, value: string): void {
    go({ filters: toggle(filters.value, key, value) });
}

function search(): void {
    go({ q: q.value });
}

function clearFilters(): void {
    q.value = '';
    go({ q: '', filters: NO_FILTERS });
}

function openSheet(): void {
    sheetPushed = true;
    void router.push({ path: '/packages', query: storeQuery({ sheet: true }) });
}

function closeSheet(): void {
    if (!sheetOpen.value) return;
    if (sheetPushed) router.back();
    else void router.replace({ path: '/packages', query: storeQuery({ sheet: false }) });
}

function onSheetKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        closeSheet();
    }
}

watch(filters, (value) => {
    if (sheetOpen.value) sheetFilters = value;
});

watch(sheetOpen, (open, was) => {
    if (open) {
        sheetFilters = filters.value;
        void nextTick(() => {
            const first = sheetCard.value ? sheetCard.value.querySelector<HTMLElement>('input, button') : null;
            if (first) first.focus();
        });
        return;
    }
    if (!was) return;
    // Back took the sheet's entry away with the filters chosen in it: put them on the entry below.
    const kept = sheetFilters;
    sheetPushed = false;
    sheetFilters = null;
    if (kept && JSON.stringify(filterQuery(kept)) !== JSON.stringify(filterQuery(filters.value))) {
        void router.replace({ path: '/packages', query: storeQuery({ filters: kept, sheet: false }) });
    }
    void nextTick(() => { if (filtersBtn.value) filtersBtn.value.focus({ preventScroll: true }); });
});

// ---- the scroller and its memory ---------------------------------------------------------------------------

const scroller = ref<HTMLElement | null>(null);
/** The scroll position of each history entry, by its place in the history and its address. */
const saved = new Map<string, number>();
let popped = false;
let restoring = 0;

function entryKey(): string {
    const state = router.options.history.state;
    const position = state && typeof state.position === 'number' ? state.position : 0;
    return String(position) + ' ' + route.fullPath;
}

function remember(): void {
    if (scroller.value && !restoring) saved.set(entryKey(), scroller.value.scrollTop);
}

/** Back to a saved position once the page is tall enough for it, or after about two seconds. */
function restore(top: number): void {
    if (restoring) cancelFrame(restoring);
    let tries = 0;
    const step = () => {
        const el = scroller.value;
        restoring = 0;
        if (!el) return;
        const room = el.scrollHeight - el.clientHeight;
        if (room >= top || tries >= 120 || (!loading.value && tries >= 30)) {
            el.scrollTop = top;
            return;
        }
        tries += 1;
        el.scrollTop = Math.min(top, room);
        restoring = nextFrame(step);
    };
    restoring = nextFrame(step);
}

const stopPop = router.options.history.listen(() => { popped = true; });

watch(() => route.fullPath, (_path, was) => {
    const fromPop = popped;
    popped = false;
    const el = scroller.value;
    if (!el) return;
    if (fromPop) {
        restore(saved.get(entryKey()) ?? 0);
        return;
    }
    // A new entry: forget what an older entry at this place said, and start a new path at the top.
    saved.delete(entryKey());
    if (route.path !== (was ? was.split('?')[0] : '')) el.scrollTop = 0;
});

function load(): void {
    if (!packageId.value) void loadCards();
}

watch(() => [packageId.value, mineView.value, searched.value, one(route.query.sort), one(route.query.hidden), session.user ? session.user.id : ''] as const, () => {
    q.value = searched.value;
    hiddenOnly.value = one(route.query.hidden) === '1';
    load();
});

// A new search or filter starts at the first page.
watch(() => [searched.value, JSON.stringify(filterQuery(filters.value)), mineView.value] as const, () => {
    pageCount.value = PAGE_SIZE;
});

onMounted(async () => {
    await loadSession();
    ready.value = true;
    load();
});

onBeforeUnmount(() => {
    stopPop();
    if (restoring) cancelFrame(restoring);
});
</script>

<template>
  <div ref="scroller" class="mk-scroll" @scroll.passive="remember">
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
        <form class="mk-find" role="search" @submit.prevent="search">
          <input v-model="q" class="mk-box mk-q" type="search" placeholder="Search titles, descriptions and tags" aria-label="Search packages" maxlength="100" />
          <button type="submit" class="ui-btn">Search</button>
        </form>

        <div class="mk-store">
          <aside class="mk-side" aria-label="Filters">
            <StoreFiltersBody :facets="counts" @toggle="pick" />
          </aside>

          <div class="mk-results">
            <div class="mk-resbar">
              <p class="mk-count" aria-live="polite">
                <template v-if="ready && !(loading && !cards.length)">{{ resultsLine }}</template>
              </p>
              <button ref="filtersBtn" type="button" class="ui-btn mk-filters-btn" aria-haspopup="dialog" @click="openSheet">
                <Icon name="sliders" :size="13" />Filters<template v-if="chosen"> ({{ chosen }})</template>
              </button>
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

            <div v-if="chips.length" class="mk-active" role="group" aria-label="Active filters">
              <button
                v-for="chip in chips"
                :key="chip.key + ':' + chip.value"
                type="button"
                class="mk-chip is-on"
                :aria-label="'Remove ' + chip.words"
                @click="pick(chip.key, chip.value)"
              >{{ chip.words }} <Icon name="xmark" :size="10" /></button>
              <button type="button" class="mk-link mk-clear" @click="clearFilters()">Clear all</button>
            </div>

            <section v-if="featuredRow.cards.length" class="mk-featured" aria-labelledby="mk-featured-h">
              <h2 id="mk-featured-h" class="ui-heading">{{ featuredRow.heading }}</h2>
              <ul class="mk-featured-row">
                <li v-for="item in featuredRow.cards" :key="item.id"><StoreCard :card="item" :cdn="CDN" :now="now" wide /></li>
              </ul>
            </section>

            <p v-if="error" class="mk-err" role="alert">{{ error }} <button type="button" class="mk-link" @click="loadCards()">Try again</button></p>
            <ul v-if="!ready || (loading && !cards.length)" class="mk-grid" aria-busy="true" aria-label="Loading packages">
              <li v-for="n in 6" :key="n" class="mk-card is-ghost"><span class="mk-cover"></span><span class="mk-card-body"><b>&nbsp;</b><small>&nbsp;</small><small>&nbsp;</small></span></li>
            </ul>
            <div v-else-if="!shown.length && !error && (filtered || mineView || hiddenView)" class="mk-empty">
              <template v-if="mineView && !filtered">
                <p><b>You have not published a package yet.</b></p>
                <p>To publish one, open the map, turn on Build, select hexes, a subsector, or a sector, and then select Publish selection.</p>
              </template>
              <p v-else-if="hiddenView && !filtered"><b>No package is hidden.</b></p>
              <template v-else>
                <p><b>No packages match.</b></p>
                <p>Try fewer filters or other search words.</p>
                <button type="button" class="ui-btn" @click="clearFilters()">Clear all</button>
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
            <div v-if="shown.length && canShowMore" class="mk-more"><button type="button" class="ui-btn" :disabled="loading" @click="showMore()">Show more</button></div>
          </div>
        </div>
        <ImportsList v-if="session.user && !mineView" />

        <Teleport to="body">
          <div v-if="sheetOpen" class="ui-modal mk-sheet" role="dialog" aria-modal="true" aria-labelledby="mk-sheet-h" @keydown="onSheetKey">
            <div class="ui-modal-scrim" @click="closeSheet()"></div>
            <div ref="sheetCard" class="ui-modal-card mk-sheet-card">
              <div class="ui-modal-bar mk-sheet-bar">
                <h2 id="mk-sheet-h" class="ui-modal-title mk-sheet-title">Filters</h2>
                <button v-if="chosen" type="button" class="mk-link" @click="clearFilters()">Clear all</button>
                <button type="button" class="ui-btn mk-sheet-close" aria-label="Close filters" @click="closeSheet()"><Icon name="xmark" :size="13" /></button>
              </div>
              <div class="mk-sheet-body">
                <StoreFiltersBody :facets="counts" @toggle="pick" />
              </div>
              <div class="mk-sheet-foot">
                <button type="button" class="ui-btn is-primary mk-sheet-show" @click="closeSheet()">
                  {{ matching.length === 1 ? 'Show 1 result' : 'Show ' + matching.length.toLocaleString('en-US') + ' results' }}
                </button>
              </div>
            </div>
          </div>
        </Teleport>
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
  </div>
</template>

<style>
/* The page scrolls on its own, as the account page does: the app frame around it is fixed to
   the window (App.vue), so the document never scrolls. The whole window is the scroller, so the
   wheel works over the side margins too. */
.mk-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  background: var(--bg-0);
}

.mk-page {
  box-sizing: border-box;
  width: min(1240px, 100%);
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

/* A text button: See more, Clear all, Try again, Report. The store's own, so it is styled on a cold load. */
.mk-link {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 600 13px/1.4 var(--font-text);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.mk-link:hover {
  color: var(--signal-bright);
}

.mk-title {
  flex: 1 1 100%;
  margin: 6px 0 0;
  font: 700 24px/1.2 var(--font-display);
}

/* The grid: 3 columns beside the filter column at 1600 px, 2 at 768, 1 at 390. */
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

/* Search across the top, full width. */
.mk-find {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.mk-find .mk-q {
  flex: 1 1 auto;
  min-width: 0;
}

/* The results page: the filter column on the left from 1024 px, the results beside it. */
.mk-store {
  display: block;
}

.mk-side {
  display: none;
}

.mk-results {
  min-width: 0;
}

.mk-resbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-bottom: 12px;
}

.mk-count {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--text-1);
  font-size: 13.5px;
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

.mk-active {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.mk-clear {
  margin-left: 4px;
}

.mk-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 12px 4px 14px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-pill);
  background: var(--panel-raised);
  color: var(--text-0);
  font: 600 13px/1.2 var(--font-text);
  cursor: pointer;
}

.mk-chip:hover {
  border-color: var(--signal-line);
}

.mk-chip .ui-icon {
  color: var(--text-muted);
}

@media (min-width: 1024px) {
  .mk-store {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }

  /* Sticky as the page scrolls, and its own scroller when it is taller than the window. */
  .mk-side {
    position: sticky;
    top: 12px;
    display: block;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    padding-right: 4px;
  }

  .mk-filters-btn {
    display: none;
  }
}

/* The Filters sheet: the app's one modal frame, its card on the left at full height. */
.mk-sheet {
  justify-content: flex-start;
  align-items: stretch;
  padding: 0;
}

.mk-sheet-card {
  width: min(360px, 88vw);
  height: 100%;
  max-height: none;
  padding: 0;
  gap: 0;
  border-width: 0 1px 0 0;
  border-radius: 0;
}

.mk-sheet-bar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line-1);
}

.mk-sheet-title {
  flex: 1 1 auto;
  margin: 0;
  font: 700 16px/1.3 var(--font-text);
}

.mk-sheet-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
}

.mk-sheet-foot {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line-1);
}

.mk-sheet-show {
  width: 100%;
  justify-content: center;
}

@media (max-width: 640px) {
  .mk-sheet-card {
    width: 100%;
    border-right: 0;
  }
}

@media (min-width: 1024px) {
  .mk-sheet {
    display: none;
  }
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
