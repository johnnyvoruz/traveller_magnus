<script setup lang="ts">
/**
 * A package as a product page (prompts/d_storefront.md point 4; contracts/b_marketplace.md F3, F17).
 * The hero: the whole cover on the left, and the title, author, kind, facts, latest version and
 * Import on the right (on a phone the cover is on top and Import is sticky at the bottom). Then
 * what's inside (hexes and their sectors, records by kind), the gallery of record images, the
 * description and tags, versions as a short changelog, more by the author, and Report at the
 * foot. The author adds or removes the cover here. `?version=N` is a version being published,
 * watched until it is done. Everything is free: Import is the buy button.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { session, signIn } from '../../account/session.ts';
import type { PackageVersion } from '../../marketplace/index.ts';
import {
    MarketError, marketWire, versionContents, type PackageCard, type PackageCover, type PackagePublicPage, type VersionContents,
} from '../../marketplace/catalogue.ts';
import { objectUrl, shownCover } from '../../marketplace/covers.ts';
import ImportPanel from './ImportPanel.vue';
import Lightbox from '../Lightbox.vue';
import MarketAsk from './MarketAsk.vue';
import CoverEditor from './CoverEditor.vue';
import StoreCard from './StoreCard.vue';
import type { PreparedCover } from './cover_image.ts';
import { coverMissed, marketStore, plural, stateWords } from './market.ts';
import { outlineHexes } from './place.ts';
import { galleryImages, hexesInside, kindWords, moreBy, recordGroups, updatedWords } from './storefront.ts';

const props = defineProps<{
    packageId: string;
    cdn: string;
    /** The session has been read. */
    ready: boolean;
    /** A version being published, watched until it is done; 0 for none. */
    watching: number;
    importFor: string;
    updateId: string;
    placedBack: boolean;
}>();

const wire = marketWire();

const page = ref<PackagePublicPage | null>(null);
const live = ref<PackageVersion | null>(null);
const contents = ref<VersionContents | null>(null);
const contentsRead = ref(false);
const others = ref<PackageCard[]>([]);
const loading = ref(false);
const error = ref('');
const notFound = ref(false);
const asking = ref<'' | 'report' | 'takedown' | 'restore'>('');
const askBusy = ref(false);
const askError = ref('');
const said = ref('');
const importOpen = ref(false);
const importEl = ref<HTMLElement | null>(null);
const shownAt = ref<number | null>(null);
const coverBusy = ref(false);
const coverError = ref('');
const now = ref(Date.now());

const isAdmin = computed(() => !!session.user && session.user.role === 'admin');
const isAuthor = computed(() => {
    const user = session.user;
    const handle = user && user.profile && user.profile.handle ? user.profile.handle : '';
    return !!page.value && !!handle && page.value.authorHandle === handle;
});
const cover = computed(() => (page.value ? shownCover(page.value, props.cdn) : null));
const versions = computed(() => {
    const rows = page.value ? [...page.value.versions] : [];
    const moving = live.value;
    if (moving) {
        const at = rows.findIndex((item) => item.version === moving.version);
        if (at >= 0) rows[at] = moving; else rows.unshift(moving);
    }
    return rows.sort((a, b) => b.version - a.version);
});
const latest = computed(() => (page.value ? page.value.versions.find((item) => item.version === page.value!.latestVersion) ?? null : null));
const facts = computed(() => {
    const p = page.value;
    if (!p) return '';
    // A records-only package (F18) has no "0 hexes": its records are the size.
    const parts = p.hexCount > 0 ? [plural(p.hexCount, 'hex', 'hexes')] : [];
    if (latest.value) parts.push(plural(latest.value.recordCount, 'record', 'records'));
    parts.push(plural(p.installs, 'import', 'imports'));
    return parts.join(' · ');
});
/** A records-only package's box: the version's record count, else the records read. */
const recordsInside = computed(() => {
    const count = latest.value ? latest.value.recordCount : contents.value && contents.value.records ? contents.value.records.length : 0;
    return plural(count, 'record', 'records');
});
const keys = computed(() => (contents.value ? contents.value.keys : null));
const outline = computed(() => (keys.value && keys.value.length ? outlineHexes(keys.value) : null));
const groups = computed(() => (contents.value && contents.value.records ? recordGroups(contents.value.records) : []));
const gallery = computed(() => (contents.value && contents.value.records ? galleryImages(contents.value.records) : []));
const canImport = computed(() => !!page.value && page.value.latestVersion > 0 && !page.value.hidden);
const urlOf = (hash: string): string => objectUrl(props.cdn, hash);

