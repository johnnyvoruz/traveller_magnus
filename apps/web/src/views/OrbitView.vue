<script setup lang="ts">
/**
 * The orbit view, /s/:sector/:hex/orbit (slice 1 part C; findings/orbit_view_design.md).
 * The route, the system's dossier at the left, the nav bar, the time controls, the orbit
 * picture and the body chips. All clock arithmetic is orbit/clock.ts and the picture is
 * orbit/OrbitCanvas.vue; this file holds the clock's number, the frame loop and the wiring.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, SectorIndex, TreeEnvelope } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import DossierPanel from '../dossier/DossierPanel.vue';
import { formatDisplayNumber } from '../dossier/labels.ts';
import { overviewModel, pickSystem, type AllegianceName } from '../dossier/model.ts';
import { TruthClient } from '../map/truth_client.ts';
import BodyChips from '../orbit/BodyChips.vue';
import LayerChips from '../orbit/LayerChips.vue';
import { planSystem } from '../orbit/layout.ts';
import LineupSearch from '../orbit/LineupSearch.vue';
import { DEFAULT_LAYERS, type Layers, type Mode } from '../orbit/picture.ts';
import { bodyChips, dossierPath, findChip, orbitPath, subsectorLetter } from '../orbit/bodies.ts';
import {
    advance, DAY_SECONDS, formatLinkDate, scrubbed, skipHours, startDays, tickRate, REAL_TIME,
} from '../orbit/clock.ts';
import OrbitCanvas from '../orbit/OrbitCanvas.vue';
import OrbitHeader from '../orbit/OrbitHeader.vue';
import { detectSystem, normalizeSystem } from '../orbit/system.ts';
import TimeControls from '../orbit/TimeControls.vue';
import { cancelFrame, nextFrame, now, pageOrigin } from '../platform/browser.ts';
import Rail from '../shell/Rail.vue';
import { loadSession } from '../account/session.ts';
import AccountMenu from '../workspace/AccountMenu.vue';
import ToastStrip from '../shell/ToastStrip.vue';
import { handleKey, registerCommand } from '../shell/registry.ts';

const route = useRoute();
const router = useRouter();
const rootEl = ref<HTMLElement | null>(null);
const stageEl = ref<InstanceType<typeof OrbitCanvas> | null>(null);

const client = new TruthClient({
    cdnBase: import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage',
    apiBase: pageOrigin(),
    fetch,
});

function param(value: unknown): string {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' ? raw : '';
}

const slug = computed(() => param(route.params.sector));
const hex = computed(() => param(route.params.hex));
const bodyParam = computed(() => param(route.params.body));

// ---- The system document -------------------------------------------------

const version = ref('');
const arrivals = ref(0);
const tree = ref<TreeEnvelope | null>(null);
const treeError = ref(false);
const versionError = ref(false);
let treeTicket = 0;

const index = computed((): SectorIndex | null => {
    void arrivals.value;
    return version.value ? client.index(version.value, slug.value) : null;
});

const entry = computed((): SectorHex | null => (index.value ? index.value.hexes[hex.value] ?? null : null));
const missing = computed(() => index.value !== null && entry.value === null);

const subsectorName = computed(() => {
    const letter = subsectorLetter(hex.value);
    if (!index.value || !letter) return '';
    const names = index.value.metadata?.names;
    const found = names ? names[letter] : undefined;
    return found ? found : 'Subsector ' + letter;
});

const allegiances = computed((): AllegianceName[] => {
    const table = (index.value?.metadata as { allegiances?: { code: string; name: string }[] } | undefined)?.allegiances ?? [];
    return table.map((row) => ({ code: row.code, name: row.name }));
});

const overview = computed(() => {
    if (!index.value || !entry.value) return null;
    return overviewModel({
        sectorName: index.value.name,
        subsectorName: subsectorName.value,
        hex: hex.value,
        entry: entry.value,
        tree: treeError.value ? null : tree.value,
        allegiances: allegiances.value,
    });
});

const chips = computed(() => (overview.value && overview.value.tree
    ? bodyChips(overview.value.tree.rows, overview.value.header.title)
    : []));

const selectedKey = computed(() => (findChip(chips.value, bodyParam.value || null) ? bodyParam.value : null));

/** The rules edition the system was generated under (orbit/system.ts detectSystem), or empty. */
const edition = computed(() => {
    const found = tree.value && !treeError.value ? detectSystem(tree.value.body) : null;
    return found ? found.edition : '';
});

