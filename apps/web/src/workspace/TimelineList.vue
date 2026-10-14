<script setup lang="ts">
/**
 * The timeline list (campaign_manager_plan.md §7.3): one reading of dated journal
 * entries and dated records, newest first, grouped by year then day. Choosing a row
 * opens it and locates its place. Looking does not move the campaign date.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { entriesByDate } from '../campaign/journal.ts';
import { campaign } from '../campaign/store.ts';
import RecordAvatar from './RecordAvatar.vue';
import { locating, startLocate } from './locate.ts';
import { editDateNext } from './list_state.ts';
import { buildTimeline, timelineAdvice, todayIndex, type TimelineRow } from './timeline.ts';

defineProps<{
    /** Changes cannot be made just now (offline). The list itself only reads. */
    readOnly: boolean;
}>();

const emit = defineEmits<{
    open: [row: TimelineRow];
    /** The map has to be seen (a locate): the panel gives way when it covers it. */
    map: [];
    /** The empty list points at the Journal, where a session takes the campaign date. */
    journal: [];
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

const model = computed(() => {
    void campaign.seq;
    return buildTimeline({
        entries: entriesByDate(),
        records: campaign.records,
        clockDays: campaign.clock ? campaign.clock.days : null,
    });
});

const flat = computed(() => {
    const rows: TimelineRow[] = [];
    for (const year of model.value.years) {
        for (const day of year.days) rows.push(...day.rows);
    }
    return rows;
});

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

function onKey(event: KeyboardEvent): void {
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

function openAtToday(): void {
    active.value = todayIndex(model.value);
    void nextTick(() => {
        const root = listEl.value;
        if (!root) return;
        const mark = root.querySelector<HTMLElement>('[data-today="true"]');
        if (mark) mark.scrollIntoView({ block: 'center' });
    });
}

onMounted(openAtToday);
</script>

<template>
  <div class="tl">
    <div v-if="model.count === 0" class="camp-empty">
      <p>{{ advice.text }}</p>
      <button type="button" class="ui-btn is-primary" :disabled="readOnly" @click="followAdvice">{{ advice.label }}</button>
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
      <section v-for="year in model.years" :key="year.year" class="tl-year" role="group" :aria-label="String(year.year)">
        <h3>{{ year.year }}</h3>
        <section
          v-for="day in year.days"
          :key="day.date"
          class="tl-day"
          role="group"
          :aria-label="day.today ? day.date + ', today' : day.date"
          :data-today="day.today ? 'true' : undefined"
        >
          <h4>
            <span>{{ day.date }}</span>
            <span class="tl-weekday">{{ day.weekday }}</span>
            <span v-if="day.today" class="tl-today">Today</span>
          </h4>
          <div
            v-for="row in day.rows"
            :id="'tl-' + row.id"
            :key="row.id"
            class="camp-row"
            role="option"
            :data-id="row.id"
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
.tl {
  min-width: 0;
}

.tl-list {
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.tl-list:focus-visible {
  outline: 2px solid var(--signal);
  outline-offset: 2px;
}

.tl-year + .tl-year {
  border-top: 1px solid var(--line-1);
}

.tl-year h3,
.tl-day h4 {
  margin: 0;
}

.tl-year h3 {
  padding: 10px 12px 0;
  color: var(--text-0);
  font: 600 13px/1.3 var(--font-code);
}

.tl-day h4 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px 2px;
  color: var(--text-1);
  font: 600 12px/1.3 var(--font-code);
}

.tl-weekday,
.tl-today {
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.tl-day[data-today="true"] h4 .tl-today {
  color: var(--signal);
}

.tl-when {
  flex: 0 0 auto;
  width: 8ch;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-code);
}

.tl-until {
  white-space: nowrap;
}

.tl-list .camp-row.is-locating {
  box-shadow: inset 3px 0 0 var(--signal);
}
</style>
