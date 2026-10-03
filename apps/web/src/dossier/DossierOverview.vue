<script setup lang="ts">
import type { PanelSpan } from '../shell/panel_state.ts';
import type { OverviewModel } from './model.ts';
import Icon from '../design/Icon.vue';
import SocioBlock from './SocioBlock.vue';
import StatRows from './StatRows.vue';
import StellarLines from './StellarLines.vue';
import SurfaceStage from './SurfaceStage.vue';
import SystemTree from './SystemTree.vue';
import UwpRibbon from './UwpRibbon.vue';

defineProps<{
    model: OverviewModel;
    span: PanelSpan;
    error: boolean;
}>();

defineEmits<{
    open: [key: string];
    retry: [];
}>();
</script>

<template>
  <div class="doss" :data-span="span">
    <SurfaceStage :badge="model.mapBadge" />
    <div class="doss-identity">
      <div v-if="model.mainworldKey" class="doss-actions">
        <button type="button" class="ui-btn" @click="model.mainworldKey && $emit('open', model.mainworldKey)">
          <Icon name="earth-americas" :size="13" />Mainworld
        </button>
      </div>
      <UwpRibbon v-if="model.ribbon" :ribbon="model.ribbon" />
      <StatRows :rows="model.rows" />
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
      <SystemTree v-if="model.tree" :count="model.tree.count" :rows="model.tree.rows" @open="$emit('open', $event)" />
    </div>
  </div>
</template>