/** The normalised orbit model. Null for an edition the model does not read yet. */
const system = computed(() => (tree.value && !treeError.value ? normalizeSystem(tree.value.body) : null));

/** The hex key comes from the route; the model does not carry it. */
const hexKey = computed(() => slug.value + '/' + hex.value);

/** The system as the line-up search reads it: the same start angles and periods the picture draws with. */
const searchPlan = computed(() => (system.value ? planSystem(system.value, hexKey.value) : null));

/**
 * loading, ready, nodata (no document, or one with no bodies), unsupported (an edition the
 * orbit model does not read yet), missing (no such world), failed.
 */
const state = computed(() => {
    if (versionError.value || treeError.value) return 'failed';
    if (!index.value) return 'loading';
    if (!entry.value) return 'missing';
    if (entry.value.tree === null) return 'nodata';
    if (!tree.value) return 'loading';
    if (!chips.value.length) return 'nodata';
    return system.value ? 'ready' : 'unsupported';
});

const title = computed(() => (overview.value ? overview.value.header.title : hex.value));
const hexChip = computed(() => (overview.value ? overview.value.header.hexChip : ''));
const place = computed(() => (overview.value ? overview.value.header.place : slug.value.replace(/_/g, ' ')));

const age = computed(() => {
    if (!tree.value) return '';
    const system = pickSystem(tree.value.body);
    // js/system_viewer.js:1672: the age in Gyr at two decimals, 0 when the system has none.
    return system ? formatDisplayNumber(system.age || 0, 2) + ' Gyr' : '';
});

function loadTree(): void {
    const found = entry.value;
    if (!found || found.tree === null) {
        treeTicket += 1;
        tree.value = null;
        return;
    }
    const cached = client.treeNow(found.tree);
    if (cached) {
        treeTicket += 1;
        tree.value = cached;
        treeError.value = false;
        return;
    }
    const ticket = ++treeTicket;
    void client.tree(found.tree).then(
        (doc) => { if (ticket === treeTicket) { tree.value = doc; treeError.value = false; } },
        () => { if (ticket === treeTicket) { tree.value = null; treeError.value = true; } },
    );
}

async function load(): Promise<void> {
    versionError.value = false;
    treeError.value = false;
    try {
        if (!version.value) version.value = await client.currentVersion();
    } catch {
        versionError.value = true;
        return;
    }
    if (!client.index(version.value, slug.value)) client.want(version.value, [slug.value]);
    loadTree();
}

function retry(): void {
    void load();
}

// ---- The clock -------------------------------------------------------------

let days = startDays(route.query.date, route.query.time);
let shownSecond = Math.floor(days * DAY_SECONDS);
const shownDays = ref(days);
const paused = ref(false);
const speed = ref(REAL_TIME);
const shuttle = ref(0);
const localTime = ref('');
let scrubStart: number | null = null;
let raf = 0;
let lastFrame = 0;
let wallSecond = -1;

/** The fields redraw when the second on screen changes, not on every frame. */
function show(): void {
    const second = Math.floor(days * DAY_SECONDS);
    if (second === shownSecond && shownDays.value === days) return;
    shownSecond = second;
    shownDays.value = days;
}

