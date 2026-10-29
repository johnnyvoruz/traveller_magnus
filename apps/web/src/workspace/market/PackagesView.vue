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
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Icon from '../../design/Icon.vue';
import { loadSession, session, signIn } from '../../account/session.ts';
import { marketWire, type PackageCard, type PackageSort } from '../../marketplace/catalogue.ts';
import { defaultCoverUrl } from '../../marketplace/covers.ts';
import { cancelFrame, nextFrame } from '../../platform/browser.ts';
import { activeCount, activeFilters, applyFilters, facets, filterQuery, NO_FILTERS, PAGE_SIZE, readFilters, remember as rememberSeen, resultsWords, serverNarrowing, toggle, type FilterKey, type Seen, type StoreFilters } from './filters.ts';
import { backToResults, dissolve, glide } from './steady.ts';
import { differs, keep, recall, storeSeen, type CatalogueQuery } from './catalogue_memory.ts';
import ImportsList from './ImportsList.vue';
import ProductPage from './ProductPage.vue';
import StoreCard from './StoreCard.vue';
import StoreFiltersBody from './StoreFilters.vue';
import { featured, withoutFeatured } from './storefront.ts';
import Rail from '../../shell/Rail.vue';
import { registerCommand } from '../../shell/registry.ts';
import { atPane } from '../../shell/pane.ts';
import { campaign, listCampaigns, openCampaign } from '../../campaign/store.ts';
import { showToast } from '../../shell/toast.ts';
import AccountMenu from '../AccountMenu.vue';
import { build, setBuildOn } from '../build/state.ts';
import { liveRecords } from '../records.ts';
import { publishAsk } from './command.ts';
import { ownUniverse } from './market.ts';
import PublishChooser from './PublishChooser.vue';
import './market.css';

const route = useRoute();
const router = useRouter();
const wire = marketWire();
const CDN = import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage';

// ---- the app's frame: the rail and the account pop-up, as on the map (prompts/d_store_harden.md item 1) ----

/** Where the rail's Map item goes: the map address the store was opened from, else the map's start. */
const mapReturn = ((): string => {
    const back = router.options.history.state.back;
    return typeof back === 'string' && back.startsWith('/') && !back.startsWith('/packages') && !back.startsWith('/account') ? back : '/';
})();
const accountOpen = ref(false);
const railEl = ref<{ focusAccount: () => void } | null>(null);
/** Build, as on the map, for anyone signed in: it opens the map with Build on, and the map opens the campaign. */
const buildOffered = computed(() => session.user !== null);

function closeAccount(): void {
    if (!accountOpen.value) return;
    accountOpen.value = false;
    if (railEl.value) railEl.value.focusAccount();
}

function goToCampaign(): void {
    accountOpen.value = false;
    void router.push(atPane('/', {}, { kind: 'campaign', record: null }));
}

/** Build from the store: the map, with Build on. */
function openBuild(): void {
    accountOpen.value = false;
    if (!build.on) setBuildOn(true);
    void router.push(mapReturn);
}

const unregister: (() => void)[] = [];

// ---- Publish: the chooser (prompts/d_store_harden.md item 4) ------------------------------------------------

const RecordsPublish = defineAsyncComponent(() => import('./RecordsPublish.vue'));
const choosing = ref(false);
const chooseNote = ref('');
const chooseSignIn = ref(false);
const chooseBusy = ref(false);
const publishingRecords = ref(false);

function openChooser(): void {
    chooseNote.value = '';
    chooseSignIn.value = false;
    choosing.value = true;
}

function closeChooser(): void {
    choosing.value = false;
    chooseBusy.value = false;
}

/** Says what to do first, in the chooser (opened if it was not, as for the command palette's ask). */
function sayFirst(note: string, signInFirst = false): void {
    chooseNote.value = note;
    chooseSignIn.value = signInFirst;
    choosing.value = true;
}

