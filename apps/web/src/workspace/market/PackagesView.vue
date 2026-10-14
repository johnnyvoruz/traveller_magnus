<script setup lang="ts">
/**
 * The marketplace (contracts/b_marketplace.md F2, F3; prompts/z_marketplace.md phase 4).
 * `/packages` is the public catalogue: search, kind and tag filters, sort; `?mine=1` is the
 * signed-in author's own packages. `/packages/:packageId` is one package: description,
 * versions, the piece's outline, Import (signed in), Report (signed in, not the author), and
 * Take down or Restore for an admin. `?version=N` is a version being published, watched until
 * it is done. `?import=<campaign>` with `placed=1` or `update=<import>` reopens the import.
 * Signed out, both pages read.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Icon from '../../design/Icon.vue';
import { loadSession, session, signIn } from '../../account/session.ts';
import type { PackageVersion } from '../../marketplace/index.ts';
import { MarketError, marketWire, versionKeys, type PackageCard, type PackagePublicPage, type PackageSort } from '../../marketplace/catalogue.ts';
import ImportPanel from './ImportPanel.vue';
import ImportsList from './ImportsList.vue';
import MarketAsk from './MarketAsk.vue';
import { listingLine, marketStore, packagePath, plural, stateWords } from './market.ts';
import { outlineHexes } from './place.ts';

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
const importFor = computed(() => one(route.query.import));
const updateId = computed(() => one(route.query.update));
const placedBack = computed(() => one(route.query.placed) === '1');
const isAdmin = computed(() => !!session.user && session.user.role === 'admin');
/** Admins only: the catalogue lists taken-down packages. */
const hiddenView = computed(() => isAdmin.value && one(route.query.hidden) === '1');
const notFound = ref(false);

const ready = ref(false);
const loading = ref(false);
const error = ref('');

// ---- the catalogue ----------------------------------------------------------------------------------------

const q = ref(one(route.query.q));
const kind = ref(one(route.query.kind));
const tag = ref(one(route.query.tag));
const sort = ref<PackageSort>((['updated', 'installs', 'title'].includes(one(route.query.sort)) ? one(route.query.sort) : 'updated') as PackageSort);
const cards = ref<PackageCard[]>([]);
const nextCursor = ref<string | null>(null);

async function loadCards(more = false): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        const page = await wire.catalogue({ q: q.value, kind: kind.value, tag: tag.value, sort: sort.value, mine: mineView.value, hidden: hiddenView.value, cursor: more && nextCursor.value ? nextCursor.value : undefined });
        cards.value = more ? [...cards.value, ...page.items] : page.items;
        nextCursor.value = page.nextCursor;
    } catch (err) {
        if (!more) cards.value = [];
        error.value = err instanceof Error && err.message ? err.message : 'The packages could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
}

function search(): void {
    const query: Record<string, string> = {};
    if (q.value.trim()) query.q = q.value.trim();
    if (kind.value.trim()) query.kind = kind.value.trim();
    if (tag.value.trim()) query.tag = tag.value.trim();
    if (sort.value !== 'updated') query.sort = sort.value;
    if (mineView.value) query.mine = '1';
    if (hiddenOnly.value && isAdmin.value) query.hidden = '1';
    void router.replace({ path: '/packages', query });
}

const hiddenOnly = ref(one(route.query.hidden) === '1');

function byTag(name: string): void {
    tag.value = name;
    search();
}

function cardLine(card: PackageCard): string {
    return listingLine(card) + ' · ' + plural(card.installs, 'import', 'imports') + ' · updated ' + card.updatedAt.slice(0, 10);
}

// ---- one package ------------------------------------------------------------------------------------------

const page = ref<PackagePublicPage | null>(null);
const live = ref<PackageVersion | null>(null);
const keys = ref<string[] | null>(null);
const asking = ref<'' | 'report' | 'takedown' | 'restore'>('');
const askBusy = ref(false);
const askError = ref('');
const said = ref('');

