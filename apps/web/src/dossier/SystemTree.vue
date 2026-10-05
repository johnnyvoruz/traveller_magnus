<script setup lang="ts">
import type { TreeRow } from './model.ts';
import BodyRow from './BodyRow.vue';

defineProps<{
    count: number;
    rows: TreeRow[];
    /** Campaign records per body key, when someone is signed in. */
    counts?: Record<string, number>;
}>();
defineEmits<{ open: [key: string] }>();
</script>

<template>
  <section class="doss-tree">
    <h3 class="ui-heading">System <span class="ui-count">{{ count }}</span></h3>
    <BodyRow
      v-for="row in rows"
      :key="row.key"
      :body-key="row.key"
      :name="row.name"
      :facts="row.facts"
      :tag="row.tag"
      :uwp="row.uwp"
      :moon="row.moon"
      :glyph="row.glyph"
      :count="counts ? counts[row.key] ?? 0 : 0"
      @click="$emit('open', row.key)"
    />
  </section>
</template>

<style>
.doss-tree > .ui-heading:first-child {
  margin-top: 0;
}

.doss[data-span="column"] .doss-tree {
  margin-top: 18px;
}
</style>
