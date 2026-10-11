<script setup lang="ts">
/**
 * My packages (findings/marketplace_screens_design.md §3; mockups km_list, km_empty,
 * km_loading, km_package, km_signed_out). `/packages` is the caller's listings;
 * `/packages/:packageId` is one package with its versions, and `?version=N` is the version
 * being published, watched until it is published or fails: the address carries it, so a
 * reload keeps watching. No install, no browse, no report.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '../../design/Icon.vue';
import { loadSession, session, signIn } from '../../account/session.ts';
import type { PackagePage, PackageVersion } from '../../marketplace/index.ts';
import { listingLine, marketStore, packagePath, plural, SIGN_IN, stateWords } from './market.ts';

const route = useRoute();
const store = marketStore();

const packageId = computed(() => (typeof route.params.packageId === 'string' ? route.params.packageId : ''));
const watching = computed(() => {
    const raw = Array.isArray(route.query.version) ? route.query.version[0] : route.query.version;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
});

const ready = ref(false);
const loading = ref(false);
const error = ref('');
const page = ref<PackagePage | null>(null);
/** The version being published, as the last poll told it. */
const live = ref<PackageVersion | null>(null);

const listings = computed(() => { void store.tick(); return store.listings(); });
const versions = computed(() => {
    const rows = page.value ? [...page.value.versions] : [];
    const now = live.value;
    if (now) {
        const at = rows.findIndex((item) => item.version === now.version);
        if (at >= 0) rows[at] = now; else rows.unshift(now);
    }
    return rows.sort((a, b) => b.version - a.version);
});

async function loadList(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        await store.list();
    } catch (err) {
        error.value = err instanceof Error && err.message ? err.message : 'Your packages could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
}

let watchedKey = '';

