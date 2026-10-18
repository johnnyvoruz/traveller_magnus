<script setup lang="ts">
/**
 * "On the timeline" on a record page (manifesto: Connected): the record's own rows as the
 * timeline lists them, read from the same buildTimeline, each opening the timeline at that
 * row. Hidden when the record has none (no date). The timeline has no address of its own, so
 * a row asks for it through timelineAt and the Campaign panel opens it.
 */
import { computed } from 'vue';
import { entriesByDate } from '../campaign/journal.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { recordTimelineRows } from './record_links.ts';
import { buildTimeline } from './timeline.ts';
import { timelineAt } from './timeline_focus.ts';

const props = defineProps<{
    id: string;
}>();

const rows = computed(() => {
    void campaign.seq;
    const model = buildTimeline({
        entries: entriesByDate(),
        records: campaign.records,
        clockDays: campaign.clock ? campaign.clock.days : null,
    });
    return recordTimelineRows(props.id, model);
});

function open(rowId: string): void {
    timelineAt.value = rowId;
}
</script>

<template>
  <section v-if="rows.length" class="rln rln-timeline">
    <h3 class="ui-heading ui-kicker">On the timeline</h3>
    <ul class="rln-rows">
      <li v-for="item in rows" :key="item.row.id + '-' + item.row.date">
        <button type="button" class="camp-row rln-row" :title="'Open the timeline at ' + item.row.date" @click="open(item.row.id)">
          <Icon name="calendar-star" :size="14" />
          <span class="camp-row-text">
            <span class="rln-span">
              <span class="ui-date">{{ item.row.date }}</span>
              <template v-if="item.row.until"> to <span class="ui-date">{{ item.row.until }}</span></template>
            </span>
            <span class="camp-row-meta">
              {{ item.weekday }}<template v-if="item.today"> · <span class="rln-today">Today</span></template><template v-if="item.row.place"> · {{ item.row.place }}</template>
            </span>
          </span>
          <Icon name="chevron-right" :size="12" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style>
.rln-span {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 12px;
}

.rln-today {
  color: var(--signal);
}
</style>