/** Records: open the campaign if it is not open, then Publish records over the store. */
async function publishRecords(): Promise<void> {
    const user = session.user;
    if (!user) {
        sayFirst('Sign in first: records are published from your own campaign.', true);
        return;
    }
    if (campaign.status !== 'ready') {
        chooseBusy.value = true;
        const list = campaign.universes.length ? campaign.universes : (await listCampaigns()) ?? [];
        const mine = list.filter((item) => item.ownerId === user.id);
        if (mine.length) {
            const row = mine.find((item) => item.id === campaign.universeId) ?? mine[0]!;
            // The map opens the campaign on its own; the store opens it only when Publish records needs it.
            if (campaign.status !== 'loading') await openCampaign({ fetch, truthVersion: row.truthVersion, universeId: row.id });
        }
        chooseBusy.value = false;
        if (!mine.length) {
            sayFirst('Make a campaign first: open the Campaign panel on the map and add people, ships, or organizations.');
            return;
        }
    }
    if (campaign.status !== 'ready') {
        sayFirst('Your campaign could not be opened. Open it from the Campaign panel on the map, then try again.');
        return;
    }
    if (!ownUniverse()) {
        sayFirst('Open a campaign you made first: you can publish only from your own campaign.');
        return;
    }
    if (!liveRecords(campaign.records).length) {
        sayFirst('Add records to your campaign first: people, ships, or organizations, in the Campaign panel.');
        return;
    }
    closeChooser();
    publishingRecords.value = true;
}

/** Map hexes: the map, with Build on and Select hexes on, then Publish selection. */
function publishHexes(): void {
    if (!session.user) {
        sayFirst('Sign in first: Build, where you select the hexes, is for signed-in people.', true);
        return;
    }
    closeChooser();
    if (!build.on) setBuildOn(true);
    build.selecting = true;
    void router.push(mapReturn);
    showToast('Select the hexes to publish, and then select Publish selection.');
}

function chooserSignIn(): void {
    void signIn(fetch, route.fullPath);
}

/** "Publish records" from the command palette, while the store is open. */
watch(() => publishAsk.records, (asked) => {
    if (!asked) return;
    publishAsk.records = false;
    void publishRecords();
}, { immediate: true });

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

/** The session has been read. On a return to the store it already was: nothing waits on it. */
const ready = ref(storeSeen.session);
/** Known to be signed out: Publish is "Sign in to publish" (DS9). */
const visitor = computed(() => ready.value && !session.user);
const loading = ref(false);
const error = ref('');
const now = ref(Date.now());

// ---- the catalogue ----------------------------------------------------------------------------------------

const q = ref(one(route.query.q));
const searched = computed(() => one(route.query.q));
const filters = computed(() => readFilters(route.query));
const sort = ref<PackageSort>((['updated', 'installs', 'title'].includes(one(route.query.sort)) ? one(route.query.sort) : 'updated') as PackageSort);
const hiddenOnly = ref(one(route.query.hidden) === '1');
/** The catalogue query the address and the session name now. */
function catalogueQuery(): CatalogueQuery {
    return { q: searched.value, sort: sort.value, mine: mineView.value, hidden: hiddenView.value, user: session.user ? session.user.id : '' };
}
/** Seen before this session: shown at once, and refreshed behind (catalogue_memory.ts). */
const remembered = packageId.value ? null : recall(catalogueQuery());
const cards = ref<PackageCard[]>(remembered ? remembered.items : []);
const nextCursor = ref<string | null>(remembered ? remembered.nextCursor : null);
/** Cards shown before "Show more": a page at a time. */
const pageCount = ref(PAGE_SIZE);

// ---- the server's filters, once the catalogue is bigger than a page (contract F2; streams/D.md D8) ----

/** What to ask the server for: null while the loaded cards are the whole catalogue. */
const narrowing = computed(() => serverNarrowing(filters.value, !nextCursor.value));
/** The server's answer for `narrowing`, page by page; null when nothing was asked. */
const narrowCards = ref<PackageCard[] | null>(null);
const narrowCursor = ref<string | null>(null);
let narrowAsked = '';

async function loadNarrow(more = false): Promise<void> {
    const ask = narrowing.value;
    const key = JSON.stringify([ask, searched.value, sort.value, mineView.value, hiddenView.value]);
    if (!ask) {
        narrowAsked = '';
        narrowCards.value = null;
        narrowCursor.value = null;
        return;
    }
    if (!more && key === narrowAsked) return;
    narrowAsked = key;
    try {
        const page = await wire.catalogue({ q: searched.value, sort: sort.value, mine: mineView.value, hidden: hiddenView.value, family: ask.family, author: ask.author, cursor: more && narrowCursor.value ? narrowCursor.value : undefined });
        if (key !== narrowAsked) return;
        if (cards.value.length && !more) holdResults();
        narrowCards.value = more && narrowCards.value ? [...narrowCards.value, ...page.items] : page.items;
        narrowCursor.value = page.nextCursor;
        if (heldHeight.value) void nextTick(settleResults);
    } catch (err) {
        // The loaded cards stay filtered in the browser; the line says the rest could not be asked for.
        if (key === narrowAsked) error.value = err instanceof Error && err.message ? err.message : 'The packages could not be loaded. Try again.';
    }
}