async function loadPage(): Promise<void> {
    const id = packageId.value;
    loading.value = true;
    error.value = '';
    try {
        page.value = await store.read(id);
    } catch (err) {
        page.value = null;
        error.value = err instanceof Error && err.message ? err.message : 'The package could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
    const version = watching.value;
    const key = id + ':' + version;
    if (!page.value || !version || watchedKey === key) return;
    watchedKey = key;
    live.value = page.value.versions.find((item) => item.version === version) ?? null;
    try {
        const end = await store.watch(id, version, (next) => { if (packageId.value === id) live.value = next; });
        if (packageId.value === id) {
            live.value = end;
            page.value = store.page(id) ?? page.value;
        }
    } catch (err) {
        if (packageId.value === id) error.value = err instanceof Error && err.message ? err.message : 'The version could not be read.';
    }
}

function load(): void {
    if (!session.user) return;
    if (packageId.value) void loadPage();
    else void loadList();
}

watch(() => [packageId.value, watching.value, session.user ? session.user.id : ''] as const, load);

onMounted(async () => {
    await loadSession();
    ready.value = true;
    load();
});

const statusLine = computed(() => {
    const now = live.value;
    if (!now) return '';
    if (now.state === 'done') return 'Published version ' + now.version + '.';
    if (now.state === 'failed') return 'Version ' + now.version + ' failed: ' + (now.error || 'the server gave no reason.').replace(/\.?$/, '.') + ' To try again, go back to Build and select Publish selection.';
    return (now.state === 'running' ? 'Publishing' : 'Waiting to publish') + ' version ' + now.version + '. You can leave this page. The version keeps publishing.';
});
</script>

<template>
  <main class="mk-page">
    <header class="mk-bar">
      <RouterLink class="ui-btn" to="/"><Icon name="arrow-left" :size="13" />Map</RouterLink>
      <RouterLink v-if="packageId" class="ui-btn" to="/packages">My packages</RouterLink>
      <h1 class="mk-title">{{ packageId && page ? page.title : 'My packages' }}</h1>
    </header>

    <div v-if="ready && !session.user" class="mk-empty">
      <p><b>{{ SIGN_IN }}</b></p>
      <button type="button" class="ui-btn is-primary" @click="signIn()">Sign in</button>
    </div>

    <template v-else-if="!packageId">
      <p v-if="error" class="mk-err" role="alert">{{ error }} <button type="button" class="build-link" @click="loadList()">Try again</button></p>
      <ul v-if="!ready || (loading && !listings.length)" class="mk-cards" aria-busy="true" aria-label="Loading your packages">
        <li v-for="n in 3" :key="n" class="mk-card is-ghost"><b>&nbsp;</b><small>&nbsp;</small><span class="mk-tags">&nbsp;</span></li>
      </ul>
      <div v-else-if="!listings.length && !error" class="mk-empty">
        <p><b>You have not published a package yet.</b></p>
        <p>To publish one, turn on Build, select hexes, a subsector, or a sector, and then select Publish selection.</p>
      </div>
      <ul v-else class="mk-cards">
        <li v-for="item in listings" :key="item.id">
          <RouterLink class="mk-card" :to="packagePath(item.id)">
            <b>{{ item.title }}</b>
            <small>{{ listingLine(item) }}</small>
            <span class="mk-tags"><i v-for="tag in item.tags" :key="tag">{{ tag }}</i></span>
          </RouterLink>
        </li>
      </ul>
    </template>

    <section v-else class="mk-pk">
      <p v-if="error" class="mk-err" role="alert">{{ error }}</p>
      <div v-if="!page && loading" class="mk-card is-ghost" aria-busy="true"><b>&nbsp;</b><small>&nbsp;</small></div>
      <template v-if="page">
        <p class="mk-line">{{ listingLine(page) }}</p>
        <p class="mk-tags"><i v-for="tag in page.tags" :key="tag">{{ tag }}</i></p>
        <p v-if="statusLine" class="mk-status" :data-state="live ? live.state : ''" role="status" aria-live="polite">{{ statusLine }}</p>
        <p v-if="page.description" class="mk-desc">{{ page.description }}</p>
        <h2 class="ui-heading">Versions <span class="ui-count">{{ versions.length }}</span></h2>
        <p v-if="!versions.length" class="build-fine">No version is published yet.</p>
        <table v-else class="mk-vers">
          <thead><tr><th scope="col">Version</th><th scope="col">State</th><th scope="col">Hexes</th><th scope="col">Records</th></tr></thead>
          <tbody>
            <tr v-for="item in versions" :key="item.version">
              <td>{{ item.version }}</td>
              <td><span class="mk-st" :data-state="item.state">{{ stateWords(item.state) }}</span><small v-if="item.error">{{ item.error }}</small></td>
              <td>{{ plural(item.hexCount, 'hex', 'hexes') }}</td>
              <td>{{ plural(item.recordCount, 'record', 'records') }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>
  </main>
</template>

<style>
.mk-page {
  box-sizing: border-box;
  width: min(940px, 100%);
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

.mk-bar .ui-btn {
  text-decoration: none;
}

.mk-title {
  flex: 1 1 100%;
  margin: 6px 0 0;
  font: 700 24px/1.2 var(--font-display);
}

.mk-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mk-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-sizing: border-box;
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  color: var(--text-0);
  text-decoration: none;
}

a.mk-card:hover,
a.mk-card:focus-visible {
  border-color: var(--signal);
}

.mk-card small,
.mk-line {
  color: var(--text-muted);
  font-size: 12.5px;
}

.mk-card.is-ghost b,
.mk-card.is-ghost small,
.mk-card.is-ghost .mk-tags {
  display: block;
  width: 60%;
  border-radius: var(--r-1);
  background: var(--line-soft);
  color: transparent;
}

.mk-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 18px;
  margin: 0;
}

.mk-tags i {
  padding: 1px 8px;
  border-radius: var(--r-pill);
  background: var(--wash);
  color: var(--signal);
  font: 600 11px/1.5 var(--font-text);
  font-style: normal;
}

.mk-empty {
  padding: 28px 16px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  text-align: center;
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
  color: var(--text-1);
  white-space: pre-wrap;
}

.mk-vers {
  width: 100%;
  border-collapse: collapse;
}

.mk-vers th,
.mk-vers td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--line-soft);
  text-align: left;
  vertical-align: top;
}

.mk-vers th {
  color: var(--text-muted);
  font: 600 12px var(--font-text);
}

.mk-vers small {
  display: block;
  color: var(--text-muted);
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
</style>
