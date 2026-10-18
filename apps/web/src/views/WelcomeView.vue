<script setup lang="ts">
/**
 * /welcome: the first-visit window, over the map. Closing it leaves /.
 */
import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { setWelcomeCovering } from '../workspace/first_visit.ts';
import { markWelcomeShown } from '../workspace/welcome.ts';
import WelcomeWindow from '../workspace/WelcomeWindow.vue';
import MapView from './MapView.vue';

setWelcomeCovering(true);
onBeforeUnmount(() => { setWelcomeCovering(false); });

const router = useRouter();

function leave(): void {
    markWelcomeShown();
    setWelcomeCovering(false);
    void router.replace('/');
}
</script>

<template>
  <MapView />
  <WelcomeWindow @close="leave" />
</template>
