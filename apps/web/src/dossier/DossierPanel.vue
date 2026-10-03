<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, TreeEnvelope } from '@voyage/shared';
import { observeSize } from '../platform/browser.ts';
import Icon from '../design/Icon.vue';
import Panel from '../shell/Panel.vue';
import { readSpan, writeSpan, type PanelSpan } from '../shell/panel_state.ts';
import BodyGlyph from './BodyGlyph.vue';
import DossierBody from './DossierBody.vue';
import DossierOverview from './DossierOverview.vue';
import { bodyKeys, bodyModel, overviewModel, pickSystem, type AllegianceName } from './model.ts';

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

const overview = computed(() => {
    if (!props.entry) return null;
    return overviewModel({
        sectorName: props.sectorName,
        subsectorName: props.subsectorName,
        hex: props.hex,
        entry: props.entry,
        tree: props.error ? null : props.tree,
        allegiances: props.allegiances,
    });
});

const profile = computed(() => {
    if (!props.tree || !props.bodyKey || props.error) return null;
    const system = pickSystem(props.tree.body);
    if (!system || !bodyKeys(system).includes(props.bodyKey)) return null;
    return bodyModel(props.tree, props.bodyKey);
});

const title = computed(() => {
    if (profile.value) return profile.value.title;
    if (overview.value) return overview.value.header.title;
    return props.hex || 'World';
});

const meta = computed(() => {
    if (profile.value) return profile.value.place;
    if (overview.value) return overview.value.header.place;
    return '';
});

const chip = computed(() => overview.value && !profile.value ? overview.value.header.hexChip : '');

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

function overviewPath(): string {
    return '/s/' + encodeURIComponent(props.slug) + '/' + props.hex;
}

function openKey(key: string): void {
    void router.push({ path: overviewPath() + '/b/' + encodeURIComponent(key), query: route.query });
}

function showOverview(): void {
    void router.push({ path: overviewPath(), query: route.query });
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
    <Panel ref="panel" :open="open" :title="title" :meta="meta" :chip="chip" :span="span" @close="$emit('close')" @span="chooseSpan">
      <template v-if="profile" #eyebrow>
        <button type="button" class="doss-crumb" @click="showOverview">
          <Icon name="arrow-left" :size="10" />{{ profile.crumbSystem }}
        </button>
        <template v-if="profile.crumbParent">
          <span class="doss-crumb-sep">/</span>
          <button type="button" class="doss-crumb" @click="openKey(profile.crumbParent.key)">{{ profile.crumbParent.name }}</button>
        </template>
      </template>
      <template v-if="profile && bodyKey" #glyph>
        <BodyGlyph :glyph="profile.glyph" :mainworld="profile.mapBadge !== ''" :size="26" />
      </template>
      <template v-if="profile" #actions>
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
      </template>
      <DossierBody v-if="profile" :model="profile" :span="span" @open="openKey" />
      <DossierOverview v-else-if="overview" :model="overview" :span="span" :error="error" @open="openKey" @retry="$emit('retry')" />
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

/* Legacy .atlas-body-count: where this body sits among the system's bodies. */
.doss-position {
  margin: 0 2px;
  color: var(--text-muted);
  font-size: 11.5px;
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
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

/* Half and full: the map leads the first column; the other columns run the full height. */
.doss[data-span="half"],
.doss[data-span="full"] {
  display: grid;
  align-items: stretch;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px 22px;
  height: 100%;
  min-height: 0;
}

.doss[data-span="half"] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.doss[data-span="full"] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr);
}

.doss[data-span="half"] .doss-map,
.doss[data-span="full"] .doss-map {
  grid-column: 1;
  grid-row: 1;
  width: 100%;
  margin: 0;
}

.doss[data-span="half"] .doss-identity,
.doss[data-span="full"] .doss-identity {
  grid-column: 1;
  grid-row: 2;
}

.doss[data-span="half"] .doss-side {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.doss[data-span="full"] .doss-side {
  display: contents;
}

.doss[data-span="full"] .doss-socio {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.doss[data-span="full"] .doss-tree {
  grid-column: 3;
  grid-row: 1 / span 2;
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
