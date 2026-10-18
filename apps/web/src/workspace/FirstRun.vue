<script setup lang="ts">
/**
 * Three steps for a campaign that has no placed vessel or no date yet.
 * The world tick follows the open dossier and is not stored.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { commands } from '../shell/registry.ts';
import { frame, onFrame } from '../shell/frame.ts';
import { dateIsSet, firstRunCard, firstRunCurrent, vesselHasPlace, worldIsOpen } from './first_run.ts';

defineProps<{
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const emit = defineEmits<{
    ship: [];
    date: [];
}>();

const worldOpen = ref(false);
let stopFrame: (() => void) | null = null;

function readWorld(): void {
    const live = frame();
    worldOpen.value = worldIsOpen(live ? live.dossier : null);
}

const card = computed(() => firstRunCard({
    worldOpen: worldOpen.value,
    shipPlaced: vesselHasPlace(campaign.records),
    dateSet: dateIsSet(campaign.clock),
}));
const current = computed(() => firstRunCurrent(card.value));

function locate(): void {
    const command = commands().find((item) => item.id === 'locate-system');
    if (!command || (command.runnable && !command.runnable())) return;
    command.run();
}

onMounted(() => {
    readWorld();
    stopFrame = onFrame(readWorld);
});

onBeforeUnmount(() => {
    if (stopFrame) stopFrame();
});
</script>

<template>
  <section class="first-run ui-ground" aria-label="Start here">
    <p class="ui-kicker is-signal">Start here</p>
    <h2>Set up this campaign</h2>
    <ol class="ui-steps">
      <li class="ui-step" :class="{ 'is-lit': card.world }" :aria-current="current === 1 ? 'step' : undefined">
        <p>Find your ship's world</p>
        <button
          type="button"
          class="ui-btn"
          data-command="locate-system"
          :disabled="readOnly || !worldOpen"
          @click="locate"
        >
          <Icon name="location-crosshairs" :size="13" />Locate
        </button>
        <span v-if="card.world" class="first-run-done">Done</span>
      </li>
      <li class="ui-step" :class="{ 'is-lit': card.ship }" :aria-current="current === 2 ? 'step' : undefined">
        <p>Add your ship</p>
        <button type="button" class="ui-btn is-primary" :disabled="readOnly || !worldOpen" @click="emit('ship')">
          <Icon name="shuttle-space" :size="13" />Add your ship
        </button>
        <span v-if="card.ship" class="first-run-done">Done</span>
      </li>
      <li class="ui-step" :class="{ 'is-lit': card.date }" :aria-current="current === 3 ? 'step' : undefined">
        <p>Set the campaign date</p>
        <button type="button" class="ui-btn" :disabled="readOnly" @click="emit('date')">
          <Icon name="calendar-star" :size="13" />Set the date
        </button>
        <span v-if="card.date" class="first-run-done">Done</span>
      </li>
    </ol>
  </section>
</template>

<style>
.first-run {
  margin: 0 0 var(--sp-4);
  padding: var(--sp-4);
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
}

.first-run h2 {
  margin: var(--sp-2) 0 var(--sp-4);
  color: var(--text-0);
  font: 600 18px/1.3 var(--font-display);
}

.first-run .ui-step p {
  margin: 0 0 var(--sp-2);
}

.first-run .ui-btn {
  margin: 0 var(--sp-2) 0 0;
}

.first-run-done {
  color: var(--signal);
  font: 600 12px/1.4 var(--font-text);
}
</style>
