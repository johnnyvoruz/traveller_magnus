<script setup lang="ts">
/**
 * The date beside the search bar (Johnny, 2026-10-05; K6c). Signed in it is the campaign
 * date, DDD-YYYY and the weekday, and pressing it opens the date's editor in the Campaign
 * panel; with no date set yet it says so and opens the same. Signed out it is the date the
 * orbit view opens on, quieter and not a control.
 */
import { computed } from 'vue';
import { session } from '../account/session.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { DEFAULT_START, totalDays } from '../orbit/clock.ts';
import { stardate } from './stardate.ts';

const emit = defineEmits<{ open: [] }>();

const signedIn = computed(() => session.user !== null);
const ready = computed(() => campaign.status === 'ready');
const said = computed(() => {
    if (signedIn.value) return campaign.clock ? stardate(campaign.clock.days) : null;
    return stardate(totalDays(DEFAULT_START.year, DEFAULT_START.day));
});
</script>

<template>
  <button
    v-if="signedIn"
    type="button"
    class="stardate is-mine"
    :class="{ 'is-unset': !said }"
    :title="said ? 'The campaign date. Press to change it.' : 'No campaign date yet. Press to set it.'"
    :disabled="!ready"
    @click="emit('open')"
  >
    <Icon name="calendar-star" :size="14" />
    <template v-if="said"><b>{{ said.date }}</b><span>{{ said.weekday }}</span></template>
    <template v-else-if="ready"><span>No campaign date</span></template>
    <template v-else><span>…</span></template>
  </button>
  <p v-else class="stardate is-quiet" title="The date the orbit view opens on">
    <Icon name="calendar-star" :size="14" />
    <b>{{ said?.date }}</b><span>{{ said?.weekday }}</span>
  </p>
</template>

<style>
/* Right of the search field, the same height, on the same glass. */
.stardate {
  position: absolute;
  top: var(--chrome-top);
  left: calc(var(--rail-width) + var(--chrome-inset) + min(440px, calc(100% - var(--rail-width) - 2 * var(--chrome-inset))) + 12px);
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: var(--chrome-height);
  margin: 0;
  padding: 0 16px 0 14px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-4);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  color: var(--text-muted);
  font: 400 13px/1 var(--font-text);
  white-space: nowrap;
  transition: left var(--t-rail) ease, border-color var(--t-fast) var(--ease-out);
}

.stardate > .ui-icon {
  color: var(--signal);
}

.stardate b,
.stardate span {
  display: inline-block;
  line-height: 1;
}

.stardate b {
  color: var(--text-0);
  font: 700 16px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  letter-spacing: 0.02em;
}

.stardate.is-mine {
  cursor: pointer;
}

.stardate.is-mine:not(:disabled):hover {
  border-color: var(--signal);
}

.stardate.is-mine:disabled {
  cursor: default;
}

.stardate.is-unset span {
  color: var(--text-1);
}

/* Signed out: the same place, quieter, not a control. */
.stardate.is-quiet {
  border-color: var(--line-2);
  box-shadow: none;
}

.stardate.is-quiet > .ui-icon {
  color: var(--text-muted);
}

.stardate.is-quiet b {
  color: var(--text-1);
  font-weight: 600;
}

/* A narrow window: the weekday goes, then the date gives the search field the room. */
@media (max-width: 860px) {
  .stardate span {
    display: none;
  }
}

@media (max-width: 680px) {
  .stardate {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stardate {
    transition: none;
  }
}
</style>
