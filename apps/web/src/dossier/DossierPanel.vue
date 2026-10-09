<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, TreeEnvelope } from '@voyage/shared';
import { observeSize } from '../platform/browser.ts';
import Icon from '../design/Icon.vue';
import Panel from '../shell/Panel.vue';
import { addressPane } from '../shell/pane.ts';
import { readSpan, writeSpan, type PanelSpan } from '../shell/panel_state.ts';
import { session } from '../account/session.ts';
import { campaign } from '../campaign/store.ts';
import { retryCampaign } from '../workspace/opening.ts';
import { bodyCounts, hexKeyOf } from '../workspace/places.ts';
import RecordsHere from '../workspace/RecordsHere.vue';
import { buildReady, hexState, placeNames } from '../workspace/build/acts.ts';
import BuildBar from '../workspace/build/BuildBar.vue';
import BuildPane from '../workspace/build/BuildPane.vue';
import BuildScope from '../workspace/build/BuildScope.vue';
import { scopeTitle } from '../workspace/build/scope.ts';
import { subsectorLetter } from '../builder/address.ts';
import { build, choiceLine, plural, spanLine } from '../workspace/build/state.ts';
import BodyGlyph from './BodyGlyph.vue';
import DossierBody from './DossierBody.vue';
import DossierOverview from './DossierOverview.vue';
import { bodyByKey, dossierPath, orbitPath } from '../orbit/bodies.ts';
import { orbitOpenLocation } from './orbit_open.ts';
import { parseLinkDate, startDays } from '../orbit/clock.ts';
import { dayNightFigure, markerAt, starportTick, turningOf, yearFigure } from '../orbit/daynight.ts';
import { planSystem, type Plan } from '../orbit/layout.ts';
import { bodyAngle } from '../orbit/maths.ts';
import { bodyKeys, bodyModel, overviewModel, pickSystem, type AllegianceName } from './model.ts';
import type { SurfaceTarget } from './SurfaceStage.vue';

const props = defineProps<{
    open: boolean;
    slug: string;
    hex: string;
    sectorName: string;
    subsectorName: string;
    entry: SectorHex | null;
    tree: TreeEnvelope | null;
    bodyKey: string | null;
    error: boolean;
    pending: boolean;
    missing: boolean;
    allegiances: AllegianceName[];
    /** The panel sits beside the orbit view: its links stay on the orbit route. */
    orbit?: boolean;
}>();

const emit = defineEmits<{
    close: [];
    retry: [];
    width: [px: number];
}>();

const route = useRoute();
const router = useRouter();
const panel = ref<{ element: HTMLElement | null } | null>(null);
const span = ref<PanelSpan>(readSpan());
let stopSize: (() => void) | null = null;
let sized: HTMLElement | null = null;

/** This hex as a key, when the panel shows one. */
const hexKey = computed(() => (props.slug && props.hex ? hexKeyOf(props.slug, props.hex) : ''));
/** Build is on, a universe is open, and this is the map's panel (not the orbit view's). */
const building = computed(() => buildReady() && !props.orbit && hexKey.value !== '');
/** The address is a sector or a subsector and Build is on: that is what is selected. */
const scope = computed((): { slug: string; letter: string | null } | null => {
    if (!buildReady() || props.orbit || props.hex) return null;
    const view = addressPane(route.path, route.query).view;
    if (view.kind === 'sector') return { slug: view.sector, letter: null };
    if (view.kind === 'subsector') return { slug: view.sector, letter: view.letter };
    return null;
});
/** A system rolled for this hex and not kept: the panel shows it in place of what is stored. */
const preview = computed(() => (building.value && build.preview && build.preview.hexKey === hexKey.value ? build.preview : null));
const liveEntry = computed(() => (preview.value ? preview.value.entry : props.entry));
const liveTree = computed(() => (preview.value ? preview.value.tree : props.tree));
const liveError = computed(() => (preview.value ? false : props.error));

const overview = computed(() => {
    if (!liveEntry.value) return null;
    return overviewModel({
        sectorName: props.sectorName,
        subsectorName: props.subsectorName,
        hex: props.hex,
        entry: liveEntry.value,
        tree: liveError.value ? null : liveTree.value,
        allegiances: props.allegiances,
    });
});

/**
 * What Build makes of the selection: many hexes, an empty hex, a hex the builder removed,
 * or one system. Null when Build is off, and while the sector is still arriving.
 */