watch(() => [narrowing.value, searched.value, sort.value, mineView.value, hiddenView.value] as const, () => { void loadNarrow(); });

/** The cards the results are taken from: the server's for `narrowing`, else the loaded catalogue. */
const pool = computed(() => narrowCards.value ?? cards.value);
const poolCursor = computed(() => (narrowCards.value ? narrowCursor.value : nextCursor.value));
const matching = computed(() => applyFilters(pool.value, filters.value, now.value));
/** Every choice the column has listed this visit: it stays listed, dimmed at 0 (filters.ts). */
const seen = ref<Seen>({});
const counts = computed(() => facets(cards.value, filters.value, now.value, seen.value));
watch(counts, (listed) => { seen.value = rememberSeen(seen.value, listed); }, { immediate: true });
const chips = computed(() => activeFilters(filters.value));
const chosen = computed(() => activeCount(filters.value));
const filtered = computed(() => !!searched.value || chosen.value > 0);
/** The featured row: the plain storefront only, like a store's home page; never on results. */
const featuredRow = computed(() => (filtered.value || mineView.value || hiddenView.value ? { heading: '', cards: [] } : featured(cards.value)));
/** The plain storefront: no search, filter or view, so the featured row and Browse by kind show. */
const plainStore = computed(() => !filtered.value && !mineView.value && !hiddenView.value);
/** Before the catalogue answers. */
const firstLoad = computed(() => !cards.value.length && (!ready.value || loading.value));
/** Browse by kind, under the featured row: every kind the store has, with its count. */
const kindTiles = computed(() => (featuredRow.value.cards.length ? counts.value.kinds.filter((facet) => facet.count > 0) : []));
/** The grid leaves out what the featured row shows, so nothing is shown twice. */
const gridCards = computed(() => withoutFeatured(matching.value, featuredRow.value.cards));
const shown = computed(() => gridCards.value.slice(0, pageCount.value));
/** The results line counts every result, the featured row's included. */
const resultsLine = computed(() => resultsWords(shown.value.length + featuredRow.value.cards.length, matching.value.length, !!poolCursor.value, searched.value));
const canShowMore = computed(() => shown.value.length < gridCards.value.length || !!poolCursor.value);

/**
 * The catalogue for the address. A first page seen before this session shows at once and the
 * server is asked behind it; a fresh answer that differs replaces it in place, held and dissolved
 * as a filter change is. A failed refresh keeps what is shown.
 */