const isAuthor = computed(() => {
    const user = session.user;
    const handle = user && user.profile && user.profile.handle ? user.profile.handle : '';
    return !!page.value && !!handle && page.value.authorHandle === handle;
});
const versions = computed(() => {
    const rows = page.value ? [...page.value.versions] : [];
    const now = live.value;
    if (now) {
        const at = rows.findIndex((item) => item.version === now.version);
        if (at >= 0) rows[at] = now; else rows.unshift(now);
    }
    return rows.sort((a, b) => b.version - a.version);
});
const outline = computed(() => (keys.value ? outlineHexes(keys.value) : null));

let watchedKey = '';

async function loadPage(): Promise<void> {
    const id = packageId.value;
    loading.value = true;
    error.value = '';
    notFound.value = false;
    keys.value = null;
    try {
        page.value = await wire.page(id);
    } catch (err) {
        page.value = null;
        if (err instanceof MarketError && err.status === 404) notFound.value = true;
        else error.value = err instanceof Error && err.message ? err.message : 'The package could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
    const got = page.value;
    if (got && got.latestVersion > 0) void versionKeys(fetch, CDN, got.id, got.latestVersion).then((found) => { if (packageId.value === id) keys.value = found; });
    const version = watching.value;
    const key = id + ':' + version;
    if (!got || !version || !session.user || watchedKey === key) return;
    watchedKey = key;
    live.value = got.versions.find((item) => item.version === version) ?? null;
    try {
        const end = await marketStore().watch(id, version, (next) => { if (packageId.value === id) live.value = next; });
        if (packageId.value === id) {
            live.value = end;
            page.value = await wire.page(id);
        }
    } catch (err) {
        if (packageId.value === id) error.value = err instanceof Error && err.message ? err.message : 'The version could not be read.';
    }
}

async function answer(reason: string): Promise<void> {
    const id = packageId.value;
    const what = asking.value;
    askBusy.value = true;
    askError.value = '';
    try {
        if (what === 'report') await wire.report(id, reason);
        else if (what === 'takedown') await wire.takedown(id, reason);
        else if (what === 'restore') await wire.restore(id);
        asking.value = '';
        said.value = what === 'report' ? 'Thanks. An admin will look at it.' : what === 'takedown' ? 'Taken down. It no longer shows in the catalogue.' : 'Restored. It shows in the catalogue again.';
        if (what !== 'report') page.value = await wire.page(id).catch(() => page.value);
    } catch (err) {
        askError.value = err instanceof Error && err.message ? err.message : 'That did not work. Try again.';
    } finally {
        askBusy.value = false;
    }
}

const statusLine = computed(() => {
    const now = live.value;
    if (!now) return '';
    if (now.state === 'done') return 'Published version ' + now.version + '.';
    if (now.state === 'failed') return 'Version ' + now.version + ' failed: ' + (now.error || 'the server gave no reason.').replace(/\.?$/, '.') + ' To try again, go back to Build and select Publish selection.';
    return (now.state === 'running' ? 'Publishing' : 'Waiting to publish') + ' version ' + now.version + '. You can leave this page. The version keeps publishing.';
});

function load(): void {
    said.value = '';
    if (packageId.value) void loadPage();
    else void loadCards();
}

watch(() => [packageId.value, watching.value, mineView.value, one(route.query.q), one(route.query.kind), one(route.query.tag), one(route.query.sort), one(route.query.hidden), session.user ? session.user.id : ''] as const, () => {
    q.value = one(route.query.q);
    kind.value = one(route.query.kind);
    tag.value = one(route.query.tag);
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
  <main class="mk-page">
    <header class="mk-bar">
      <RouterLink class="ui-btn" to="/"><Icon name="arrow-left" :size="13" />Map</RouterLink>
      <RouterLink v-if="packageId || mineView" class="ui-btn" to="/packages">Marketplace</RouterLink>
      <RouterLink v-if="session.user && !mineView" class="ui-btn" to="/packages?mine=1">My packages</RouterLink>
      <h1 class="mk-title">{{ packageId ? (page ? page.title : 'Package') : mineView ? 'My packages' : 'Marketplace' }}</h1>
    </header>

    <div v-if="ready && mineView && !session.user" class="mk-empty">
      <p><b>Sign in to see your packages.</b></p>
      <button type="button" class="ui-btn is-primary" @click="signIn()">Sign in</button>
    </div>

    <template v-else-if="!packageId">
      <form class="mk-find" role="search" @submit.prevent="search">
        <input v-model="q" class="mk-box mk-q" type="search" placeholder="Search packages" aria-label="Search packages" maxlength="100" />
        <input v-model="kind" class="mk-box" type="text" placeholder="Kind" aria-label="Kind" maxlength="40" />
        <input v-model="tag" class="mk-box" type="text" placeholder="Tag" aria-label="Tag" maxlength="40" />
        <select v-model="sort" class="mk-box" aria-label="Sort" @change="search">
          <option value="updated">Recently updated</option>
          <option value="installs">Most imported</option>
          <option value="title">Title</option>
        </select>
        <label v-if="isAdmin && !mineView" class="mk-check"><input v-model="hiddenOnly" type="checkbox" @change="search" /> Hidden</label>
        <button type="submit" class="ui-btn is-primary">Search</button>
      </form>
      <p v-if="error" class="mk-err" role="alert">{{ error }} <button type="button" class="build-link" @click="loadCards()">Try again</button></p>
      <ul v-if="!ready || (loading && !cards.length)" class="mk-cards" aria-busy="true" aria-label="Loading packages">
        <li v-for="n in 3" :key="n" class="mk-card is-ghost"><b>&nbsp;</b><small>&nbsp;</small><span class="mk-tags">&nbsp;</span></li>
      </ul>
      <div v-else-if="!cards.length && !error" class="mk-empty">
        <p v-if="mineView"><b>You have not published a package yet.</b></p>
        <p v-else-if="hiddenView"><b>No package is hidden.</b></p>
        <p v-else><b>No package matches.</b></p>
        <p v-if="mineView">To publish one, turn on Build, select hexes, a subsector, or a sector, and then select Publish selection.</p>
      </div>
      <ul v-else class="mk-cards">
        <li v-for="item in cards" :key="item.id" class="mk-card-wrap">
          <RouterLink class="mk-card" :to="packagePath(item.id)">
            <b>{{ item.title }} <span v-if="item.hidden" class="mk-st" data-state="failed">Taken down</span></b>
            <small>{{ cardLine(item) }}</small>
          </RouterLink>
          <span class="mk-tags"><button v-for="t in item.tags" :key="t" type="button" class="mk-tag" @click="byTag(t)">{{ t }}</button></span>
        </li>
      </ul>
      <div v-if="nextCursor" class="mk-more"><button type="button" class="ui-btn" :disabled="loading" @click="loadCards(true)">Show more</button></div>
      <ImportsList v-if="session.user && !mineView" />
    </template>

    <section v-else class="mk-pk">
      <p v-if="error" class="mk-err" role="alert">{{ error }}</p>
      <div v-if="notFound" class="mk-empty">
        <p><b>Listing not found.</b></p>
        <RouterLink class="ui-btn" to="/packages">Back to the Marketplace</RouterLink>
      </div>
      <div v-if="!page && loading" class="mk-card is-ghost" aria-busy="true"><b>&nbsp;</b><small>&nbsp;</small></div>
      <template v-if="page">
        <p class="mk-line">{{ listingLine(page) }} · {{ plural(page.installs, 'import', 'imports') }} · updated {{ page.updatedAt.slice(0, 10) }}</p>
        <p class="mk-tags"><i v-for="t in page.tags" :key="t">{{ t }}</i></p>
        <p v-if="page.hidden && isAuthor && !isAdmin" class="mk-err" role="status">Taken down. Only you can see it.</p>
        <p v-else-if="page.hidden" class="mk-err" role="status"><b>Hidden</b><template v-if="page.takedownReason">. Reason: {{ page.takedownReason }}</template></p>
        <p v-if="statusLine" class="mk-status" :data-state="live ? live.state : ''" role="status" aria-live="polite">{{ statusLine }}</p>
        <p v-if="said" class="mk-status" role="status">{{ said }}</p>
        <div class="mk-pk-top">
          <p v-if="page.description" class="mk-desc">{{ page.description }}</p>
          <figure v-if="outline && outline.points.length" class="mk-shape">
            <svg :viewBox="outline.viewBox" role="img" :aria-label="'Outline of ' + plural(outline.points.length, 'hex', 'hexes')">
              <polygon v-for="(pts, i) in outline.points" :key="i" :points="pts" />
            </svg>
            <figcaption>{{ plural(outline.points.length, 'hex', 'hexes') }}</figcaption>
          </figure>
        </div>
        <div class="mk-acts-row">
          <button v-if="!session.user && ready" type="button" class="ui-btn is-primary" @click="signIn()">Sign in to import</button>
          <button v-if="session.user && !isAuthor && !page.hidden" type="button" class="ui-btn" @click="asking = 'report'; askError = ''">Report</button>
          <button v-if="isAdmin && !page.hidden" type="button" class="ui-btn" @click="asking = 'takedown'; askError = ''">Take down</button>
          <button v-if="isAdmin && page.hidden" type="button" class="ui-btn" @click="asking = 'restore'; askError = ''">Restore</button>
        </div>
        <ImportPanel
          v-if="session.user && page.latestVersion > 0 && !page.hidden"
          :key="page.id + ':' + importFor + ':' + updateId + ':' + placedBack"
          :page="page"
          :keys="keys"
          :universe-id="importFor || undefined"
          :placed="placedBack"
          :update-id="updateId || undefined"
        />
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
        <MarketAsk
          v-if="asking === 'report'"
          title="Report this package"
          text="Say what is wrong. An admin reads every report."
          confirm="Report"
          reason
          :busy="askBusy"
          :error="askError"
          @confirm="answer"
          @cancel="asking = ''"
        />
        <MarketAsk
          v-if="asking === 'takedown'"
          title="Take down this package"
          text="It leaves the catalogue. Campaigns keep their copies. The reason goes in the audit log."
          confirm="Take down"
          reason
          danger
          :busy="askBusy"
          :error="askError"
          @confirm="answer"
          @cancel="asking = ''"
        />
        <MarketAsk
          v-if="asking === 'restore'"
          title="Restore this package"
          text="It shows in the catalogue again."
          confirm="Restore"
          :busy="askBusy"
          :error="askError"
          @confirm="answer"
          @cancel="asking = ''"
        />
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

.mk-find {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.mk-find .mk-box {
  flex: 1 1 120px;
}

.mk-find .mk-q {
  flex: 3 1 220px;
}

.mk-card-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mk-tag {
  padding: 1px 8px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--wash);
  color: var(--signal);
  font: 600 11px/1.5 var(--font-text);
  cursor: pointer;
}

.mk-tag:hover,
.mk-tag:focus-visible {
  outline: 1px solid var(--signal);
}

.mk-more {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.mk-pk-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}

.mk-pk-top .mk-desc {
  flex: 1 1 320px;
  margin-top: 0;
}

.mk-shape {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
  text-align: center;
}

.mk-shape svg {
  display: block;
  width: 180px;
  height: 140px;
}

.mk-shape polygon {
  fill: var(--wash);
  stroke: var(--signal);
  stroke-width: 0.12;
}

.mk-shape figcaption {
  color: var(--text-muted);
  font-size: 12px;
}

.mk-acts-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
}
.mk-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
</style>
