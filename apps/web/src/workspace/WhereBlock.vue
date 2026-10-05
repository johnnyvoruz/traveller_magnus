<script setup lang="ts">
/**
 * Where a record is (design §3, "Where" and the anchor's steps; §4, the locator). Shown: the
 * place in words, Locate, Show in orbit and Change. Changing: the system is picked on the
 * map or in the omnibox (workspace/pick.ts), then optionally one of its worlds or moons; the
 * anchor stores the hex key, the dossier's body key and the body's name. Or the record is
 * aboard a vessel: its anchor names that record, and it is wherever the vessel is (K5d).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CampaignRecord } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import BodyRow from '../dossier/BodyRow.vue';
import type { TreeRow } from '../dossier/model.ts';
import { orbitPath } from '../orbit/bodies.ts';
import { commands } from '../shell/registry.ts';
import { saveRecord } from './actions.ts';
import { locating, startLocate, stopLocate } from './locate.ts';
import { beginPick, endPick, type PickedSystem } from './pick.ts';
import { placeSource, type SystemInfo } from './place_source.ts';
import { bodyMatched, hexKeyOf, hexWords, liveById, parseHexKey, placeWords, resolvePlace, systemAnchor } from './places.ts';
import RecordPicker from './RecordPicker.vue';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

/** The map has to be seen (a pick, a locate): the panel gives way when it covers it. */
const emit = defineEmits<{ map: [] }>();

const route = useRoute();
const router = useRouter();
const rootEl = ref<HTMLElement | null>(null);
const locateBtn = ref<HTMLElement | null>(null);
const changeBtn = ref<HTMLElement | null>(null);

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted ? found : null;
});
const place = computed(() => (record.value ? resolvePlace(props.id, liveById(campaign.records)) : null));
/** The vessel this record is aboard, when its anchor names a live record. */
const host = computed((): CampaignRecord | null => {
    const anchor = record.value ? record.value.anchor : null;
    if (!anchor || anchor.kind !== 'record') return null;
    const found = campaign.records[anchor.id];
    return found && !found.deleted ? found : null;
});
/** The anchor names a record that is gone: the place cannot be said. */
const hostGone = computed(() => !!record.value && !!record.value.anchor && record.value.anchor.kind === 'record' && !host.value);

function openHost(): void {
    if (host.value) void router.push({ path: '/campaign/r/' + encodeURIComponent(host.value.id), query: route.query });
}
const isLocating = computed(() => locating.recordId === props.id);

// ---- A body anchor is checked against the system's own bodies -----------------

/** The system's body keys once they are known; null until then. */
const knownKeys = ref<string[] | null>(null);
let keysTicket = 0;

async function loadKeys(): Promise<void> {
    const ticket = ++keysTicket;
    knownKeys.value = null;
    const at = place.value;
    const source = placeSource();
    const where = at ? parseHexKey(at.hexKey) : null;
    if (!at || at.bodyKey === null || !source || !where) return;
    const rows = await source.bodies(where.slug, where.hex);
    if (ticket === keysTicket && rows) knownKeys.value = rows.map((row) => row.key);
}

watch(() => (place.value ? place.value.hexKey + ' ' + (place.value.bodyKey ?? '') : ''), () => { void loadKeys(); }, { immediate: true });

const matched = computed(() => (place.value ? bodyMatched(place.value, knownKeys.value) : true));
const words = computed(() => {
    if (!place.value) return [];
    return matched.value ? placeWords(place.value) : [hexWords(place.value.hexKey)];
});

// ---- Locate and the orbit view -------------------------------------------------

function originY(): number | null {
    const el = locateBtn.value;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return box.height > 0 ? box.top + box.height / 2 : null;
}

function toggleLocate(): void {
    if (!place.value) return;
    if (isLocating.value) {
        stopLocate();
        return;
    }
    emit('map');
    startLocate(props.id, place.value.hexKey, originY);
}

function showOrbit(): void {
    const at = place.value;
    const where = at ? parseHexKey(at.hexKey) : null;
    if (!at || !where) return;
    void router.push(orbitPath(where.slug, where.hex, matched.value ? at.bodyKey : null));
}

// ---- Changing the place --------------------------------------------------------