let watchedKey = '';

async function load(): Promise<void> {
    const id = props.packageId;
    loading.value = true;
    error.value = '';
    notFound.value = false;
    said.value = '';
    contents.value = null;
    contentsRead.value = false;
    others.value = [];
    importOpen.value = !!(props.importFor || props.updateId || props.placedBack);
    now.value = Date.now();
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
    if (!got) return;
    if (got.latestVersion > 0) {
        void versionContents(fetch, props.cdn, got.id, got.latestVersion).then((found) => {
            if (props.packageId !== id) return;
            contents.value = found;
            contentsRead.value = true;
        });
    } else {
        contentsRead.value = true;
    }
    void wire.catalogue({ sort: 'installs' }).then((list) => {
        if (props.packageId === id) others.value = moreBy(list.items, got.authorHandle, got.id);
    }).catch(() => undefined);
    void follow(id, got);
}

async function follow(id: string, got: PackagePublicPage): Promise<void> {
    const version = props.watching;
    const key = id + ':' + version;
    if (!version || !session.user || watchedKey === key) return;
    watchedKey = key;
    live.value = got.versions.find((item) => item.version === version) ?? null;
    try {
        const end = await marketStore().watch(id, version, (next) => { if (props.packageId === id) live.value = next; });
        if (props.packageId === id) {
            live.value = end;
            page.value = await wire.page(id);
            if (end.state === 'done') void load();
        }
    } catch (err) {
        if (props.packageId === id) error.value = err instanceof Error && err.message ? err.message : 'The version could not be read.';
    }
}

const statusLine = computed(() => {
    const moving = live.value;
    if (!moving) return '';
    if (moving.state === 'done') return 'Published version ' + moving.version + '.';
    if (moving.state === 'failed') return 'Version ' + moving.version + ' failed: ' + (moving.error || 'the server gave no reason.').replace(/\.?$/, '.') + ' To try again, go back to Build and select Publish selection.';
    return (moving.state === 'running' ? 'Publishing' : 'Waiting to publish') + ' version ' + moving.version + '. You can leave this page. The version keeps publishing.';
});

/** Import: signed out, the sign-in card; signed in, the import panel opens under the hero. */
function buy(): void {
    if (!session.user) {
        // Back to this page after the sign-in.
        void signIn(fetch, '/packages/' + encodeURIComponent(props.packageId));
        return;
    }
    importOpen.value = true;
    void nextTick(() => {
        const el = importEl.value;
        if (!el) return;
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        const first = el.querySelector<HTMLElement>('select, button');
        if (first) first.focus({ preventScroll: true });
    });
}

