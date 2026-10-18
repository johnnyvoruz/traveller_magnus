<script setup lang="ts">
/**
 * The record hover card (campaign_manager_plan.md §4.4 rule 4), mounted once in the Campaign
 * panel: the record's avatar, type, one line, where it is, up to three of its connections, and Open. It follows record_card.ts,
 * which the links drive. The mouse may move onto it; Open goes to the record's page. It reads
 * the campaign already in memory.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { campaign } from '../campaign/store.ts';
import { atPane } from '../shell/pane.ts';
import { campaignDays, vesselWhere } from './party_where.ts';
import RecordAvatar from './RecordAvatar.vue';
import { connectionsOf } from './links.ts';
import { CARD_ID, cardPlace, cardTies, closeCard, keepCard, leaveCard, recordCard } from './record_card.ts';
import { placeLine, typeInfo } from './records.ts';

const router = useRouter();
const route = useRoute();
const cardEl = ref<HTMLElement | null>(null);
/** Null until the card has been measured, so it never shows in the wrong place first. */
const at = ref<{ left: number; top: number } | null>(null);

const record = computed(() => {
    const id = recordCard.id;
    const found = id ? campaign.records[id] : null;
    return found && !found.deleted ? found : null;
});
/** One line: the summary, or the first line of the details. */
const line = computed(() => {
    const now = record.value;
    if (!now) return '';
    return now.summary.trim() || now.details.trim().split('\n')[0] || '';
});
/** Where it is now. A ship on its track is where the track puts it at the campaign date, in the Party tab's words. */
const where = computed(() => {
    const now = record.value;
    if (!now) return '';
    if (now.type !== 'vessel') return placeLine(now, campaign.records);
    void campaign.seq;
    const at = vesselWhere(now, campaign.records, campaignDays(campaign.clock));
    return at.underway ? at.underway.text : placeLine({ ...now, anchor: at.anchor }, campaign.records);
});

/** Up to three connections, worded from this record's side, as its page groups them. */
const ties = computed(() => {
    const now = record.value;
    if (!now) return { shown: [], more: 0 };
    void campaign.seq;
    return cardTies(connectionsOf(now.id, campaign.records, campaign.links));
});

watch(() => [recordCard.id, recordCard.rect] as const, async () => {
    at.value = null;
    if (!recordCard.id || !recordCard.rect) return;
    await nextTick();
    const el = cardEl.value;
    const rect = recordCard.rect;
    if (!el || !rect) return;
    const root = document.documentElement;
    at.value = cardPlace(rect, { width: el.offsetWidth, height: el.offsetHeight }, { width: root.clientWidth, height: root.clientHeight });
});

function open(): void {
    const id = recordCard.id;
    closeCard();
    if (id) void router.push(atPane(route.path, route.query, { kind: 'campaign', record: id }));
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="record"
      :id="CARD_ID"
      ref="cardEl"
      class="rcard"
      role="tooltip"
      :style="at ? { left: at.left + 'px', top: at.top + 'px' } : { visibility: 'hidden' }"
      @pointerenter="keepCard"
      @pointerleave="leaveCard"
    >
      <div class="rcard-head">
        <RecordAvatar :record="record" :universe-id="campaign.universeId" size="row" />
        <div class="rcard-names">
          <b>{{ record.name }}</b>
          <span class="ui-kicker">{{ typeInfo(record.type).one }}</span>
        </div>
      </div>
      <p v-if="line" class="rcard-line">{{ line }}</p>
      <p class="rcard-where">{{ where }}</p>
      <ul v-if="ties.shown.length" class="rcard-ties">
        <li v-for="tie in ties.shown" :key="tie.link.id">
          <span class="rcard-tie-label">{{ tie.label }}</span> {{ tie.other.name }}<template v-if="tie.link.role"> · {{ tie.link.role }}</template>
        </li>
        <li v-if="ties.more" class="rcard-tie-more">and {{ ties.more }} more</li>
      </ul>
      <button type="button" class="ui-btn rcard-open" tabindex="-1" @click="open">Open</button>
    </div>
  </Teleport>
</template>

<style>
.rcard {
  position: fixed;
  z-index: 42;
  box-sizing: border-box;
  width: 280px;
  max-width: calc(100vw - 16px);
  padding: 12px 14px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-3);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
  animation: rcard-in var(--t-fast) var(--ease-out) both;
}

@keyframes rcard-in {
  from { opacity: 0; }
}

.rcard-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rcard-names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rcard-names b {
  color: var(--text-0);
  font: 700 14.5px/1.3 var(--font-text);
  overflow-wrap: anywhere;
}

.rcard-line {
  display: -webkit-box;
  margin: 8px 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.rcard-where {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.rcard-ties {
  margin: 8px 0 0;
  padding: 6px 0 0;
  border-top: 1px solid var(--line-soft);
  list-style: none;
  font-size: 12.5px;
}

.rcard-ties li {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rcard-tie-label,
.rcard-tie-more {
  color: var(--text-muted);
}

.ui-btn.rcard-open {
  margin-top: 10px;
  height: 26px;
  padding: 0 10px;
  font-size: 12.5px;
}

@media (prefers-reduced-motion: reduce) {
  .rcard {
    animation: none;
  }
}
</style>
