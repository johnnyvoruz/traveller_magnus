<script setup lang="ts">
import type { PanelSpan } from '../shell/panel_state.ts';
import type { OverviewModel } from './model.ts';
import Icon from '../design/Icon.vue';
import JourneyTimes from './JourneyTimes.vue';
import SocioBlock from './SocioBlock.vue';
import StatRows from './StatRows.vue';
import StellarLines from './StellarLines.vue';
import SystemTree from './SystemTree.vue';
import UwpRibbon from './UwpRibbon.vue';

defineProps<{
    model: OverviewModel;
    span: PanelSpan;
    error: boolean;
    /** Offer Explore orbits (not when the panel already sits beside the orbit view). */
    orbitLink?: boolean;
    /** Campaign records per body key, shown as counts in the system tree. */
    counts?: Record<string, number>;
}>();

defineEmits<{
    open: [key: string];
    orbit: [];
    retry: [];
}>();
</script>

<template>
  <div class="doss" :data-span="span">
    <div class="doss-identity">
      <!-- With no mainworld callout to sit in, Explore orbits keeps its own row. -->
      <div v-if="orbitLink && model.tree && !model.holdLead" class="doss-actions">
        <button
          type="button"
          class="ui-btn is-primary"
          title="Open orbit view for this system (or double-click it on the map)"
          @click="$emit('orbit')"
        >
          <Icon name="solar-system" :size="13" />Explore orbits
        </button>
      </div>
      <button
        v-if="model.ribbon && model.mainworldKey"
        type="button"
        class="doss-ribbon-link"
        :aria-label="model.callout && model.callout.name ? 'Open ' + model.callout.name : 'Open the mainworld'"
        @click="$emit('open', model.mainworldKey)"
      >
        <UwpRibbon :ribbon="model.ribbon" />
      </button>
      <UwpRibbon v-else-if="model.ribbon" :ribbon="model.ribbon" />
      <div v-if="model.holdLead" class="doss-callout" :aria-hidden="model.callout || model.mainworldKey ? undefined : 'true'">
        <p v-if="model.callout" class="doss-callout-line">
          <span class="doss-callout-name">{{ model.callout.name }}</span>
          <span class="doss-callout-words">{{ model.callout.badge }}</span>
        </p>
        <div v-if="model.mainworldKey || (orbitLink && model.tree)" class="doss-callout-actions">
          <button v-if="model.mainworldKey" type="button" class="ui-btn" @click="$emit('open', model.mainworldKey)">
            <Icon name="earth-americas" :size="13" />Mainworld
          </button>
          <button
            v-if="orbitLink && model.tree"
            type="button"
            class="ui-btn is-primary"
            title="Open orbit view for this system (or double-click it on the map)"
            @click="$emit('orbit')"
          >
            <Icon name="solar-system" :size="13" />Explore orbits
          </button>
        </div>
      </div>
      <StatRows :rows="model.rows" />
      <p v-if="model.holdLead && !model.journey" class="doss-journey-note" :aria-hidden="model.journeyNote ? undefined : 'true'">
        <button
          v-if="model.journeyNote && model.mainworldKey"
          type="button"
          class="doss-quiet"
          @click="$emit('open', model.mainworldKey)"
        >
          {{ model.journeyNote }}
        </button>
      </p>
      <JourneyTimes v-if="model.journey" :journey="model.journey" />
      <p v-if="model.notice" class="doss-muted">{{ model.notice }}</p>
      <p v-if="error" class="doss-muted">This world's system could not be loaded.</p>
      <div v-if="error" class="doss-actions">
        <button type="button" class="ui-btn" @click="$emit('retry')"><Icon name="retry" :size="13" />Retry</button>
      </div>
    </div>
    <div class="doss-side">
      <div v-if="model.socio" class="doss-socio">
        <SocioBlock :headline="model.socio.headline" :rows="model.socio.rows" :empty="model.socio.empty" :span="span">
          <StellarLines v-if="model.stellar" :lines="model.stellar.lines" />
        </SocioBlock>
      </div>
      <slot name="records" />
      <SystemTree v-if="model.tree" :count="model.tree.count" :rows="model.tree.rows" :counts="counts" @open="$emit('open', $event)" />
    </div>
  </div>
</template>

<style>
/* The ribbon is the link to the mainworld. It keeps the ribbon's own shape. */
.doss-ribbon-link {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}

.doss-ribbon-link:hover .doss-cell {
  background: var(--wash);
}

/* One line for the mainworld, held at the control's height before the tree arrives. */
.doss-callout {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-height: var(--sp-8);
  margin: var(--sp-2) 0;
}

.doss-callout-line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  min-width: 0;
  color: var(--text-1);
  font: 400 13px/1.5 var(--font-text);
}

.doss-callout-name {
  color: var(--text-0);
  font-weight: 600;
}

.doss-callout-words {
  color: var(--text-muted);
}

/* Mainworld, then Explore orbits to its right. The pair wraps as one, never apart. */
.doss-callout-actions {
  display: flex;
  flex: none;
  gap: var(--sp-2);
}

/* The jump-times sentence. The row is there before the words are, so the rows under it do not move. */
.doss-journey-note {
  min-height: 1.5em;
  margin: var(--sp-2) 0 0;
}

.doss-quiet {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.doss-quiet:hover {
  color: var(--text-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
