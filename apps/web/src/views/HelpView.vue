<script setup lang="ts">
/**
 * /help: the publishing guide, over the map. Closing it leaves /.
 */
import { useRouter } from 'vue-router';
import HelpWindow from '../workspace/HelpWindow.vue';
import MapView from './MapView.vue';

const router = useRouter();

function leave(): void {
    void router.replace('/');
}
</script>

<template>
  <MapView />
  <HelpWindow @close="leave" />
</template>