const buildMode = computed((): 'many' | 'empty' | 'removed' | 'system' | 'scope' | null => {
    // A hand-picked selection is shown from the sector's or the subsector's address.
    if (scope.value) return build.selection.length > 1 ? 'many' : 'scope';
    if (!building.value) return null;
    if (build.selection.length > 1) return 'many';
    if (overview.value) return 'system';
    if (!props.missing) return null;
    return hexState(hexKey.value) === 'removed' ? 'removed' : 'empty';
});
const buildKeys = computed(() => (buildMode.value === 'many' ? build.selection : [hexKey.value]));
const places = computed(() => (scope.value
    ? { sector: props.sectorName, subsector: scope.value.letter ? props.subsectorName : '' }
    : placeNames(hexKey.value)));

const profile = computed(() => {
    if (buildMode.value === 'many') return null;
    const tree = liveTree.value;
    if (!tree || !props.bodyKey || liveError.value) return null;
    const system = pickSystem(tree.body);
    if (!system || !bodyKeys(system).includes(props.bodyKey)) return null;
    return bodyModel(tree, props.bodyKey);
});

/** How long the day is on the body shown and how its daylight ranges over the year; stars have none. */
const dayNight = computed(() => {
    if (!liveTree.value || !props.bodyKey || liveError.value) return null;
    const system = pickSystem(liveTree.value.body);
    const found = system ? bodyByKey(system, props.bodyKey) : null;
    return found && !found.star ? dayNightFigure(found.body, found.parent) : null;
});

/**
 * The view's date: the link's date and time when it carries one, else the campaign date,
 * else the clock's default (day 002 of 1105 at 0000). A fraction is the time of day.
 */
const clockDays = computed(() => {
    const linked = parseLinkDate(route.query.date, route.query.time);
    if (linked !== null) return linked;
    const stored = campaign.clock ? campaign.clock.days : null;
    if (stored !== null && Number.isFinite(stored)) return stored;
    return startDays(null);
});

/**
 * Direction from the body to the star it orbits. A world circles its star, so the star
 * lies half a turn from the body's orbit angle. A moon is close to its world, so it
 * takes that world's direction.
 */
function starDirection(system: Record<string, unknown>, hexKey: string, key: string, days: number): number {
    const plan = planSystem(system as Record<string, any>, hexKey);
    const world = plan.worlds.find((item) => item.key === key);
    const host = world ?? plan.worlds.find((item) => item.moons.some((moon) => moon.key === key));
    if (!host || !(host.period > 0)) return 0;
    return bodyAngle(host.epoch, host.period, days) + Math.PI;
}

/** The orbit picture's plan, kept so a running clock does not lay the system out every frame. */
let aimed: { system: Record<string, unknown>; hexKey: string; plan: Plan } | null = null;

/**
 * The marker's share of the strip at one clock value. OrbitCanvas publishes that value
 * each frame from the paint() OrbitView already calls; DayNight subscribes while this
 * panel sits on the orbit view.
 */
function placeOnStrip(days: number): number | null {
    if (!liveTree.value || !props.bodyKey || liveError.value) return null;
    const system = pickSystem(liveTree.value.body);
    const found = system ? bodyByKey(system, props.bodyKey) : null;
    if (!system || !found || found.star) return null;
    if (!aimed || aimed.system !== system || aimed.hexKey !== liveTree.value.hexKey) {
        aimed = { system, hexKey: liveTree.value.hexKey, plan: planSystem(system as Record<string, any>, liveTree.value.hexKey) };
    }
    const key = props.bodyKey;
    const world = aimed.plan.worlds.find((item) => item.key === key);
    const host = world ?? aimed.plan.worlds.find((item) => item.moons.some((moon) => moon.key === key));
    const angle = host && host.period > 0 ? bodyAngle(host.epoch, host.period, days) + Math.PI : 0;
    return markerAt(turningOf(found.body, !!found.parent), days, angle);
}

/** Local time at the starport (longitude 0) for the view's date. Hidden when there is no day. */
const tick = computed(() => {
    if (!dayNight.value || dayNight.value.locked || !liveTree.value || !props.bodyKey || liveError.value) return null;
    const system = pickSystem(liveTree.value.body);
    const found = system ? bodyByKey(system, props.bodyKey) : null;
    if (!system || !found || found.star) return null;
    const days = clockDays.value;
    return starportTick(turningOf(found.body, !!found.parent), days, starDirection(system, liveTree.value.hexKey, props.bodyKey, days));
});

