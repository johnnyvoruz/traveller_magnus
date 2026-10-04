<script setup lang="ts">
import type { PanelSpan } from '../shell/panel_state.ts';
import type { BodyLink, BodyModel } from './model.ts';
import BodyRow from './BodyRow.vue';
import FactTiles from './FactTiles.vue';
import JourneyTimes from './JourneyTimes.vue';
import StatRows from './StatRows.vue';
import SurfaceStage from './SurfaceStage.vue';
import UwpRibbon from './UwpRibbon.vue';

defineProps<{
    model: BodyModel;
    span: PanelSpan;
}>();

defineEmits<{ open: [key: string] }>();

function factsOf(link: BodyLink): string {
    return link.facts[0] || '';
}
</script>

<template>
  <div class="doss-body" :data-span="span">
    <div class="doss-main">
      <SurfaceStage :badge="model.mapBadge" />
      <UwpRibbon v-if="model.ribbon" :ribbon="model.ribbon" />
      <FactTiles :facts="model.facts" />
      <JourneyTimes v-if="model.journey" :journey="model.journey" />
      <section v-for="block in model.mainSections" :key="block.heading" class="doss-section">
        <h3 class="ui-heading">{{ block.heading }}</h3>
        <StatRows :rows="block.rows" />
      </section>
    </div>
    <div class="doss-body-side">
      <section v-for="block in model.sideSections" :key="block.heading" class="doss-section">
        <h3 class="ui-heading">{{ block.heading }}</h3>
        <StatRows :rows="block.rows" />
      </section>
      <section v-if="model.moons.length" class="doss-section">
        <h3 class="ui-heading">Moons</h3>
        <BodyRow
          v-for="link in model.moons"
          :key="link.key"
          :body-key="link.key"
          :name="link.name"
          :facts="link.facts"
          :title="factsOf(link) ? link.name + ' · ' + factsOf(link) : link.name"
          :glyph="link.glyph"
          @click="$emit('open', link.key)"
        />
      </section>
      <section v-if="model.worlds.length" class="doss-section">
        <h3 class="ui-heading">Worlds</h3>
        <BodyRow
          v-for="link in model.worlds"
          :key="link.key"
          :body-key="link.key"
          :name="link.name"
          :facts="link.facts"
          :glyph="link.glyph"
          :title="factsOf(link) ? link.name + ' · ' + factsOf(link) : link.name"
          @click="$emit('open', link.key)"
        />
      </section>
    </div>
  </div>
</template>