function frame(): void {
    raf = nextFrame(frame);
    const time = now();
    const rate = tickRate(paused.value, speed.value, shuttle.value);
    if (rate) {
        const before = Math.floor(days * DAY_SECONDS);
        days = advance(days, time - lastFrame, rate);
        if (Math.floor(days * DAY_SECONDS) !== before) show();
    }
    lastFrame = time;
    if (stageEl.value) stageEl.value.paint(days, time);
    const wall = Math.floor(Date.now() / 1000);
    if (wall !== wallSecond) {
        wallSecond = wall;
        localTime.value = new Date().toLocaleTimeString();
    }
}

/** The link carries the date whenever the visitor has set it; a running clock does not rewrite the link. */
function writeLink(): void {
    void router.replace({ path: route.path, query: { ...formatLinkDate(days) } });
}

function setDays(next: number): void {
    if (!Number.isFinite(next)) return;
    days = next;
    show();
}

function togglePlay(): void {
    shuttle.value = 0;
    paused.value = !paused.value;
    if (paused.value) writeLink();
}

function skip(hours: number): void {
    shuttle.value = 0;
    paused.value = true;
    setDays(skipHours(days, hours));
    writeLink();
}

function typedDays(next: number): void {
    setDays(next);
    writeLink();
}

function scrub(offset: number | null): void {
    if (offset === null) {
        if (scrubStart === null) return;
        scrubStart = null;
        writeLink();
        return;
    }
    if (scrubStart === null) scrubStart = days;
    shuttle.value = 0;
    paused.value = true;
    setDays(scrubbed(scrubStart, offset));
}

/** js/system_viewer.js:1451-1457: a line-up found: stop the clock there and show it on the fitted orbits layout. */
function showLineup(at: number): void {
    shuttle.value = 0;
    paused.value = true;
    setDays(at);
    writeLink();
    if (mode.value !== 'orbits') mode.value = 'orbits';
    else if (stageEl.value) stageEl.value.fit();
}

function shuttleTo(rate: number): void {
    const was = shuttle.value;
    if (rate) paused.value = true;
    shuttle.value = rate;
    if (!rate && was) writeLink();
}

// ---- Selection, popovers, leaving --------------------------------------------

const dossierOpen = ref(true);
/** The account pop-up at the rail's foot, as on the map. */
const accountOpen = ref(false);
const railEl = ref<{ focusAccount: () => void } | null>(null);

function closeAccount(): void {
    if (!accountOpen.value) return;
    accountOpen.value = false;
    if (railEl.value) railEl.value.focusAccount();
}
/** The layout and the layer switches: this visit's, as legacy (1183-1186 resets them on open). */
const mode = ref<Mode>('orbits');
const layers = ref<Layers>({ ...DEFAULT_LAYERS });
const panelWidth = ref(0);
const openPop = ref('');
const moonsOpen = ref<string | null>(null);

function select(key: string): void {
    moonsOpen.value = null;
    const next = selectedKey.value === key ? null : key;
    void router.push({ path: orbitPath(slug.value, hex.value, next), query: route.query });
}

/** A body clicked on the picture: selected, never toggled off. */
function pickBody(key: string): void {
    moonsOpen.value = null;
    if (selectedKey.value === key || !findChip(chips.value, key)) return;
    void router.push({ path: orbitPath(slug.value, hex.value, key), query: route.query });
}

function backToMap(): void {
    void router.push(dossierPath(slug.value, hex.value, selectedKey.value));
}

/** Escape: a popover first, then the selected body, then back to the map. */
function escape(): void {
    if (accountOpen.value) {
        closeAccount();
        return;
    }
    if (openPop.value || moonsOpen.value) {
        openPop.value = '';
        moonsOpen.value = null;
        return;
    }
    if (selectedKey.value) {
        void router.push({ path: orbitPath(slug.value, hex.value), query: route.query });
        return;
    }
    backToMap();
}

function setPop(name: string, open: boolean): void {
    moonsOpen.value = null;
    openPop.value = open ? name : '';
}

function setMoons(key: string | null): void {
    openPop.value = '';
    moonsOpen.value = key;
}