/** The Year tile said so it cannot be misread: standard days first, then standard years and the world's own days. */
const restated = computed(() => {
    if (!liveTree.value || !props.bodyKey || liveError.value) return undefined;
    const system = pickSystem(liveTree.value.body);
    const found = system ? bodyByKey(system, props.bodyKey) : null;
    const year = found && !found.star ? yearFigure(found.body) : null;
    if (!year) return undefined;
    // Each figure leads its row, with what it counts to its right: the year in standard days
    // (and standard years), then in the world's own days.
    const count = (text: string): string => text.split(' ')[0] || text;
    const rows = [{ value: count(year.days), notes: ['standard days (24 h)', year.years].filter((note): note is string => note !== null) }];
    if (year.localDays) rows.push({ value: count(year.localDays), notes: ['local days'] });
    return { Year: rows };
});

/** The body whose surface the profile maps: the one shown, as the released document holds it. */
const bodySurface = computed((): SurfaceTarget | null => {
    if (!liveTree.value || !props.bodyKey || liveError.value) return null;
    const system = pickSystem(liveTree.value.body);
    const found = system ? bodyByKey(system, props.bodyKey) : null;
    return found && !found.star ? { hexKey: liveTree.value.hexKey, dossierKey: props.bodyKey, body: found.body } : null;
});

const title = computed(() => {
    if (buildMode.value === 'many') return plural(build.selection.length, 'hex', 'hexes');
    if (buildMode.value === 'scope' && scope.value) return scopeTitle(scope.value, props.sectorName, (key) => placeNames(key).subsector);
    if (buildMode.value === 'empty' || buildMode.value === 'removed') return 'Empty hex';
    if (profile.value) return profile.value.title;
    if (overview.value) return overview.value.header.title;
    return props.hex || 'World';
});

const meta = computed(() => {
    if (buildMode.value === 'many') return spanLine(build.selection);
    if (buildMode.value === 'scope') return scope.value && scope.value.letter ? 'Subsector ' + scope.value.letter + ' · 80 hexes' : 'Sector · 1,280 hexes';
    // In Build the line above the title says where; it is not said twice.
    if (buildMode.value) return profile.value ? profile.value.place : '';
    if (profile.value) return profile.value.place;
    if (overview.value) return overview.value.header.place;
    return '';
});

const chip = computed(() => {
    if (buildMode.value === 'many' || buildMode.value === 'scope') return '';
    if (buildMode.value === 'empty' || buildMode.value === 'removed') return props.hex;
    return overview.value && !profile.value ? overview.value.header.hexChip : '';
});

/** The last word of the line to climb: what state the thing shown is in, when it has one worth saying. */
const buildWord = computed(() => {
    if (preview.value) return 'Preview';
    if (buildMode.value === 'removed') return 'Removed';
    return '';
});

function openSubsector(letter: string): void {
    void router.push({ path: '/s/' + encodeURIComponent(props.slug) + '/sub/' + letter, query: route.query });
}

function openSector(): void {
    build.selection = [];
    void router.push({ path: '/s/' + encodeURIComponent(props.slug), query: route.query });
}

/** From a hex, up one step: the subsector it lies in. */
function openOwnSubsector(): void {
    const letter = subsectorLetter(props.hex);
    if (letter) openSubsector(letter);
}

/** One hex of a many-hex selection, opened on its own. */
function openHex(key: string): void {
    const cut = key.lastIndexOf('/');
    build.selection = [];
    void router.push({ path: '/s/' + encodeURIComponent(key.slice(0, cut)) + '/' + key.slice(cut + 1), query: route.query });
}

/** The signed-in user's campaign records on each body of this system, for the tree's counts. */
const recordCounts = computed(() => (session.user && campaign.status === 'ready' && props.slug && props.hex
    ? bodyCounts(campaign.records, hexKeyOf(props.slug, props.hex))
    : {}));

function panelElement(): HTMLElement | null {
    return panel.value ? panel.value.element : null;
}

function publish(): void {
    const el = panelElement();
    const px = props.open && el ? el.offsetWidth : 0;
    emit('width', px);
}

function bindSize(): void {
    const el = panelElement();
    if (el === sized) return;
    if (stopSize) stopSize();
    stopSize = null;
    sized = el;
    if (el) stopSize = observeSize(el, publish);
}

function chooseSpan(next: PanelSpan): void {
    span.value = next;
    writeSpan(next);
    void nextTick(publish);
}

/** The system, or one body of it, on the route this panel is shown in. */
function pathTo(key: string | null): string {
    return props.orbit ? orbitPath(props.slug, props.hex, key) : dossierPath(props.slug, props.hex, key);
}

function openKey(key: string): void {
    void router.push({ path: pathTo(key), query: route.query });
}

function showOverview(): void {
    void router.push({ path: pathTo(null), query: route.query });
}

/** Into the orbit view, on this body when one is open. The pane, the camera and the clock stay. */
function openOrbit(key: string | null): void {
    void router.push(orbitOpenLocation(props.slug, props.hex, key, route.query));
}