async function answer(reason: string): Promise<void> {
    const id = props.packageId;
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

function setCover(next: PackageCover | null): void {
    if (page.value) page.value = { ...page.value, cover: next };
}

async function sendCover(prepared: PreparedCover): Promise<void> {
    const id = props.packageId;
    coverBusy.value = true;
    coverError.value = '';
    try {
        const next = await wire.putCover(id, prepared);
        if (coverMissed.value && coverMissed.value.packageId === id) coverMissed.value = null;
        if (props.packageId === id) setCover(next);
    } catch (err) {
        coverError.value = err instanceof Error && err.message ? err.message : 'The cover was not saved. Try again.';
    } finally {
        coverBusy.value = false;
    }
}

async function dropCover(): Promise<void> {
    const id = props.packageId;
    coverBusy.value = true;
    coverError.value = '';
    try {
        const next = await wire.dropCover(id);
        if (props.packageId === id) setCover(next);
    } catch (err) {
        coverError.value = err instanceof Error && err.message ? err.message : 'The cover was not removed. Try again.';
    } finally {
        coverBusy.value = false;
    }
}

watch(() => [props.packageId, props.watching, props.ready, session.user ? session.user.id : ''] as const, () => {
    if (props.ready && props.packageId) void load();
}, { immediate: true });
</script>

<template>
  <section class="mk-pk" :class="{ 'has-buybar': canImport }">
    <p v-if="error" class="mk-err" role="alert">{{ error }}</p>
    <div v-if="notFound" class="mk-empty">
      <p><b>Listing not found.</b></p>
      <RouterLink class="ui-btn" to="/packages">Back to the Marketplace</RouterLink>
    </div>
    <div v-if="!page && (loading || !ready)" class="mk-hero is-ghost" aria-busy="true" aria-label="Loading the package">
      <div class="mk-hero-cover"></div>
      <div class="mk-hero-info"><b>&nbsp;</b><small>&nbsp;</small><small>&nbsp;</small></div>
    </div>

    <template v-if="page && cover">
      <p v-if="page.hidden && isAuthor && !isAdmin" class="mk-err" role="status">Taken down. Only you can see it.</p>
      <p v-else-if="page.hidden" class="mk-err" role="status"><b>Hidden</b><template v-if="page.takedownReason">. Reason: {{ page.takedownReason }}</template></p>
      <p v-if="statusLine" class="mk-status" :data-state="live ? live.state : ''" role="status" aria-live="polite">{{ statusLine }}</p>
      <p v-if="said" class="mk-status" role="status">{{ said }}</p>
      <p v-if="isAuthor && coverMissed && coverMissed.packageId === page.id" class="mk-err" role="alert">The cover was not saved: {{ coverMissed.message }} Add it again under the title.</p>

      <div class="mk-hero">
        <figure class="mk-hero-cover" :data-cover="cover.source">
          <img :src="cover.full" :alt="page.title" decoding="async">
        </figure>
        <div class="mk-hero-info">
          <span class="mk-hero-kind">{{ kindWords(page.kind) }}</span>
          <h1 class="mk-hero-title">{{ page.title }}</h1>
          <span class="mk-hero-by">by @{{ page.authorHandle }}</span>
          <span class="mk-hero-facts">{{ facts }}</span>
          <span class="mk-hero-facts">{{ page.latestVersion ? 'Version ' + page.latestVersion : 'Not published yet' }} · {{ updatedWords(page.updatedAt, now) }}</span>
          <span class="mk-hero-facts">{{ page.edition }} · {{ page.truthVersion ? 'chart ' + page.truthVersion : 'own map' }}</span>
          <div v-if="canImport && ready" class="mk-buy">
            <button type="button" class="ui-btn is-primary mk-buy-btn" data-market-import @click="buy()">{{ updateId ? 'Update' : 'Import' }}</button>
            <span v-if="!session.user" class="mk-fine">Sign in to import it into a campaign.</span>
            <span v-if="!session.user && session.error" class="mk-err" role="alert">{{ session.error }}</span>
          </div>
        </div>
      </div>

      <CoverEditor
        v-if="isAuthor && !page.hidden"
        :src="cover.thumb"
        :source="cover.source"
        :can-remove="cover.source === 'upload'"
        :busy="coverBusy"
        :error="coverError"
        :title="page.title"
        @take="sendCover"
        @remove="dropCover"
      />

      <div v-if="importOpen && session.user && canImport" ref="importEl" class="mk-imp-slot">
        <ImportPanel
          :key="page.id + ':' + importFor + ':' + updateId + ':' + placedBack"
          :page="page"
          :keys="keys"
          :universe-id="importFor || undefined"
          :placed="placedBack"
          :update-id="updateId || undefined"
        />
      </div>

      <section v-if="page.latestVersion > 0" class="mk-sec" aria-labelledby="mk-inside">
        <h2 id="mk-inside" class="ui-heading">What's inside</h2>
        <p v-if="!contentsRead" class="mk-fine" aria-busy="true">Reading the package…</p>
        <p v-else-if="!contents" class="mk-fine">The contents could not be read.</p>
        <div v-else class="mk-inside">
          <div v-if="page.hexCount === 0" class="mk-inside-hexes is-records" data-records-only>
            <p class="mk-inside-line"><b>{{ recordsInside }}</b></p>
            <p class="mk-fine">Records only. Nothing is placed on the map.</p>
          </div>
          <div v-else class="mk-inside-hexes">
            <p class="mk-inside-line"><b>{{ hexesInside(contents.keys, contents.ownSectors) }}</b></p>
            <figure v-if="outline && outline.points.length" class="mk-shape">
              <svg :viewBox="outline.viewBox" role="img" :aria-label="'Outline of ' + plural(outline.points.length, 'hex', 'hexes')">
                <polygon v-for="(pts, i) in outline.points" :key="i" :points="pts" />
              </svg>
            </figure>
          </div>
          <div class="mk-inside-recs">
            <p v-if="contents.records === null" class="mk-fine">The records could not be read.</p>
            <p v-else-if="!groups.length" class="mk-fine">No records.</p>
            <div v-for="group in groups" :key="group.type" class="mk-recgroup">
              <h3>{{ group.words }} <span class="ui-count">{{ group.items.length }}</span></h3>
              <ul>
                <li v-for="item in group.items" :key="item.id">
                  <img v-if="item.thumbHash" class="mk-av" :src="urlOf(item.thumbHash)" alt="" loading="lazy" width="28" height="28">
                  <span v-else class="mk-av is-blank" aria-hidden="true">{{ item.name.slice(0, 1) }}</span>
                  <span>{{ item.name }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section v-if="gallery.length" class="mk-sec" aria-labelledby="mk-gallery">
        <h2 id="mk-gallery" class="ui-heading">Gallery <span class="ui-count">{{ gallery.length }}</span></h2>
        <ul class="mk-gallery">
          <li v-for="(image, index) in gallery" :key="image.hash">
            <button type="button" class="mk-gallery-open" :title="image.caption" @click="shownAt = index">
              <img :src="urlOf(image.thumbHash)" :alt="image.caption || page.title" loading="lazy">
            </button>
          </li>
        </ul>
        <Lightbox
          v-if="shownAt !== null && gallery[shownAt]"
          :images="gallery"
          :index="shownAt"
          universe-id=""
          read-only
          :name="page.title"
          :url-of="urlOf"
          @close="shownAt = null"
          @index="shownAt = $event"
        />
      </section>

      <section class="mk-sec" aria-labelledby="mk-about">
        <h2 id="mk-about" class="ui-heading">About</h2>
        <p v-if="page.description" class="mk-desc">{{ page.description }}</p>
        <p v-else class="mk-fine">No description.</p>
        <p v-if="page.tags.length" class="mk-tags">
          <RouterLink v-for="t in page.tags" :key="t" class="mk-tag" :to="{ path: '/packages', query: { tag: t } }">{{ t }}</RouterLink>
        </p>
      </section>

      <section class="mk-sec" aria-labelledby="mk-versions">
        <h2 id="mk-versions" class="ui-heading">Versions <span class="ui-count">{{ versions.length }}</span></h2>
        <p v-if="!versions.length" class="mk-fine">No version is published yet.</p>
        <ol v-else class="mk-changes">
          <li v-for="item in versions" :key="item.version">
            <b>Version {{ item.version }}</b>
            <span class="mk-st" :data-state="item.state">{{ stateWords(item.state) }}</span>
            <span class="mk-changes-what"><template v-if="item.hexCount > 0">{{ plural(item.hexCount, 'hex', 'hexes') }}, </template>{{ plural(item.recordCount, 'record', 'records') }}</span>
            <small v-if="item.error">{{ item.error }}</small>
          </li>
        </ol>
      </section>

      <section v-if="others.length" class="mk-sec" aria-labelledby="mk-more">
        <h2 id="mk-more" class="ui-heading">More by @{{ page.authorHandle }}</h2>
        <ul class="mk-grid is-more">
          <li v-for="item in others" :key="item.id"><StoreCard :card="item" :cdn="cdn" :now="now" /></li>
        </ul>
      </section>

      <footer class="mk-foot">
        <button v-if="session.user && !isAuthor && !page.hidden" type="button" class="mk-link" @click="asking = 'report'; askError = ''">Report this package</button>
        <button v-if="isAdmin && !page.hidden" type="button" class="ui-btn" @click="asking = 'takedown'; askError = ''">Take down</button>
        <button v-if="isAdmin && page.hidden" type="button" class="ui-btn" @click="asking = 'restore'; askError = ''">Restore</button>
      </footer>

      <div v-if="canImport && ready" class="mk-buybar">
        <span v-if="!session.user && session.error" class="mk-buybar-err" role="alert">{{ session.error }}</span>
        <span class="mk-buybar-title">{{ page.title }}</span>
        <button type="button" class="ui-btn is-primary" @click="buy()">{{ updateId ? 'Update' : 'Import' }}</button>
      </div>

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
</template>

<style>
.mk-hero {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr);
  gap: 24px;
  align-items: start;
  margin-bottom: 18px;
}

.mk-hero-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--store-placeholder);
}

