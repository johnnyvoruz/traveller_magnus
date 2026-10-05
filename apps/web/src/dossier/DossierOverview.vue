<script setup lang="ts">
import type { PanelSpan } from '../shell/panel_state.ts';
import type { OverviewModel } from './model.ts';
import Icon from '../design/Icon.vue';
import JourneyTimes from './JourneyTimes.vue';
import SocioBlock from './SocioBlock.vue';
import StatRows from './StatRows.vue';
import StellarLines from './StellarLines.vue';
import SurfaceStage, { type SurfaceTarget } from './SurfaceStage.vue';
import SystemTree from './SystemTree.vue';
import UwpRibbon from './UwpRibbon.vue';

defineProps<{
    model: OverviewModel;
    span: PanelSpan;
    error: boolean;
    /** The mainworld, whose surface map leads the overview, or null. */
    surface?: SurfaceTarget | null;
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
    <SurfaceStage :badge="model.mapBadge" :target="surface ?? null" />
    <div class="doss-identity">
      <div v-if="model.mainworldKey || (orbitLink && model.tree)" class="doss-actions">
        <button
          v-if="orbitLink && model.tree"
          type="button"
          class="ui-btn is-primary"
          title="Open orbit view for this system (or double-click it on the map)"
          @click="$emit('orbit')"
        >
          <Icon name="solar-system" :size="13" />Explore orbits
        </button>
        <button v-if="model.mainworldKey" type="button" class="ui-btn" @click="model.mainworldKey && $emit('open', model.mainworldKey)">
          <Icon name="earth-americas" :size="13" />Mainworld
        </button>
      </div>
      <UwpRibbon v-if="model.ribbon" :ribbon="model.ribbon" />
      <StatRows :rows="model.rows" />
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
