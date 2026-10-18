<script setup lang="ts">
/**
 * The relationship web (UX backlog U39; streams/D.md DU39): the open campaign's linked records as a
 * force layout across the panel's width, filtered by record type and link kind. A click opens the
 * record. Pointing at a record (the mouse, or focus) names it in the bar under the web, with Locate,
 * whose tracking line starts level with that record's node.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { campaign } from '../../campaign/store.ts';
import Icon from '../../design/Icon.vue';
import { observeSize, storageGet, storageSet } from '../../platform/browser.ts';
import { locating, startLocate, stopLocate } from '../locate.ts';
import { resolveAnchor } from '../party.ts';
import { placeNow } from '../place_now.ts';
import { typeInfo } from '../records.ts';
import OrgChart from './OrgChart.vue';
import { declutter, edgeTone, layoutWeb, webChoices, webGraph } from './web_layout.ts';

const emit = defineEmits<{
    open: [id: string];
    /** The map has to be seen (a locate): the panel gives way when it covers it. */
    map: [];
}>();

/** The web, or the org chart (DU40). Kept on this device. */
const MODE_KEY = 'voyage.web.mode';
const mode = ref<'web' | 'org'>(storageGet(MODE_KEY) === 'org' ? 'org' : 'web');
function show(next: 'web' | 'org'): void {
    mode.value = next;
    storageSet(MODE_KEY, next);
    if (next === 'web') void nextTick(measure);
}

const stage = ref<HTMLElement | null>(null);
const size = ref({ w: 0, h: 0 });
let stopSize: (() => void) | null = null;

/** Off: the type or kind is hidden. Everything is shown to begin with. */
const hiddenTypes = ref<string[]>([]);
const hiddenKinds = ref<string[]>([]);

const choices = computed(() => webChoices(campaign.records, campaign.links));
/** The stage's shape, in quarter steps, so the groups are packed to suit it without a new layout every pixel. */
const aspect = computed(() => (size.value.h > 0 ? Math.max(0.25, Math.round((size.value.w / size.value.h) * 4) / 4) : 1));
const graph = computed(() => {
    const types = hiddenTypes.value.length ? new Set(choices.value.types.filter((type) => !hiddenTypes.value.includes(type))) : null;
    const kinds = hiddenKinds.value.length ? new Set(choices.value.kinds.filter((kind) => !hiddenKinds.value.includes(kind))) : null;
    return layoutWeb(webGraph(campaign.records, campaign.links, { types, kinds }), aspect.value);
});

/** The layout's square onto the stage, with room on the right for the last names. */
const PAD = 28;
const NAME_ROOM = 110;
const at = (x: number, y: number): { x: number; y: number } => ({
    x: PAD + x * Math.max(0, size.value.w - PAD - NAME_ROOM),
    y: PAD + y * Math.max(0, size.value.h - 2 * PAD),
});
/** A name's width on screen, near enough to keep names apart: the dot, then about 7 px a letter, at most 160. */
const labelWidth = (name: string): number => Math.min(160, 30 + name.length * 7);
const LABEL_H = 26;
/** Where each node stands: the layout's point, then pushed apart where names would cover each other. */
const placed = computed(() => {
    const nodes = graph.value.nodes;
    const boxes = declutter(nodes.map((node) => ({ ...at(node.x, node.y), w: labelWidth(node.name), h: LABEL_H })), size.value.w, size.value.h);
    return new Map(nodes.map((node, i) => [node.id, { x: boxes[i].x, y: boxes[i].y }]));
});
const lines = computed(() => graph.value.edges.map((edge) => {
    const a = placed.value.get(edge.from) ?? { x: 0, y: 0 };
    const b = placed.value.get(edge.to) ?? { x: 0, y: 0 };
    return { id: edge.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, tone: edgeTone(edge.kind), touches: (id: string | null) => id !== null && (edge.from === id || edge.to === id) };
}));
/** In name order, so Tab goes through the records alphabetically. */
const ordered = computed(() => [...graph.value.nodes].sort((a, b) => a.name.localeCompare(b.name)));