function onKey(event: KeyboardEvent): void {
    // Space on a focused control is that control's own key (legacy 4900-4906).
    if (event.key === ' ') {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('button, a, summary, select, input, textarea')) return;
    }
    handleKey(event);
}

const unregister: (() => void)[] = [];
let stopArrive: (() => void) | null = null;

watch([slug, hex], () => {
    tree.value = null;
    void load();
});
watch(entry, loadTree);

onMounted(() => {
    // A visit that starts in the orbit view still learns who is signed in, after its first frame.
    nextFrame(() => { void loadSession(); });
    stopArrive = client.onArrive(() => { arrivals.value += 1; });
    unregister.push(
        registerCommand({ id: 'orbit-escape', name: 'Back', keys: ['Escape'], run: escape }),
        registerCommand({ id: 'orbit-play', name: 'Play or pause', keys: [' '], run: togglePlay }),
        registerCommand({ id: 'home', name: 'Return to map', run: backToMap }),
        registerCommand({ id: 'system-panel', name: 'System panel', run: () => { dossierOpen.value = !dossierOpen.value; } }),
        registerCommand({ id: 'account', name: 'Account', run: () => { accountOpen.value = !accountOpen.value; } }),
        registerCommand({ id: 'campaign', name: 'Campaign', run: () => { accountOpen.value = false; void router.push('/campaign'); } }),
    );
    lastFrame = now();
    raf = nextFrame(frame);
    if (rootEl.value) rootEl.value.focus();
    void load();
});

onBeforeUnmount(() => {
    if (raf) cancelFrame(raf);
    if (stopArrive) stopArrive();
    for (const off of unregister) off();
});
</script>

<template>
  <div
    ref="rootEl"
    class="orbit"
    tabindex="-1"
    :style="{ '--panel-width': panelWidth + 'px' }"
    @keydown="onKey"
  >
    <Rail ref="railEl" :panel-open="dossierOpen" :search-open="false" :account-open="accountOpen" />
    <AccountMenu :open="accountOpen" @close="closeAccount" @campaign="router.push('/campaign')" />
    <ToastStrip />
    <DossierPanel
      orbit
      :open="dossierOpen"
      :slug="slug"
      :hex="hex"
      :sector-name="index ? index.name : ''"
      :subsector-name="subsectorName"
      :entry="entry"
      :tree="tree"
      :body-key="selectedKey"
      :error="treeError"
      :pending="!index"
      :missing="missing"
      :allegiances="allegiances"
      @close="dossierOpen = false"
      @retry="retry"
      @width="panelWidth = $event"
    />
    <section class="orbit-card" aria-label="Orbit view">
      <OrbitHeader
        :title="title"
        :chip="hexChip"
        :place="place"
        :age="age"
        :edition="edition"
        :keys-open="openPop === 'keys'"
        @back="backToMap"
        @keys="setPop('keys', $event)"
      />
      <TimeControls
        :days="shownDays"
        :paused="paused"
        :speed="speed"
        :shuttle="shuttle"
        :local-time="localTime"
        :scrub-open="openPop === 'scrub'"
        @toggle="togglePlay"
        @skip="skip"
        @days="typedDays"
        @speed="speed = $event"
        @scrub="scrub"
        @shuttle="shuttleTo"
        @pop="setPop('scrub', $event)"
      >
        <template #pops="{ compact }">
          <LineupSearch
            :compact="compact"
            v-if="state === 'ready' && searchPlan"
            :plan="searchPlan"
            :open="openPop === 'lineup'"
            :now="() => days"
            @pop="setPop('lineup', $event)"
            @show="showLineup"
          />
        </template>
      </TimeControls>
      <LayerChips
        v-if="state === 'ready' && system"
        :mode="mode"
        :layers="layers"
        :view-open="openPop === 'view'"
        @mode="mode = $event"
        @layers="layers = $event"
        @pop="setPop('view', $event)"
      />
      <div class="orbit-stage" :data-state="state">
        <OrbitCanvas
          v-if="state === 'ready' && system"
          ref="stageEl"
          :system="system"
          :hex-key="hexKey"
          :selected="selectedKey"
          :mode="mode"
          :layers="layers"
          @pick="pickBody"
        />
        <svg v-if="state !== 'ready'" class="orbit-blank" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <circle v-for="r in [70, 130, 200, 280, 370]" :key="r" class="orbit-blank-ring" cx="400" cy="400" :r="r" />
        </svg>
        <div v-if="state !== 'ready'" class="orbit-note" role="status">
          <template v-if="state === 'loading'">
            <p>Loading this system.</p>
          </template>
          <template v-else-if="state === 'unsupported'">
            <p>No orbit picture for this system yet.</p>
            <p class="orbit-note-sub">It was generated under {{ edition || 'another edition' }}; the picture reads Mongoose 2nd edition systems for now. Its bodies and their dossier are below.</p>
          </template>
          <template v-else-if="state === 'nodata'">
            <p>No orbit data for this world.</p>
            <p class="orbit-note-sub">Its survey is incomplete, so no system has been generated.</p>
            <button type="button" class="orbit-btn" @click="backToMap"><Icon name="arrow-left" :size="13" />Back to the map</button>
          </template>
          <template v-else-if="state === 'missing'">
            <p>This hex has no world in the sector index.</p>
            <button type="button" class="orbit-btn" @click="backToMap"><Icon name="arrow-left" :size="13" />Back to the map</button>
          </template>
          <template v-else>
            <p>This system could not be loaded.</p>
            <div class="orbit-note-actions">
              <button type="button" class="orbit-btn" @click="retry"><Icon name="retry" :size="13" />Retry</button>
              <button type="button" class="orbit-btn" @click="backToMap"><Icon name="arrow-left" :size="13" />Back to the map</button>
            </div>
          </template>
        </div>
        <BodyChips
          v-if="chips.length"
          class="orbit-stage-chips"
          :chips="chips"
          :selected="selectedKey"
          :moons-open="moonsOpen"
          @select="select"
          @moons="setMoons"
        />
      </div>
    </section>
  </div>
