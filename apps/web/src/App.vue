<script setup lang="ts">
import { RouterView } from 'vue-router';
import PanelHost from './shell/PanelHost.vue';
import ToastStrip from './shell/ToastStrip.vue';
</script>

<template>
  <div class="app">
    <RouterView />
    <PanelHost />
    <ToastStrip />
  </div>
</template>

<style>
.app {
  position: fixed;
  inset: 0;
}
/* An expanded rail pushes the chart, the omnibox, the panel and the orbit card. */
.app:has(.rail.is-expanded) {
  --rail-width: var(--rail-width-open);
}
</style>