const editing = ref(false);
/** The vessel picker is open in place of the system steps. */
const boarding = ref(false);
const draft = ref<SystemInfo | null>(null);
const rows = ref<TreeRow[]>([]);
const rowsState = ref<'idle' | 'loading' | 'ready' | 'none'>('idle');
const bodyKey = ref<string | null>(null);
/** This block has a pick out on the map and the omnibox. */
let pickingHere = false;
let rowsTicket = 0;

const current = computed(() => {
    void editing.value;
    const source = placeSource();
    return source ? source.current() : null;
});

function focusIn(selector: string): void {
    void nextTick(() => {
        const el = rootEl.value ? rootEl.value.querySelector<HTMLElement>(selector) : null;
        if (el) el.focus();
    });
}

async function loadBodies(): Promise<void> {
    const ticket = ++rowsTicket;
    const system = draft.value;
    const source = placeSource();
    rows.value = [];
    if (!system || !source) {
        rowsState.value = 'none';
        return;
    }
    rowsState.value = 'loading';
    const found = await source.bodies(system.slug, system.hex);
    if (ticket !== rowsTicket) return;
    rows.value = found ?? [];
    rowsState.value = rows.value.length ? 'ready' : 'none';
    if (bodyKey.value !== null && !rows.value.some((row) => row.key === bodyKey.value)) bodyKey.value = null;
}

async function choose(system: PickedSystem, keepBody: boolean): Promise<void> {
    pickingHere = false;
    endPick();
    if (!keepBody) bodyKey.value = null;
    const words = system.slug.replace(/_/g, ' ');
    draft.value = { slug: system.slug, hex: system.hex, name: system.name, sectorName: words };
    const source = placeSource();
    void loadBodies();
    focusIn('.where-set');
    const info = source ? await source.system(system.slug, system.hex) : null;
    const now = draft.value;
    if (info && now && now.slug === system.slug && now.hex === system.hex) draft.value = info;
}

function startPick(): void {
    draft.value = null;
    rows.value = [];
    rowsState.value = 'idle';
    bodyKey.value = null;
    endPick();
    pickingHere = true;
    emit('map');
    beginPick((system) => { void choose(system, false); }, () => {
        pickingHere = false;
        close();
    });
    focusIn('.where-hint + .where-acts .ui-btn');
}

function board(): void {
    if (pickingHere) {
        pickingHere = false;
        endPick();
    }
    boarding.value = true;
}

function boarded(vessel: CampaignRecord): void {
    if (props.readOnly) return;
    if (isLocating.value) stopLocate();
    saveRecord(props.id, { anchor: { kind: 'record', id: vessel.id } });
    close();
}

function open(): void {
    if (props.readOnly || !record.value) return;
    editing.value = true;
    boarding.value = false;
    const anchor = record.value.anchor;
    const where = anchor && anchor.kind === 'system' ? parseHexKey(anchor.hexKey) : null;
    if (anchor && anchor.kind === 'system' && where) {
        bodyKey.value = anchor.bodyKey ?? null;
        void choose({ slug: where.slug, hex: where.hex, name: anchor.bodyKey ? '' : anchor.locationLabel ?? '' }, true);
        return;
    }
    startPick();
}

function close(): void {
    if (pickingHere) {
        pickingHere = false;
        endPick();
    }
    rowsTicket += 1;
    boarding.value = false;
    if (!editing.value) return;
    editing.value = false;
    void nextTick(() => { if (changeBtn.value) changeBtn.value.focus(); });
}

function useCurrent(): void {
    const now = current.value;
    if (now) void choose({ slug: now.slug, hex: now.hex, name: now.name }, false);
}

function search(): void {
    const command = commands().find((item) => item.id === 'search');
    if (command) command.run();
}

function save(): void {
    const system = draft.value;
    if (!system || props.readOnly) return;
    const row = bodyKey.value !== null ? rows.value.find((item) => item.key === bodyKey.value) : undefined;
    const anchor = systemAnchor(hexKeyOf(system.slug, system.hex), system.name, row ? { key: row.key, name: row.name } : null);
    // The place has changed under a locate: it ends, and can be asked for again.
    if (isLocating.value) stopLocate();
    saveRecord(props.id, { anchor });
    close();
}

function clear(): void {
    if (props.readOnly) return;
    if (isLocating.value) stopLocate();
    saveRecord(props.id, { anchor: null });
    close();
}

function onKey(event: KeyboardEvent): void {
    if (!editing.value) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
    }
}