</template>

<style>
.orbit {
  position: fixed;
  inset: 0;
  background: var(--bg-0);
  outline: none;
  /* No omnibox row here, so the dossier starts at the top inset (legacy: body.orrery-open). */
  --panel-top: var(--chrome-inset);
}

/* An expanded rail pushes the dossier and the orbit card, as on the map. */
.orbit:has(.rail.is-expanded) {
  --rail-width: var(--rail-width-open);
}

.orbit-card {
  position: absolute;
  top: var(--chrome-inset);
  right: var(--chrome-inset);
  bottom: var(--chrome-inset);
  left: calc(var(--rail-width) + max(var(--chrome-inset), var(--panel-width, 0px)));
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-4);
  background: var(--bg-0);
  box-shadow: var(--shadow-panel);
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
  transition: left var(--t-rail) ease;
}

.orbit-card *,
.orbit-card *::before,
.orbit-card *::after {
  box-sizing: border-box;
}

.orbit-stage {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.orbit-blank {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.orbit-blank-ring {
  fill: none;
  stroke: var(--signal-dim);
  stroke-width: 1;
  stroke-dasharray: 4 6;
  opacity: 0.3;
}

.orbit-note {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--sp-6);
  text-align: center;
}

.orbit-note p {
  margin: 0;
  color: var(--text-1);
  font-size: 14px;
}

.orbit-note .orbit-note-sub {
  max-width: 44ch;
  color: var(--text-muted);
  font-size: 13px;
}

.orbit-note .orbit-btn,
.orbit-note-actions {
  margin-top: 6px;
}

.orbit-note-actions {
  display: flex;
  gap: 8px;
}

.orbit-note-actions .orbit-btn {
  margin-top: 0;
}

.orbit-stage-chips {
  position: relative;
  flex: 0 0 auto;
}

@media (prefers-reduced-motion: reduce) {
  .orbit-card {
    transition: none;
  }
}
</style>