.mk-hero-cover img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.mk-hero-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.mk-hero-kind {
  color: var(--text-muted);
  font: 600 12px/1.4 var(--font-text);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.mk-hero-title {
  margin: 0;
  color: var(--text-0);
  font: 700 28px/1.2 var(--font-display);
  overflow-wrap: anywhere;
}

.mk-hero-by {
  color: var(--text-1);
  font-size: 14px;
}

.mk-hero-facts {
  color: var(--text-muted);
  font-size: 13px;
}

.mk-buy {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  max-width: 320px;
  margin-top: 14px;
}

.mk-sec .mk-tags {
  margin-top: 10px;
}

.mk-buy .mk-buy-btn {
  justify-content: center;
  min-height: 44px;
  font-size: 15px;
}

.mk-hero.is-ghost .mk-hero-info b,
.mk-hero.is-ghost .mk-hero-info small {
  display: block;
  width: 70%;
  border-radius: var(--r-1);
  background: var(--line-soft);
}

.mk-imp-slot {
  scroll-margin-top: 16px;
}

.mk-sec {
  margin-top: 26px;
}

.mk-inside {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(0, 2fr);
  gap: 18px;
}

.mk-inside-line {
  margin: 0 0 8px;
}

.mk-recgroup h3 {
  margin: 0 0 6px;
  color: var(--text-muted);
  font: 600 12.5px/1.4 var(--font-text);
}

.mk-recgroup ul {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px 14px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.mk-recgroup li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-0);
}