async function loadCards(more = false): Promise<void> {
    const query = catalogueQuery();
    const kept = more ? null : recall(query);
    if (kept && !cardsAre(kept)) {
        cards.value = kept.items;
        nextCursor.value = kept.nextCursor;
    }
    loading.value = true;
    error.value = '';
    now.value = Date.now();
    try {
        const page = await wire.catalogue({ q: query.q, sort: query.sort as PackageSort, mine: query.mine, hidden: query.hidden, cursor: more && nextCursor.value ? nextCursor.value : undefined });
        if (more) {
            cards.value = [...cards.value, ...page.items];
            nextCursor.value = page.nextCursor;
        } else {
            keep(query, page);
            if (!cardsAre(page)) {
                if (cards.value.length) holdResults();
                cards.value = page.items;
                nextCursor.value = page.nextCursor;
                if (heldHeight.value) void nextTick(settleResults);
            }
        }
    } catch (err) {
        if (!more && !kept) cards.value = [];
        error.value = err instanceof Error && err.message ? err.message : 'The packages could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
}

/** Whether the cards shown are this answer already. */
function cardsAre(answer: { items: PackageCard[]; nextCursor: string | null }): boolean {
    return !differs({ items: cards.value, nextCursor: nextCursor.value }, answer);
}

/** The next page: the loaded cards first, then the server's next page when they run out. */
async function showMore(): Promise<void> {
    pageCount.value += PAGE_SIZE;
    if (gridCards.value.length >= pageCount.value) return;
    if (narrowCards.value) {
        if (narrowCursor.value) await loadNarrow(true);
    } else if (nextCursor.value) {
        await loadCards(true);
    }
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
 * A filter, chip or sort change replaces the current entry: the URL stays shareable, and Back leaves
 * the filtered store in one step. A search submit is a new entry (prompts/d_store_harden.md item 2).
 * Inside the Filters sheet the sheet's own entry is changed, so Back closes the sheet.
 */
function go(change: { q?: string; filters?: StoreFilters; sort?: string }, push = false): void {
    const to = { path: '/packages', query: storeQuery(change) };
    const next = keyOf(change.q !== undefined ? change.q.trim() : searched.value, change.filters ?? filters.value, change.sort !== undefined ? change.sort : one(route.query.sort));
    if (next !== resultsKey.value) holdResults();
    void (push && !sheetOpen.value ? router.push(to) : router.replace(to));
}

function pick(key: FilterKey, value: string): void {
    go({ filters: toggle(filters.value, key, value) });
}

function search(): void {
    go({ q: q.value }, true);
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

// ---- the results change in place -----------------------------------------------------------------------

const resultsEl = ref<HTMLElement | null>(null);
const resultsBody = ref<HTMLElement | null>(null);
function keyOf(text: string, chosenFilters: StoreFilters, sortBy: string): string {
    return JSON.stringify([text, filterQuery(chosenFilters), sortBy === 'updated' ? '' : sortBy, mineView.value, hiddenView.value]);
}
/** What the results show: a change dissolves them to the new set. */
const resultsKey = computed(() => keyOf(searched.value, filters.value, one(route.query.sort)));
/** The results' height, held through a change so a smaller set can't make the scroller clamp and jump. */
const heldHeight = ref(0);

function holdResults(): void {
    if (resultsEl.value && !packageId.value) heldHeight.value = resultsEl.value.offsetHeight;
}

function releaseResults(): void {
    heldHeight.value = 0;
}

/**
 * After a change the column stays where it was: it is sticky, and the results hold their height,
 * so the scroller never clamps. When the results' top went above the window, the scroller glides
 * it back into view, the column still stuck in place; then the hold lets go. The results dissolve
 * to the new set, the featured row with them.
 */
function settleResults(): void {
    const el = scroller.value;
    const results = resultsEl.value;
    if (resultsBody.value) dissolve(resultsBody.value);
    if (!el || !results || sheetOpen.value) {
        releaseResults();
        return;
    }
    const to = backToResults(el.scrollTop, results.getBoundingClientRect().top, el.getBoundingClientRect().top, 12);
    if (to === null) releaseResults();
    else glide(el, to, releaseResults);
}

watch(resultsKey, (key, was) => {
    if (packageId.value || key === was) return;
    void nextTick(settleResults);
});

function load(): void {
    if (!packageId.value) void loadCards();
}

// A string, not an array: a new array each run would fire on every change to the address (a filter's tick
// too) and ask for the catalogue again; the string changes only when what the catalogue answers for does.
watch(() => JSON.stringify([packageId.value, mineView.value, searched.value, one(route.query.sort), one(route.query.hidden), session.user ? session.user.id : '']), () => {
    q.value = searched.value;
    hiddenOnly.value = one(route.query.hidden) === '1';
    load();
});

// A new search or filter starts at the first page.
watch(() => [searched.value, JSON.stringify(filterQuery(filters.value)), mineView.value] as const, () => {
    pageCount.value = PAGE_SIZE;
});

onMounted(async () => {
    unregister.push(
        registerCommand({ id: 'home', name: 'Return to map', run: () => { void router.push(mapReturn); } }),
        registerCommand({ id: 'account', name: 'Account', run: () => { accountOpen.value = !accountOpen.value; } }),
        registerCommand({ id: 'campaign', name: 'Campaign', run: goToCampaign }),
        registerCommand({ id: 'build', name: 'Build: open the map with Build on', run: openBuild }),
    );
    await loadSession();
    ready.value = true;
    storeSeen.session = true;
    load();
});

onBeforeUnmount(() => {
    for (const stop of unregister.splice(0)) stop();
    stopPop();
    if (restoring) cancelFrame(restoring);
});
</script>

<template>
  <div class="mk-app">
    <Rail
      ref="railEl"
      :panel-open="false"
      :search-open="false"
      :account-open="accountOpen"
      :build-offered="buildOffered"
      :build-on="build.on && buildOffered"
      market-open
    />
    <AccountMenu :open="accountOpen" @close="closeAccount" @campaign="goToCampaign" />
    <!-- The videos' ground (design/base.css .ui-ground), still behind the page as it scrolls. -->
    <div class="ui-ground mk-ground" aria-hidden="true"></div>
    <div ref="scroller" class="mk-scroll" @scroll.passive="remember">
      <main class="mk-page" :class="{ 'is-store': !packageId }">
        <header class="mk-bar">
          <RouterLink class="mk-brand" to="/packages" aria-label="Traveller.voyage Marketplace">
            <span class="ui-brand" aria-hidden="true">Traveller<span class="ui-brand-dot">.</span>voyage</span>
            <span class="mk-brand-where" aria-hidden="true">Marketplace</span>
          </RouterLink>
          <div class="mk-bar-acts">
            <RouterLink v-if="session.user" class="ui-btn" :aria-current="mineView ? 'page' : undefined" to="/packages?mine=1">My packages</RouterLink>
            <!-- Signed out, publishing starts with signing in (DS9); until the session is known, the place is held unseen. -->
            <button v-if="!visitor" type="button" class="ui-btn is-primary" :class="{ 'is-unknown': !ready }" aria-haspopup="dialog" data-publish @click="openChooser()"><Icon name="plus" :size="13" />Publish</button>
            <button v-else type="button" class="ui-btn" data-publish-sign-in @click="chooserSignIn()">Sign in to publish</button>
          </div>
        </header>
        <template v-if="!packageId">
          <h1 class="mk-title">{{ mineView ? 'My packages' : 'Marketplace' }}</h1>
          <div class="ui-rule mk-title-rule" aria-hidden="true"></div>
        </template>

        <div v-if="ready && mineView && !session.user" class="ui-frame mk-state">
          <p class="ui-frame-label">My packages</p>
          <p class="mk-state-head">Sign in to see your packages.</p>
          <div class="mk-state-acts"><button type="button" class="ui-btn is-primary" @click="signIn()">Sign in</button></div>
        </div>

        <template v-else-if="!packageId">
          <form class="mk-find" role="search" @submit.prevent="search">
            <input v-model="q" class="mk-box mk-q" type="search" placeholder="Search titles, descriptions, and tags" aria-label="Search packages" maxlength="100" />
            <button type="submit" class="ui-btn">Search</button>
          </form>

          <div class="mk-store">
            <aside class="mk-side" aria-label="Filters">
              <StoreFiltersBody :facets="counts" @toggle="pick" />
            </aside>

            <div ref="resultsEl" class="mk-results" :style="heldHeight ? { minHeight: heldHeight + 'px' } : undefined">
              <div class="mk-resbar">
                <p class="mk-count" aria-live="polite">
                  <template v-if="!firstLoad && !(error && !cards.length)">{{ resultsLine }}</template>
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
                  class="ui-chip mk-chip is-on"
                  :aria-label="'Remove ' + chip.words"
                  @click="pick(chip.key, chip.value)"
                >{{ chip.words }} <Icon name="xmark" :size="10" /></button>
                <button type="button" class="mk-link mk-clear" @click="clearFilters()">Clear all</button>
              </div>

              <div ref="resultsBody" class="mk-results-body">
                <!-- The first paint holds the page's size: the featured frame and Browse by kind as placeholders too. -->
                <template v-if="firstLoad && plainStore">
                  <section class="mk-featured ui-frame is-ghost" aria-hidden="true">
                    <p class="ui-frame-label">&nbsp;<span class="ui-frame-count">&nbsp;</span></p>
                    <ul class="mk-featured-row">
                      <li v-for="n in 3" :key="n"><span class="mk-card is-ghost is-wide"><span class="mk-cover"></span><span class="mk-card-body"><b class="mk-card-title">&nbsp;</b><small class="mk-card-by">&nbsp;</small><small class="mk-card-facts">&nbsp;</small><span class="mk-card-when"><span class="ui-date">&nbsp;</span></span></span></span></li>
                    </ul>
                  </section>
                  <div class="mk-kinds is-ghost" aria-hidden="true"><p class="ui-kicker">&nbsp;</p><span class="mk-kind-ghost"></span></div>
                </template>
                <section v-if="featuredRow.cards.length" class="mk-featured ui-frame" aria-labelledby="mk-featured-h">
                  <h2 id="mk-featured-h" class="ui-frame-label">{{ featuredRow.heading }} <span class="ui-frame-count">{{ featuredRow.cards.length }}</span></h2>
                  <ul class="mk-featured-row">
                    <li v-for="item in featuredRow.cards" :key="item.id"><StoreCard :card="item" :cdn="CDN" :now="now" wide /></li>
                  </ul>
                </section>

                <section v-if="kindTiles.length" class="mk-kinds" aria-labelledby="mk-kinds-h">
                  <h2 id="mk-kinds-h" class="ui-kicker">Browse by kind</h2>
                  <ul class="mk-kind-row">
                    <li v-for="facet in kindTiles" :key="facet.value">
                      <button type="button" class="ui-btn mk-kind" @click="pick('kinds', facet.value)">{{ facet.words }} <span class="mk-kind-n">{{ facet.count }}</span></button>
                    </li>
                  </ul>
                </section>

                <!-- A refresh that failed while cards are shown: one line over them. -->
                <p v-if="error && cards.length" class="mk-err" role="alert">{{ error }} <button type="button" class="mk-link" @click="loadCards()">Try again</button></p>
                <ul v-if="firstLoad" class="mk-grid" aria-busy="true" aria-label="Loading packages">
                  <li v-for="n in 6" :key="n" class="mk-card is-ghost"><span class="mk-cover"></span><span class="mk-card-body"><b class="mk-card-title">&nbsp;</b><small class="mk-card-by">&nbsp;</small><small class="mk-card-facts">&nbsp;</small><span class="mk-card-when"><span class="ui-date">&nbsp;</span></span></span></li>
                </ul>
                <!-- The catalogue could not be read and nothing is shown: say so in the results' place, with Try again. -->
                <div v-else-if="error" class="ui-frame mk-state is-error" role="alert">
                  <p class="ui-frame-label">Not loaded</p>
                  <p class="mk-state-head">{{ error }}</p>
                  <p class="mk-state-say">Check your connection, and then try again.</p>
                  <div class="mk-state-acts"><button type="button" class="ui-btn is-primary" :disabled="loading" @click="loadCards()">Try again</button></div>
                </div>
                <div v-else-if="!shown.length && filtered" class="camp-first ui-ground">
                  <span class="camp-glyph" aria-hidden="true"><Icon name="search" :size="22" /></span>
                  <h2>No packages match</h2>
                  <p>Try fewer filters, or search with other words.</p>
                  <div class="camp-first-starts">
                    <button type="button" class="ui-btn" @click="clearFilters()">Clear all</button>
                  </div>
                </div>
                <div v-else-if="!shown.length && (mineView || hiddenView)" class="ui-frame mk-state">
                  <template v-if="mineView">
                    <p class="ui-frame-label">My packages</p>
                    <p class="mk-state-head">You have not published a package yet.</p>
                    <p class="mk-state-say">Publish records from your campaign (people, ships, organizations), or part of your map (systems, a subsector, a sector).</p>
                    <div class="mk-state-acts"><button type="button" class="ui-btn is-primary" @click="openChooser()">Publish</button></div>
                  </template>
                  <template v-else>
                    <p class="ui-frame-label">Hidden</p>
                    <p class="mk-state-head">No package is hidden.</p>
                  </template>
                </div>
                <div v-else-if="!shown.length" class="ui-frame mk-state is-first">
                  <img class="mk-empty-art" :src="defaultCoverUrl('other', true)" alt="" width="640" height="360">
                  <p class="ui-frame-label">The store</p>
                  <p class="mk-state-head">No packages yet.</p>
                  <p class="mk-state-say">Publish records from your campaign (people, ships, organizations), or part of your map (systems, a subsector, a sector).</p>
                  <div class="mk-state-acts">
                    <button v-if="visitor" type="button" class="ui-btn is-primary" @click="chooserSignIn()">Sign in to publish</button>
                    <button v-else type="button" class="ui-btn is-primary" @click="openChooser()">Publish</button>
                  </div>
                </div>
                <ul v-else class="mk-grid">
                  <li v-for="item in shown" :key="item.id"><StoreCard :card="item" :cdn="CDN" :now="now" /></li>
                </ul>
                <div v-if="shown.length && canShowMore" class="mk-more"><button type="button" class="ui-btn" :disabled="loading" @click="showMore()">Show more</button></div>
              </div>
              <ImportsList v-if="session.user && mineView" />
            </div>
          </div>

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
    <PublishChooser
      v-if="choosing"
      :note="chooseNote"
      :sign-in="chooseSignIn"
      :busy="chooseBusy"
      @records="publishRecords()"
      @hexes="publishHexes()"
      @signin="chooserSignIn()"
      @close="closeChooser()"
    />
    <RecordsPublish v-if="publishingRecords" :start="[]" @close="publishingRecords = false" />
  </div>
</template>

<style>
/* The page scrolls on its own, as the account page does: the app frame around it is fixed to
   the window (App.vue), so the document never scrolls. The store sits in the app's frame, right of
   the rail (an expanded rail pushes it, as it pushes the chart); everything right of the rail is
   the scroller, so the wheel works over the side margins too. */
.mk-scroll {
  position: absolute;
  inset: 0 0 0 var(--rail-width);
  overflow-y: auto;
  transition: left var(--t-rail) ease;
}

/* The ground fills the same space and stays put: the page scrolls over it. */
.mk-app .mk-ground {
  position: absolute;
  inset: 0 0 0 var(--rail-width);
  transition: left var(--t-rail) ease;
}

@media (prefers-reduced-motion: reduce) {
  .mk-scroll,
  .mk-app .mk-ground {
    transition: none;
  }
}

/* The room at the foot is the results' own (.mk-results), inside the column's row, so the sticky
   column stays put down to the end of the page. */
.mk-page {
  box-sizing: border-box;
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 20px 16px 12px;
  color: var(--text-0);
}

.mk-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-bottom: 16px;
}

.mk-bar-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.mk-bar .ui-btn[aria-current="page"] {
  border-color: var(--row-active-line);
  background: var(--row-active);
  color: var(--signal-active);
}

.mk-bar .ui-btn {
  text-decoration: none;
}

/* Publish before the session is known: its place, unseen, so the row doesn't move when it is. */
.mk-bar .ui-btn.is-unknown {
  visibility: hidden;
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
  margin: 6px 0 0;
  font: 700 26px/1.2 var(--font-display);
}

.mk-title-rule {
  max-width: 560px;
  margin-bottom: 16px;
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

/* A placeholder card: the real card's lines in their own fonts, so it is the real card's size. */
.mk-card.is-ghost .mk-card-body b,
.mk-card.is-ghost .mk-card-body small {
  display: block;
  width: 70%;
  border-radius: var(--r-1);
  background: var(--line-soft);
}

.mk-featured {
  margin-bottom: 20px;
}

.mk-featured .ui-frame-label {
  margin-top: 0;
}

/* Browse by kind: one button per kind the store has, as the videos' storefront. */
.mk-kinds {
  margin-bottom: 20px;
}

.mk-kinds .ui-kicker {
  margin-bottom: 10px;
}

.mk-kind-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A kind: the design system's button (.ui-btn) with the kind's count in Orbitron. */
.mk-kind {
  gap: 10px;
  min-height: 36px;
  padding: 6px 14px;
}

.mk-kind-ghost {
  display: block;
  height: 36px;
}

.mk-kind-n {
  color: var(--signal);
  font: 700 13px/1 var(--font-display);
  font-variant-numeric: var(--tabular);
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

/* At least the window's height, so a smaller set never makes the scroller clamp and jump. */
.mk-page:not(.is-store) {
  padding-bottom: 40px;
}

.mk-results {
  min-width: 0;
  min-height: 100vh;
  padding-bottom: 28px;
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

/* An active filter: the design system's chip (.ui-chip) as a button, tall enough to tap, with its x. */
.mk-chip {
  align-items: center;
  min-height: 32px;
  padding: 4px 12px 4px 14px;
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

/* Below the column's width the results bar (the count, Filters, Sort) stays at the top as the page
   scrolls, so Filters is always one tap away and never moves. */
@media (max-width: 1023px) {
  .mk-resbar {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: 0 -16px 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line-1);
    background: var(--bg-0);
  }
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

/* A tag: the design system's chip (.ui-chip) as a link to the store filtered by it. */
.mk-tag {
  font-weight: 600;
  text-decoration: none;
}

.mk-tag:hover {
  border-color: var(--signal-line);
  color: var(--text-0);
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
