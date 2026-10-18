<script setup lang="ts">
/**
 * /changes: the What's new window, over the map. /changes/<version> is that release.
 * Closing either leaves /.
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChangelogWindow from '../workspace/ChangelogWindow.vue';
import MapView from './MapView.vue';

const route = useRoute();
const router = useRouter();

const version = computed(() => {
    const value = route.params.version;
    return typeof value === 'string' ? value : '';
});

function leave(): void {
    void router.replace('/');
}
</script>

<template>
  <MapView />
  <ChangelogWindow :version="version" @close="leave" />
</template>