.mk-av {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: var(--r-pill);
  object-fit: cover;
  background: var(--store-placeholder);
}

.mk-av.is-blank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font: 700 12px/1 var(--font-text);
}

.mk-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mk-gallery-open {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--store-placeholder);
  cursor: zoom-in;
}

.mk-gallery-open:hover {
  border-color: var(--signal-line);
}

.mk-gallery-open img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mk-changes {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mk-changes li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--line-soft);
}

.mk-changes-what {
  color: var(--text-muted);
}

.mk-changes small {
  flex-basis: 100%;
  color: var(--text-muted);
}

.mk-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 30px;
  padding-top: 12px;
  border-top: 1px solid var(--line-soft);
}

.mk-buybar {
  display: none;
}

@media (max-width: 640px) {
  .mk-hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .mk-hero-title {
    font-size: 22px;
  }

  .mk-inside {
    grid-template-columns: minmax(0, 1fr);
  }

  .mk-buy {
    display: none;
  }

  .mk-pk.has-buybar {
    padding-bottom: 72px;
  }

  .mk-buybar {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--line-1);
    background: var(--chrome-glass);
    backdrop-filter: blur(8px);
  }

  .mk-buybar-err {
    position: absolute;
    right: 16px;
    bottom: 100%;
    left: 16px;
    margin-bottom: 6px;
    padding: 6px 10px;
    border-left: 3px solid var(--danger);
    background: var(--bg-2);
    color: var(--text-1);
    font-size: 12.5px;
  }

  .mk-buybar-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--text-0);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mk-buybar .ui-btn {
    flex: 0 0 auto;
    justify-content: center;
    min-width: 120px;
    min-height: 44px;
  }
}
</style>