/** Up and Down walk the body list; a press chooses, as a radio group's keys do. */
function onBodyKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const list = event.currentTarget as HTMLElement;
    const items = Array.from(list.querySelectorAll<HTMLElement>('[role="radio"]'));
    const at = items.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = items[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
        next.focus();
        next.click();
    }
}

watch(() => props.id, () => {
    editing.value = false;
    if (pickingHere) {
        pickingHere = false;
        endPick();
    }
});

onBeforeUnmount(() => {
    if (pickingHere) endPick();
});
</script>

<template>
  <section v-if="record" ref="rootEl" class="where" :data-editing="editing ? 'true' : 'false'" @keydown="onKey">
    <h3 class="ui-heading">Where</h3>

    <template v-if="!editing">
      <p class="where-line">
        <button v-if="host" type="button" class="where-host" :title="'Open ' + host.name" @click="openHost">
          <Icon name="shuttle-space" :size="13" />Aboard {{ host.name }}
        </button>
        <template v-if="place">
          <span v-if="host" class="where-sep" aria-hidden="true">›</span>
          <span class="where-place" :class="{ 'is-via': host }"><Icon v-if="!host" name="location-dot" :size="13" />{{ words[0] }}</span>
          <span v-if="words[1]" class="where-sys">{{ words[1] }}</span>
        </template>
        <span v-else-if="host" class="where-sys">which is nowhere in particular</span>
        <span v-else-if="hostGone" class="where-none">Aboard a record that is gone</span>
        <span v-else class="where-none">Nowhere in particular</span>
      </p>
      <p v-if="place && !matched" class="where-note" role="status">
        Its world{{ place.label ? ', ' + place.label + ',' : '' }} could not be matched in this system. The system is shown.
      </p>
      <div class="where-acts">
        <button
          v-if="place"
          ref="locateBtn"
          type="button"
          class="ui-btn where-locate"
          :aria-pressed="isLocating ? 'true' : 'false'"
          :title="isLocating ? 'Stop locating' : 'Show this place on the map'"
          @click="toggleLocate"
        >
          <Icon name="location-crosshairs" :size="13" />{{ isLocating ? 'Locating' : 'Locate' }}
        </button>
        <button v-if="place && place.bodyKey && matched" type="button" class="ui-btn where-orbit" @click="showOrbit">
          <Icon name="solar-system" :size="13" />Show in orbit
        </button>
        <button ref="changeBtn" type="button" class="ui-btn where-change" :disabled="readOnly" @click="open">
          <Icon name="pen-to-square" :size="13" />{{ record.anchor ? 'Change' : 'Set a place' }}
        </button>
      </div>
      <p v-if="isLocating" class="where-sr" role="status">Located at {{ words[words.length - 1] }}, map centred.</p>
    </template>

    <div v-else-if="boarding" class="where-edit">
      <div class="where-step">
        <h4>Aboard which vessel</h4>
        <RecordPicker :exclude="id" :types="['vessel']" placeholder="Search your vessels" none="No vessels yet. Add the ship first." @pick="boarded" @cancel="close" />
      </div>
      <div class="where-foot">
        <button type="button" class="ui-btn where-cancel" @click="close">Cancel</button>
      </div>
    </div>

    <div v-else class="where-edit">
      <div class="where-step">
        <h4>System</h4>
        <p v-if="draft" class="where-picked">
          <Icon name="location-dot" :size="13" />
          <span><b>{{ draft.name || draft.hex }}</b> {{ draft.sectorName }} {{ draft.hex }}</span>
          <button type="button" class="ui-btn where-again" @click="startPick">Pick another</button>
        </p>
        <template v-else>
          <p class="where-hint" role="status">Click a system on the map, or search for it.</p>
          <div class="where-acts">
            <button v-if="current" type="button" class="ui-btn where-current" @click="useCurrent">
              <Icon name="location-dot" :size="13" />Use {{ current.name || current.hex }} {{ current.hex }}
            </button>
            <button type="button" class="ui-btn where-search" @click="search">
              <Icon name="search" :size="13" />Search
            </button>
          </div>
        </template>
      </div>

      <div v-if="draft" class="where-step">
        <h4>World or moon <em>optional</em></h4>
        <p v-if="rowsState === 'loading'" class="where-hint" role="status">Loading its worlds.</p>
        <p v-else-if="rowsState === 'none'" class="where-hint">No worlds are listed for this system. The place is the system itself.</p>
        <div v-else class="where-bodies" role="radiogroup" aria-label="World or moon" @keydown="onBodyKey">
          <button
            type="button"
            role="radio"
            class="doss-row where-whole"
            :class="{ 'is-on': bodyKey === null }"
            :aria-checked="bodyKey === null ? 'true' : 'false'"
            @click="bodyKey = null"
          >
            <span class="doss-row-text"><span class="doss-row-name">The system as a whole</span></span>
          </button>
          <BodyRow
            v-for="row in rows"
            :key="row.key"
            role="radio"
            :class="{ 'is-on': bodyKey === row.key }"
            :aria-checked="bodyKey === row.key ? 'true' : 'false'"
            :body-key="row.key"
            :name="row.name"
            :facts="row.facts"
            :tag="row.tag"
            :uwp="row.uwp"
            :moon="row.moon"
            :glyph="row.glyph"
            @click="bodyKey = row.key"
          />
        </div>
      </div>

      <div class="where-foot">
        <button type="button" class="ui-btn is-primary where-set" :disabled="!draft || readOnly" @click="save">
          <Icon name="check" :size="12" />Set place
        </button>
        <button v-if="record.anchor" type="button" class="ui-btn where-nowhere" :disabled="readOnly" @click="clear">Nowhere in particular</button>
        <button v-if="record.type !== 'vessel'" type="button" class="ui-btn where-board" :disabled="readOnly" @click="board">
          <Icon name="shuttle-space" :size="12" />Aboard a vessel…
        </button>
        <span class="rec-gap"></span>
        <button type="button" class="ui-btn where-cancel" @click="close">Cancel</button>
      </div>
    </div>
  </section>
