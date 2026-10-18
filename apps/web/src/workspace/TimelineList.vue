<script setup lang="ts">
/**
 * The timeline list (campaign_manager_plan.md §7.3): one reading of dated journal
 * entries and dated records, newest first, grouped by year then day. Choosing a row
 * opens it and locates its place. Looking does not move the campaign date.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { entriesByDate } from '../campaign/journal.ts';
import { campaign } from '../campaign/store.ts';
import { commandScope, handleKey, registerCommand, setCommandScope } from '../shell/registry.ts';
import Icon from '../design/Icon.vue';
import RecordAvatar from './RecordAvatar.vue';
import { locating, startLocate } from './locate.ts';
import { editDateNext } from './list_state.ts';
import { EMPTY_PARTY, leadVesselId } from './party.ts';
import { RECORD_TYPES } from './records.ts';
import { campaignTimeline, timelineAdvice, timelineKeeps, todayIndex, type TimelineDay, type TimelineRow, type TimelineYear } from './timeline.ts';
import { timelineAt } from './timeline_focus.ts';
import { vRecordCard } from './record_card.ts';

const props = defineProps<{
    /** Changes cannot be made just now (offline). The list itself only reads. */
    readOnly: boolean;
    /** A record type id from the address, or null for every type. A type that is not one of the nine is every type. */
    type: string | null;
    /** The address asked for the lead ship. With no lead ship the list stays whole and says so. */
    ship: boolean;
    /** A row the address names. The list opens there on a cold load. */
    row: string | null;
}>();

const emit = defineEmits<{
    open: [row: TimelineRow];
    /** The map has to be seen (a locate): the panel gives way when it covers it. */
    map: [];
    /** The empty list points at the Journal, where a session takes the campaign date. */
    journal: [];
    /** The type or the ship filter changed. The panel writes it into the address. */
    narrow: [next: { type: string | null; ship: boolean }];
}>();

const advice = computed(() => timelineAdvice(campaign.clock !== null));

function followAdvice(): void {
    if (advice.value.act === 'date') {
        editDateNext.value = true;
        return;
    }
    emit('journal');
}

const listEl = ref<HTMLElement | null>(null);
const active = ref(0);

/** The campaign's timeline (U6): dated entries and records, each ship's legs, and where the party is today (A's campaignTimeline). */
const model = computed(() => {
    void campaign.seq;
    return campaignTimeline({
        entries: entriesByDate(),
        records: campaign.records,
        clockDays: campaign.clock ? campaign.clock.days : null,
        party: campaign.settings ? campaign.settings.party : null,
    });
});

const knownType = computed(() => {
    if (!props.type) return null;
    return RECORD_TYPES.some((item) => item.type === props.type) ? props.type : null;
});

const party = computed(() => {
    void campaign.seq;
    return campaign.settings?.party ?? EMPTY_PARTY;
});

const leadId = computed(() => leadVesselId(party.value));

function recordTypeOf(id: string): string | null {
    const record = campaign.records[id];
    if (!record || record.deleted) return null;
    return record.type;
}

function entryAnchorId(id: string): string | null {
    const entry = campaign.journal[id];
    if (!entry || entry.deleted) return null;
    const anchor = entry.anchor;
    if (anchor && anchor.kind === 'record') return anchor.id;
    return null;
}

const shown = computed(() => {
    const type = knownType.value;
    const shipId = props.ship ? leadId.value : null;
    if (!type && !shipId) return model.value;
    const narrow = {
        type,
        shipId,
        aboard: party.value.aboard,
        recordType: recordTypeOf,
        entryAnchorId,
    };
    const years: TimelineYear[] = [];
    let count = 0;
    for (const year of model.value.years) {
        const days: TimelineDay[] = [];
        for (const day of year.days) {
            const rows = day.rows.filter((row) => timelineKeeps(row, narrow));
            if (rows.length === 0) continue;
            days.push({ ...day, rows });
            count += rows.length;
        }
        if (days.length) years.push({ ...year, days });
    }
    return { years, count };
});

const flat = computed(() => {
    const rows: TimelineRow[] = [];
    for (const year of shown.value.years) {
        for (const day of year.days) rows.push(...day.rows);
    }
    return rows;
});

function onType(event: Event): void {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
    emit('narrow', { type: value || null, ship: props.ship });
}

function onShip(): void {
    emit('narrow', { type: knownType.value, ship: !props.ship });
}

const activeId = computed(() => {
    const row = flat.value[active.value];
    return row ? 'tl-' + row.id : undefined;
});

