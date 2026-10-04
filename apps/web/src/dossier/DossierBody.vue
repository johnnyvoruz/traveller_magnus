<script setup lang="ts">
import type { PanelSpan } from '../shell/panel_state.ts';
import type { BodyLink, BodyModel } from './model.ts';
import BodyRow from './BodyRow.vue';
import type { DayNightFigure } from '../orbit/daynight.ts';
import DayNight from './DayNight.vue';
import FactTiles from './FactTiles.vue';
import JourneyTimes from './JourneyTimes.vue';
import StatRows from './StatRows.vue';
import SurfaceStage, { type SurfaceTarget } from './SurfaceStage.vue';
import UwpRibbon from './UwpRibbon.vue';

defineProps<{
    model: BodyModel;
    span: PanelSpan;
    /** Tiles the view restates, by label (the Year tile, said in standard days). */
    restated?: Record<string, { value: string; notes: string[] }[]>;
    /** The body whose surface map leads the profile, or null. */
    surface?: SurfaceTarget | null;
    /** The day and night cycle (orbit/daynight.ts), or null when the document gives no solar day. */
    dayNight?: DayNightFigure | null;
}>();

defineEmits<{ open: [key: string] }>();

function factsOf(link: BodyLink): string {
    return link.facts[0] || '';
}
</script>

<template>
  <div class="doss-body" :data-span="span">
    <div class="doss-main">
      <SurfaceStage :badge="model.mapBadge" :target="surface ?? null" />
      <UwpRibbon v-if="model.ribbon" :ribbon="model.ribbon" />
      <FactTiles :facts="model.facts" :restated="restated" />
      <DayNight v-if="dayNight" :figure="dayNight" />
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