const pointed = ref<string | null>(null);
const pointedRecord = computed(() => {
    const record = pointed.value ? campaign.records[pointed.value] : null;
    return record && !record.deleted ? record : null;
});
const pointedPlace = computed(() => (pointedRecord.value ? resolveAnchor(pointedRecord.value.anchor, campaign.records) : null));
const pointedLinks = computed(() => graph.value.nodes.find((node) => node.id === pointed.value)?.degree ?? 0);

const KIND_WORDS: Record<string, string> = {
    member: 'Member', owns: 'Owns', crew: 'Crew', passenger: 'Passenger', commands: 'Commands', ally: 'Ally',
    rival: 'Rival', enemy: 'Enemy', contact: 'Contact', patron: 'Patron', client: 'Client', target: 'Concerns', involved: 'Involved',
};
const kindWord = (kind: string): string => KIND_WORDS[kind] ?? kind;

const flip = (list: string[], value: string): string[] => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
function toggleType(type: string): void { hiddenTypes.value = flip(hiddenTypes.value, type); }
function toggleKind(kind: string): void { hiddenKinds.value = flip(hiddenKinds.value, kind); }

function nodeY(id: string): number | null {
    const el = stage.value ? stage.value.querySelector<HTMLElement>('[data-web-node="' + id + '"]') : null;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return box.height > 0 ? box.top + box.height / 2 : null;
}

function locate(): void {
    const record = pointedRecord.value;
    const place = pointedPlace.value;
    if (!record || !place) return;
    if (locating.recordId === record.id) {
        stopLocate();
        return;
    }
    emit('map');
    startLocate(record.id, place.hexKey, () => nodeY(record.id));
}

function measure(): void {
    const el = stage.value;
    if (el) size.value = { w: el.clientWidth, h: el.clientHeight };
}

onMounted(() => {
    measure();
    if (stage.value) stopSize = observeSize(stage.value, measure);
});
onBeforeUnmount(() => { if (stopSize) stopSize(); });
// A record that is filtered away is no longer pointed at.
watch(graph, () => {
    if (pointed.value && !graph.value.nodes.some((node) => node.id === pointed.value)) pointed.value = null;
    void nextTick(measure);
});
</script>

<template>
  <section class="web" data-web aria-label="Relationships">
    <span class="ui-seg web-mode" role="group" aria-label="Show the relationships as">
      <button type="button" :aria-pressed="mode === 'web' ? 'true' : 'false'" data-web-mode="web" @click="show('web')">Web</button>
      <button type="button" :aria-pressed="mode === 'org' ? 'true' : 'false'" data-web-mode="org" @click="show('org')">Org chart</button>
    </span>
    <OrgChart v-if="mode === 'org'" @open="emit('open', $event)" />
    <div v-show="mode === 'web'" class="web-body">
    <div v-if="choices.kinds.length" class="web-filters">
      <div class="web-chips" role="group" aria-label="Record types">
        <button
          v-for="type in choices.types"
          :key="type"
          type="button"
          class="web-chip"
          :aria-pressed="hiddenTypes.includes(type) ? 'false' : 'true'"
          @click="toggleType(type)"
        >
          <Icon :name="typeInfo(type).icon" :size="11" />{{ typeInfo(type).many }}
        </button>
      </div>
      <div class="web-chips" role="group" aria-label="Link kinds">
        <button
          v-for="kind in choices.kinds"
          :key="kind"
          type="button"
          class="web-chip"
          :class="'is-' + edgeTone(kind)"
          :aria-pressed="hiddenKinds.includes(kind) ? 'false' : 'true'"
          @click="toggleKind(kind)"
        >
          <i class="web-swatch" aria-hidden="true"></i>{{ kindWord(kind) }}
        </button>
      </div>
    </div>
    <div ref="stage" class="web-stage" :class="{ 'is-pointing': pointed !== null }" @mouseleave="pointed = null">
      <svg v-if="size.w > 0" class="web-lines" :viewBox="'0 0 ' + size.w + ' ' + size.h" aria-hidden="true">
        <line
          v-for="line in lines"
          :key="line.id"
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          :class="['is-' + line.tone, { 'is-near': line.touches(pointed) }]"
        />
      </svg>
      <button
        v-for="node in ordered"
        :key="node.id"
        type="button"
        class="web-node"
        :class="{ 'is-pointed': node.id === pointed }"
        :style="{ left: (placed.get(node.id)?.x ?? 0) + 'px', top: (placed.get(node.id)?.y ?? 0) + 'px' }"
        :aria-label="node.name + ', ' + typeInfo(node.type).one + ', ' + node.degree + (node.degree === 1 ? ' link' : ' links')"
        :data-web-node="node.id"
        @click="emit('open', node.id)"
        @mouseenter="pointed = node.id"
        @focus="pointed = node.id"
      >
        <span class="web-dot"><Icon :name="typeInfo(node.type).icon" :size="11" /></span>
        <span class="web-name">{{ node.name }}</span>
      </button>
      <p v-if="!graph.nodes.length" class="web-empty">
        <template v-if="choices.kinds.length">Nothing is linked among the types and links shown. Turn one back on above.</template>
        <template v-else>No links yet. Link two records on a record's page, under Links, and they appear here.</template>
      </p>
    </div>
    <p class="web-bar" role="status">
      <template v-if="pointedRecord">
        <b>{{ pointedRecord.name }}</b>
        <span>{{ typeInfo(pointedRecord.type).one }} · {{ pointedLinks }} {{ pointedLinks === 1 ? 'link' : 'links' }} · {{ placeNow(pointedRecord) }}</span>
        <button
          v-if="pointedPlace"
          type="button"
          class="ui-btn web-locate"
          :aria-pressed="locating.recordId === pointedRecord.id ? 'true' : 'false'"
          @click="locate"
          @mouseenter="pointed = pointedRecord.id"
        >
          <Icon name="location-crosshairs" :size="13" />{{ locating.recordId === pointedRecord.id ? 'Locating' : 'Locate' }}
        </button>
      </template>
      <span v-else-if="graph.nodes.length" class="web-hint">Point at a record to see where it is. Click one to open it.</span>
    </p>
    </div>
  </section>