function reveal(id: string): void {
    const root = listEl.value;
    if (!root) return;
    const el = root.querySelector<HTMLElement>('[data-id="' + id + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
}

function choose(row: TimelineRow): void {
    const at = flat.value.findIndex((item) => item.id === row.id);
    if (at >= 0) active.value = at;
    const hexKey = row.hexKey;
    if (!hexKey) {
        emit('open', row);
        return;
    }
    emit('map');
    void nextTick(() => {
        startLocate(row.id, hexKey, () => {
            const root = listEl.value;
            if (!root) return null;
            const el = root.querySelector<HTMLElement>('[data-id="' + row.id + '"]');
            if (!el) return null;
            const box = el.getBoundingClientRect();
            return box.height > 0 ? box.top + box.height / 2 : null;
        });
        emit('open', row);
    });
}

const LIST_SCOPE = 'timeline-list';
let releaseKeys: (() => void)[] = [];
let replay = false;

function listFocused(): boolean {
    return document.activeElement === listEl.value;
}

function replayKey(key: string): void {
    if (!listFocused()) return;
    replay = true;
    onKey({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault() {},
        stopPropagation() {},
    });
}

function bindKeys(): void {
    setCommandScope(LIST_SCOPE);
    const key = (id: string, name: string, keys: string[]) => registerCommand({
        id, name, keys, scope: LIST_SCOPE, runnable: listFocused, run: () => replayKey(keys[0]),
    });
    releaseKeys = [
        key('timeline-list-next', 'Next row (Down)', ['ArrowDown']),
        key('timeline-list-prev', 'Previous row (Up)', ['ArrowUp']),
        key('timeline-list-open', 'Open (Enter)', ['Enter']),
    ];
}

function releaseListKeys(): void {
    for (const release of releaseKeys) release();
    releaseKeys = [];
    if (commandScope() === LIST_SCOPE) setCommandScope(null);
}

function onKey(event: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    preventDefault(): void;
    stopPropagation(): void;
}): void {
    if (!replay && handleKey(event as unknown as KeyboardEvent)) {
        event.stopPropagation();
        return;
    }
    replay = false;
    const rows = flat.value;
    if (rows.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        active.value = Math.min(rows.length - 1, Math.max(0, active.value + step));
        const row = rows[active.value];
        if (row) reveal(row.id);
        return;
    }
    if (event.key === 'Enter') {
        const row = rows[active.value];
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        choose(row);
    }
}

/**
 * Opened, the list takes the keyboard (the button or command that opened it has gone), unless
 * a field is being typed in.
 */
function takeFocus(root: HTMLElement): void {
    const now = document.activeElement;
    const tag = now ? now.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    root.focus({ preventScroll: true });
}

function openAtToday(): void {
    active.value = todayIndex(model.value);
    void nextTick(() => {
        const root = listEl.value;
        if (!root) return;
        const mark = root.querySelector<HTMLElement>('[data-today="true"]');
        if (mark) mark.scrollIntoView({ block: 'center' });
        takeFocus(root);
    });
}

/** A record page asked for one of its rows: the list opens there, with the keyboard on it. Otherwise the address row, or Today. */
function openAtAsked(): void {
    const asked = timelineAt.value;
    timelineAt.value = null;
    const wanted = asked || props.row;
    const at = wanted ? flat.value.findIndex((row) => row.id === wanted) : -1;
    if (!wanted || at < 0) {
        openAtToday();
        return;
    }
    active.value = at;
    void nextTick(() => {
        const root = listEl.value;
        if (!root) return;
        const el = root.querySelector<HTMLElement>('[data-id="' + wanted + '"]');
        if (el) el.scrollIntoView({ block: 'center' });
        takeFocus(root);
    });
}

watch(() => props.row, (id) => {
    if (!id) return;
    const at = flat.value.findIndex((row) => row.id === id);
    if (at < 0) return;
    active.value = at;
    void nextTick(() => reveal(id));
});

onMounted(() => {
    bindKeys();
    openAtAsked();
});
onBeforeUnmount(releaseListKeys);
</script>

