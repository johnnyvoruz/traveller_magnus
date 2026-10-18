<script setup lang="ts">
/**
 * View as players, in the Campaign panel's head (players_build_plan.md P5): the referee's switch, and
 * while it is on, the banner "You're seeing what players see" with the way back. A player never sees
 * either.
 */
import Icon from '../../design/Icon.vue';
import { campaign } from '../../campaign/store.ts';
import { endViewAs, startViewAs, VIEW_AS_BANNER, viewAs } from './view_as.ts';
</script>

<template>
  <p v-if="viewAs.on" class="viewas-bar" role="status" data-view-as-on>
    <Icon name="eye" :size="14" />
    <span class="ui-kicker viewas-say">{{ VIEW_AS_BANNER }}</span>
    <button type="button" class="ui-btn viewas-stop" :disabled="viewAs.busy" data-view-as-stop @click="endViewAs">Stop viewing as players</button>
  </p>
  <button
    v-else-if="campaign.role === 'owner' && campaign.status === 'ready'"
    type="button"
    class="ui-btn viewas-start"
    title="See the campaign as your players see it. Nothing can be changed while you look."
    :disabled="viewAs.busy"
    data-view-as
    @click="startViewAs"
  >
    <Icon name="eye" :size="13" />View as players
  </button>
</template>

<style>
.viewas-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin: 0 0 10px;
  padding: 8px 12px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-3);
  background: var(--row-active);
  color: var(--signal);
}

.viewas-say {
  flex: 1 1 auto;
  color: var(--signal);
}

.viewas-start {
  align-self: flex-start;
}
</style>