</template>

<style>
.web {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
  padding: 0 16px 12px;
  box-sizing: border-box;
}

.web-mode {
  align-self: flex-start;
}

.web-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.web-filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.web-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.web-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-muted);
  font: 600 12px/1 var(--font-text);
  cursor: pointer;
}

.web-chip[aria-pressed='true'] {
  border-color: var(--signal-line);
  background: var(--row-active);
  color: var(--text-0);
}

.web-chip:focus-visible,
.web-node:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.web-swatch {
  width: 12px;
  height: 3px;
  border-radius: var(--r-1);
  background: var(--line-2);
}

.web-chip.is-friend .web-swatch { background: var(--signal); }
.web-chip.is-foe .web-swatch { background: var(--danger); }
.web-chip.is-work .web-swatch { background: var(--attention); }

.web-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 440px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-0);
  overflow: hidden;
}

.web-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.web-lines line {
  stroke: var(--line-2);
  stroke-width: 1.5;
}

.web-lines line.is-friend { stroke: var(--signal); }
.web-lines line.is-foe { stroke: var(--danger); }
.web-lines line.is-work { stroke: var(--attention); }

.web-stage.is-pointing .web-lines line { opacity: 0.25; }
.web-stage.is-pointing .web-lines line.is-near { opacity: 1; stroke-width: 2.5; }

/* The node's dot sits on its point; the name runs to the right of it. */
.web-node {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 160px;
  padding: 0 6px 0 0;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font: 600 12px/1.2 var(--font-text);
  translate: -12px -12px;
  cursor: pointer;
}

.web-dot {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--line-2);
  border-radius: 50%;
  background: var(--bg-1);
  color: var(--text-0);
}

.web-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 0 4px var(--bg-0), 0 0 2px var(--bg-0);
}

.web-node:hover .web-dot,
.web-node.is-pointed .web-dot {
  border-color: var(--signal);
  color: var(--signal-bright);
}

.web-node.is-pointed .web-name {
  color: var(--text-0);
}

.web-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 24px;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
  text-align: center;
}

.web-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-height: 34px;
  margin: 0;
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
}

.web-bar b {
  color: var(--text-0);
}

.web-locate {
  margin-left: auto;
}

.web-hint {
  color: var(--text-muted);
}

@media (max-width: 680px) {
  .web-chip {
    min-height: 44px;
  }

  .web-dot {
    width: 32px;
    height: 32px;
  }

  .web-node {
    translate: -16px -16px;
  }
}
</style>