watch(() => props.open, () => { void nextTick(publish); });
watch(span, () => { void nextTick(() => { bindSize(); publish(); }); });

onMounted(() => {
    bindSize();
    void nextTick(publish);
});

onBeforeUnmount(() => {
    if (stopSize) stopSize();
    emit('width', 0);
});

defineExpose({ remeasure: publish });
</script>

<template>
  <div class="dossier-root">
    <Panel ref="panel" :open="open" :title="title" :meta="meta" :chip="chip" :span="span" :keep-chip="buildMode !== null" @close="$emit('close')" @span="chooseSpan">
      <template v-if="profile || buildMode" #eyebrow>
        <template v-if="profile">
          <button type="button" class="doss-crumb" @click="showOverview">
            <Icon name="arrow-left" :size="10" />{{ profile.crumbSystem }}
          </button>
          <template v-if="profile.crumbParent">
            <span class="doss-crumb-sep">/</span>
            <button type="button" class="doss-crumb" @click="openKey(profile.crumbParent.key)">{{ profile.crumbParent.name }}</button>
          </template>
        </template>
        <template v-else>
          <!-- Build's line to climb: the sector is a link; the subsector waits for its address. -->
          <!-- On the sector's own page the line names the universe's sector plainly: there is nothing above it to climb to. -->
          <span v-if="buildMode === 'scope' && scope && !scope.letter">Sector</span>
          <button v-else type="button" class="doss-crumb" @click="openSector">{{ places.sector || sectorName }}</button>
          <template v-if="buildMode === 'scope' && scope && scope.letter">
            <span class="doss-crumb-sep">/</span><span>Subsector</span>
          </template>
          <template v-else-if="buildMode !== 'scope' && places.subsector">
            <span class="doss-crumb-sep">/</span>
            <button v-if="hex" type="button" class="doss-crumb" @click="openOwnSubsector">{{ places.subsector }}</button>
            <span v-else>{{ places.subsector }}</span>
          </template>
          <template v-if="buildWord"><span class="doss-crumb-sep">/</span><span class="doss-crumb-word">{{ buildWord }}</span></template>
        </template>
      </template>
      <template v-if="profile && bodyKey" #glyph>
        <BodyGlyph :glyph="profile.glyph" :mainworld="profile.mapBadge !== ''" :size="26" />
      </template>
      <template v-if="profile || buildMode === 'system'" #actions>
        <template v-if="profile">
          <button
            type="button"
            class="ui-btn is-icon"
            aria-label="Previous body"
            title="Previous"
            :disabled="!profile.prev"
            @click="profile.prev && openKey(profile.prev)"
          >
            <Icon name="chevron-left" :size="13" />
          </button>
          <span class="doss-position">{{ profile.index }} / {{ profile.total }}</span>
          <button
            type="button"
            class="ui-btn is-icon"
            aria-label="Next body"
            title="Next"
            :disabled="!profile.next"
            @click="profile.next && openKey(profile.next)"
          >
            <Icon name="chevron-right" :size="13" />
          </button>
          <button v-if="!orbit && !preview" type="button" class="ui-btn doss-orbits" title="Open the orbit view on this body" @click="openOrbit(bodyKey)">
            <Icon name="solar-system" :size="13" />Orbits
          </button>
        </template>
        <BuildBar v-else :hex-key="hexKey" :name="overview ? (overview.header.name || overview.header.title) : hex" />
      </template>
      <BuildScope v-if="buildMode === 'scope' && scope" :slug="scope.slug" :letter="scope.letter" :span="span" @subsector="openSubsector" @open="openHex" />
      <BuildPane v-else-if="buildMode === 'many' || buildMode === 'empty' || buildMode === 'removed'" :mode="buildMode" :keys="buildKeys" :span="span" @open="openHex" />
      <DossierBody v-else-if="profile" :model="profile" :span="span" :day-night="dayNight" :tick="tick" :live="orbit === true" :place="placeOnStrip" :restated="restated" :surface="bodySurface" @open="openKey">
        <template #records>
          <RecordsHere
            v-if="!preview"
            :slug="slug"
            :hex="hex"
            :system-name="overview ? (overview.header.name || overview.header.title) : ''"
            :body-key="bodyKey"
            :body-name="profile.title"
            @retry="retryCampaign()"
          />
        </template>
      </DossierBody>
      <template v-else-if="overview">
        <p v-if="preview" class="doss-preview" role="status">
          A preview. Nothing is kept yet. {{ choiceLine(preview.choice) }}, roll {{ preview.roll + 1 }}.
        </p>
        <p v-if="building && build.error" class="doss-preview is-error" role="alert">{{ build.error }}</p>
        <DossierOverview
          :model="overview"
          :span="span"
          :error="liveError"
          :orbit-link="!orbit && !preview"
          :plain-orbit="buildMode !== null"
          :hex-key="preview ? undefined : hexKey"
          :counts="recordCounts"
          @open="openKey"
          @orbit="openOrbit(null)"
          @retry="$emit('retry')"
        >
          <template #records>
            <RecordsHere v-if="!preview" :slug="slug" :hex="hex" :system-name="overview.header.name || overview.header.title" :body-key="null" body-name="" @retry="retryCampaign()" />
          </template>
        </DossierOverview>
      </template>
      <p v-else-if="missing" class="doss-muted doss-pad">This hex has no world in the sector index.</p>
      <p v-else-if="pending" class="doss-muted doss-pad">Loading this sector.</p>
    </Panel>
  </div>