</template>

<style>
.where-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 0;
  padding: 0 1px;
}

.where-place {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  color: var(--text-0);
  font: 600 14.5px/1.45 var(--font-text);
}

.where-place .ui-icon {
  align-self: center;
  color: var(--signal);
}

.where-sys {
  color: var(--text-muted);
  font: 400 13px/1.45 var(--font-text);
}

/* Aboard a vessel: the vessel leads, as a link, then where it is. */
.where-host {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 0 -4px;
  padding: 1px 6px 1px 4px;
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-0);
  font: 600 14.5px/1.45 var(--font-text);
  cursor: pointer;
}

.where-host .ui-icon {
  color: var(--signal);
}

.where-host:hover {
  background: var(--row-active);
  color: var(--signal);
}

.where-sep {
  color: var(--text-muted);
}

.where-place.is-via {
  color: var(--text-1);
  font-weight: 500;
}

.where-none {
  color: var(--text-muted);
  font: 400 14px/1.45 var(--font-text);
}

.where-note {
  margin: 6px 0 0;
  padding: 0 1px;
  color: var(--attention);
  font: 400 12.5px/1.45 var(--font-text);
}

.where-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.ui-btn.where-locate[aria-pressed="true"] {
  border-color: var(--signal);
  background: var(--row-active);
  color: var(--signal);
}

.where-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

/* Changing the place: the steps stand where the line stood. */
.where-edit {
  padding: 12px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.where-step + .where-step {
  margin-top: 14px;
}

.where-step h4 {
  margin: 0 0 6px;
  color: var(--text-1);
  font: 700 12.5px/1.4 var(--font-text);
}

.where-step h4 em {
  margin-left: 4px;
  color: var(--text-muted);
  font-style: normal;
  font-weight: 400;
}

.where-hint {
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.45 var(--font-text);
}

.where-picked {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.45 var(--font-text);
}

.where-picked .ui-icon {
  color: var(--signal);
}

.where-picked span {
  flex: 1 1 auto;
  min-width: 0;
}

.where-picked b {
  margin-right: 6px;
  color: var(--text-0);
  font-weight: 600;
  font-size: 14px;
}

.where-bodies {
  max-height: 264px;
  margin: 0 -4px;
  padding: 0 4px;
  overflow-y: auto;
}

.where-bodies .doss-row.is-on,
.where-bodies .doss-row.is-on:hover {
  border-color: var(--signal);
  background: var(--row-active);
}

/* On the chosen row the detail line (11.5 px) takes the text colour: muted would be too faint there. */
.where-bodies .doss-row.is-on small,
.where-bodies .doss-row.is-on .doss-row-uwp {
  color: var(--text-1);
}

.where-bodies .doss-row.where-whole {
  margin-top: 0;
}

.where-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
</style>
