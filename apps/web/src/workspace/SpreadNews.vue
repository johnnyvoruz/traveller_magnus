<script setup lang="ts">
/**
 * "Spread this news" on a record or a journal entry (spec_xboat_ripples.md §4.2; streams/D.md XD3):
 * with a date and a place, the ripple opens from that place on that date, the scrubber at Today,
 * and the place is located on the map. A date and no place: the button stays, unable, and its hover
 * says the place is missing. No date: no button. Shown only where the map has registered its ripple.
 * Nothing is written.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import type { CampaignAnchor } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { askNews, spreadState } from '../map/news_ask.ts';
import { commands, onCommandsChanged } from '../shell/registry.ts';
import { startLocate } from './locate.ts';
import { resolveAnchor } from './party.ts';

const props = defineProps<{
    when: { year: number; day: number } | null;
    anchor: CampaignAnchor;
    /** What the locator is told it is locating: the record's or the entry's id. */
    locateId: string;
}>();

const emit = defineEmits<{
    /** The map has to be seen: the panel gives way when it covers it. */
    map: [];
}>();

const btn = ref<HTMLElement | null>(null);
const hasMap = (): boolean => commands().some((item) => item.id === 'news-from-here');
const offered = ref(hasMap());
const stop = onCommandsChanged(() => { offered.value = hasMap(); });
onBeforeUnmount(stop);

const state = computed(() => {
    const place = resolveAnchor(props.anchor, campaign.records);
    return spreadState(props.when, place ? place.hexKey : null);
});

function originY(): number | null {
    const el = btn.value;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return box.height > 0 ? box.top + box.height / 2 : null;
}

function spread(): void {
    const now = state.value;
    if (!now || !now.ok) return;
    emit('map');
    startLocate(props.locateId, now.ask.hexKey, originY);
    askNews(now.ask);
}
</script>

<template>
  <p v-if="offered && state" class="spread-news">
    <button
      ref="btn"
      type="button"
      class="ui-btn"
      :aria-disabled="state.ok ? undefined : 'true'"
      :aria-describedby="state.ok ? undefined : 'spread-why-' + locateId"
      :title="state.ok ? 'How far this news has travelled by today' : state.why"
      data-spread-news
      @click="spread"
    >
      <Icon name="radar" :size="13" />Spread this news
    </button>
    <span v-if="!state.ok" :id="'spread-why-' + locateId" class="spread-news-why">{{ state.why }}</span>
  </p>
</template>

<style>
.spread-news {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin: 0;
}

.spread-news .ui-btn[aria-disabled='true'] {
  opacity: 0.55;
  cursor: default;
}

/* The why is said on hover (the title) and to a screen reader; on the page it would sit on every undated record. */
.spread-news-why {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