</template>

<style>
/*
 * Layout of the dossier at the three panel widths, ported from style.css 2720-2991
 * (#atlas-content.dossier-view and .body-view). The parts carry their own styles.
 */
.dossier-root {
  display: contents;
}

.doss-muted {
  margin: 12px 0 0;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
}

.doss-pad {
  margin: 0;
  padding: 22px 16px;
}

.doss-crumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.doss-crumb:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.doss-crumb-sep {
  color: var(--text-muted);
}

/* The state of what Build shows (Preview, Removed), as the last word of the line. */
.doss-crumb-word {
  color: var(--attention);
}

/* One line over a rolled system that is not kept, and the place a failed roll says why. */
.doss-preview {
  margin: 14px 16px 0;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--attention);
  border-radius: var(--r-2);
  background: var(--panel-raised);
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.doss-preview.is-error {
  border-left-color: var(--danger);
}

/* Legacy .atlas-body-count: where this body sits among the system's bodies. */
.doss-position {
  margin: 0 2px;
  color: var(--text-muted);
  font-size: 11.5px;
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

.doss-orbits {
  margin-left: auto;
}

.doss-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 8px 0;
}

.doss-identity > .doss-actions:first-child {
  margin-top: 0;
}

.doss-section {
  margin-top: 4px;
}

.doss,
.doss-body {
  padding: 14px 16px 18px;
}

/* Column: one scrolling column in document order. */
.doss[data-span="column"],
.doss-body[data-span="column"] {
  display: flex;
  flex-direction: column;
}

.doss[data-span="column"] .doss-side,
.doss-body[data-span="column"] .doss-body-side {
  display: contents;
}

.doss[data-span="column"] .doss-socio {
  margin-top: 18px;
}

/* Half and full: identity, socioeconomics and the tree, each the full height. The map stays on the world page. */
.doss[data-span="half"],
.doss[data-span="full"] {
  display: grid;
  align-items: stretch;
  grid-template-rows: minmax(0, 1fr);
  gap: 0 22px;
  height: 100%;
  min-height: 0;
}

.doss[data-span="half"] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.doss[data-span="full"] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr);
}

.doss[data-span="half"] .doss-identity,
.doss[data-span="full"] .doss-identity {
  grid-column: 1;
  grid-row: 1;
}

.doss[data-span="half"] .doss-side {
  grid-column: 2;
  grid-row: 1;
}

.doss[data-span="full"] .doss-side {
  display: contents;
}

.doss[data-span="full"] .doss-socio {
  grid-column: 2;
  grid-row: 1;
}

.doss[data-span="full"] .doss-tree {
  grid-column: 3;
  grid-row: 1;
}

.doss[data-span="half"] .doss-identity,
.doss[data-span="half"] .doss-side,
.doss[data-span="full"] .doss-identity,
.doss[data-span="full"] .doss-socio,
.doss[data-span="full"] .doss-tree {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  padding-inline-end: 14px;
  /* Room for a focus ring on the first control and along the left edge. */
  margin: -6px 0 0 -6px;
  padding-top: 6px;
  padding-left: 6px;
}

.doss[data-span="half"] .doss-tree {
  margin-top: 18px;
}

/* A body profile at half and full: two columns that scroll together. */
.doss-body[data-span="half"],
.doss-body[data-span="full"] {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 26px;
  align-items: start;
}

.doss-body[data-span="full"] {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
}

.doss-body[data-span="half"] .doss-map,
.doss-body[data-span="full"] .doss-map {
  width: 100%;
}

.doss-body[data-span="half"] .doss-body-side > .doss-section:first-child .ui-heading,
.doss-body[data-span="full"] .doss-body-side > .doss-section:first-child .ui-heading {
  margin-top: 0;
}
</style>