<template>
  <div class="tl">
    <div class="tl-narrow">
      <select class="tl-type" aria-label="Record type" :value="knownType || ''" @change="onType">
        <option value="">All types</option>
        <option v-for="info in RECORD_TYPES" :key="info.type" :value="info.type">{{ info.many }}</option>
      </select>
      <button
        type="button"
        class="ui-btn"
        :aria-pressed="ship ? 'true' : 'false'"
        :disabled="!leadId"
        :title="leadId ? undefined : 'The party has no ship yet.'"
        @click="onShip"
      >Only this ship</button>
    </div>
    <p v-if="ship && !leadId" class="camp-hint">The party has no ship yet.</p>
    <div v-if="model.count === 0" class="camp-first ui-ground">
      <span class="camp-glyph" aria-hidden="true"><Icon name="clock" :size="22" /></span>
      <h2>{{ advice.act === 'date' ? 'No campaign date yet' : 'Nothing on the timeline yet' }}</h2>
      <p>{{ advice.text }}</p>
      <div class="camp-first-starts">
        <button type="button" class="ui-btn is-primary" :disabled="readOnly" @click="followAdvice">{{ advice.label }}</button>
      </div>
    </div>
    <div v-else-if="shown.count === 0" class="camp-first ui-ground">
      <span class="camp-glyph" aria-hidden="true"><Icon name="clock" :size="22" /></span>
      <h2>Nothing on the timeline matches</h2>
      <p>Choose All types, or turn off Only this ship.</p>
    </div>
    <div
      v-else
      ref="listEl"
      class="tl-list"
      tabindex="0"
      role="listbox"
      aria-label="Timeline"
      :aria-activedescendant="activeId"
      @keydown="onKey"
    >
      <section v-for="year in shown.years" :key="year.year" class="tl-year" role="group" :aria-label="String(year.year)">
        <h3 class="ui-kicker">{{ year.year }}</h3>
        <section
          v-for="day in year.days"
          :key="day.date"
          class="tl-day ui-step"
          :class="{ 'is-lit': day.today }"
          role="group"
          :aria-label="day.today ? day.date + ', today' : day.date"
          :data-today="day.today ? 'true' : undefined"
        >
          <h4>
            <span class="ui-date">{{ day.date }}</span>
            <span class="tl-weekday">{{ day.weekday }}</span>
            <span v-if="day.today" class="tl-today">Today</span>
          </h4>
          <div
            v-for="row in day.rows"
            :id="'tl-' + row.id"
            :key="row.id"
            v-record-card="row.source === 'record' ? row.id : null"
            class="camp-row"
            role="option"
            :data-id="row.id"
            :data-source="row.source"
            :aria-selected="row.id === flat[active]?.id ? 'true' : 'false'"
            :class="{ 'is-on': row.id === flat[active]?.id, 'is-locating': locating.recordId === row.id }"
            @click="choose(row)"
          >
            <span class="tl-when">{{ row.date }}</span>
            <RecordAvatar :record="row.avatar" :universe-id="campaign.universeId" size="row" :icon="row.icon || undefined" />
            <span class="camp-row-text">
              <b>{{ row.title }}</b>
              <span class="camp-row-meta">
                {{ row.kind }}<template v-if="row.place"> · {{ row.place }}</template><template v-if="row.until"> · <span class="tl-until">to {{ row.until }}</span></template>
              </span>
            </span>
          </div>
        </section>
      </section>
    </div>
  </div>
</template>

<style>
/*
 * In the version-video look (Lane M): the list in a frame, each year a kicker over a rule, each day a
 * step on the line with its date in a box. Today's step is lit.
 */
.tl {
  min-width: 0;
}

.tl-narrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tl-type {
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-0);
  color: var(--text-0);
  font: 500 13px/1.3 var(--font-text);
}

.tl-list {
  padding: 4px 0 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-4);
  background: var(--bg-0);
  box-shadow: 0 0 24px var(--frame-glow);
}

.tl-list:focus-visible {
  outline: 2px solid var(--signal);
  outline-offset: 2px;
}

.tl-year h3,
.tl-day h4 {
  margin: 0;
}

.tl-year h3 {
  margin: 0 14px 10px;
  padding: 12px 0 8px;
  background: linear-gradient(90deg, var(--signal-dim), transparent) left bottom / 100% 2px no-repeat;
  font-variant-numeric: var(--tabular);
}

.tl-year + .tl-year h3 {
  margin-top: 6px;
}

.tl-day.ui-step {
  margin-left: 14px;
  padding-bottom: 10px;
}

.tl-day.ui-step:last-child {
  padding-bottom: 6px;
}

.tl-day h4 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-right: 14px;
  color: var(--text-1);
}

.tl-weekday,
.tl-today {
  color: var(--text-muted);
  font: 500 12.5px/1.3 var(--font-text);
}

.tl-day[data-today="true"] h4 .tl-today {
  color: var(--signal);
  font: 700 12px/1.3 var(--font-display);
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.tl-day .camp-row {
  margin-top: 4px;
  padding: 8px 14px 8px 10px;
  border-radius: var(--r-2) 0 0 var(--r-2);
}

/* The row's own date repeats the box of its day just above it (rows are grouped by it), so the step shows it once. */
.tl-day .tl-when {
  display: none;
}

.tl-until {
  white-space: nowrap;
}

.tl-list .camp-row.is-locating {
  box-shadow: inset 3px 0 0 var(--signal);
}
</style>
