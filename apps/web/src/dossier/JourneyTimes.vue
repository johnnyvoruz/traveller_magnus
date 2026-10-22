<script setup lang="ts">
import type { JourneyTime } from './model.ts';
import { advanceByJump, advanceLabel, canAdvanceClock, journeyParts as parts } from './journey_clock.ts';

defineProps<{ journey: JourneyTime[] }>();
</script>

<template>
  <section class="doss-section doss-journey-section">
    <h3 class="ui-heading ui-kicker">100D jump travel times</h3>
    <!-- The referee with a campaign clock: each tile advances the campaign by its hours (DJ1). -->
    <ul v-if="canAdvanceClock" class="doss-journey" data-journey-advance>
      <li v-for="item in journey" :key="item.g" class="doss-journey-item">
        <button
          type="button"
          class="doss-fact doss-journey-tile is-action"
          :aria-label="advanceLabel(item.hours)"
          :title="advanceLabel(item.hours)"
          @click="advanceByJump(item.hours)"
        >
          <span class="doss-journey-g"><b>{{ item.g }}</b>G</span>
          <span class="doss-journey-h">
            {{ parts(item.hours).figure }}<span v-if="parts(item.hours).unit" class="doss-journey-unit">{{ parts(item.hours).unit }}</span>
          </span>
        </button>
      </li>
    </ul>
    <dl v-else class="doss-journey">
      <div v-for="item in journey" :key="item.g" class="doss-fact doss-journey-tile">
        <dt class="doss-journey-g"><b>{{ item.g }}</b>G</dt>
        <dd class="doss-journey-h">
          {{ parts(item.hours).figure }}<span v-if="parts(item.hours).unit" class="doss-journey-unit">{{ parts(item.hours).unit }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style>
/*
 * The headline-fact tiles again (.doss-fact), six of them: three across, six when there is room.
 * The section is its own container: at Half it sits in the narrow side column, where six across
 * cut the figures.
 */
.doss-journey-section {
  container-type: inline-size;
  container-name: journey;
}

.doss-journey {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

@container journey (min-width: 540px) {
  .doss-journey {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.doss-journey-item {
  display: flex;
  min-width: 0;
}

.doss-journey-tile {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.doss-journey-tile .doss-journey-g {
  flex: 0 0 auto;
  margin: 0;
  color: var(--signal);
  font: 700 11px/1.3 var(--font-code);
  letter-spacing: 0.04em;
  text-transform: none;
}

.doss-journey-tile .doss-journey-g b {
  font-size: 14px;
}

.doss-journey-tile .doss-journey-h {
  margin: 0;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: var(--tabular);
  line-height: 1.3;
}

.doss-journey-unit {
  margin-left: 3px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
}

/* The tile as a button: the same tile, with the dossier rows' hover and focus. */
.doss-journey-tile.is-action {
  width: 100%;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.doss-journey-tile.is-action:hover {
  border-color: var(--signal-edge);
  background: var(--wash-faint);
}

.doss-journey-tile.is-action:hover .doss-journey-g {
  color: var(--signal-bright);
}

.doss-journey-tile.is-action:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
