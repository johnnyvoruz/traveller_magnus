<script setup lang="ts">
/**
 * View as players (players_build_plan.md P5): the referee's switch, and while it is on, the banner
 * "You're seeing what players see" with the way back. A player never sees either.
 *
 * Where the switch sits (DU36): in the panel's head row at Half and Full, before Timeline, so it takes
 * no row of its own before the records (`place="head"`; the words at Full, the eye alone at Half, where
 * the words would push the head onto two rows). The banner stays a bar above the tabs at every span
 * (`place="banner"`). Where the head is not shown (Column; a record or entry open at Half) the bar
 * holds the switch as before (`place="bar"`).
 */
import Icon from '../../design/Icon.vue';
import { campaign } from '../../campaign/store.ts';
import { endViewAs, startViewAs, VIEW_AS_BANNER, viewAs } from './view_as.ts';

const props = withDefaults(defineProps<{ place?: 'bar' | 'banner' | 'head'; words?: boolean }>(), { place: 'bar', words: true });

const VIEW_AS_LABEL = 'View as players';
const VIEW_AS_TITLE = "See the campaign as your players see it. You can't change anything while you look.";
</script>

<template>
  <template v-if="props.place === 'head'">
    <button
      v-if="campaign.role === 'owner' && campaign.status === 'ready' && !viewAs.on"
      type="button"
      class="camp-timeline viewas-head"
      :title="VIEW_AS_TITLE"
      :aria-label="props.words ? undefined : VIEW_AS_LABEL"
      :disabled="viewAs.busy"
      data-view-as
      @click="startViewAs"
    >
      <Icon name="eye" :size="13" /><span v-if="props.words">{{ VIEW_AS_LABEL }}</span>
    </button>
  </template>
  <p v-else-if="viewAs.on" class="viewas-bar" role="status" data-view-as-on>
    <Icon name="eye" :size="14" />
    <span class="ui-kicker viewas-say">{{ VIEW_AS_BANNER }}</span>
    <button type="button" class="ui-btn viewas-stop" :disabled="viewAs.busy" data-view-as-stop @click="endViewAs">Stop viewing as players</button>
  </p>
  <button
    v-else-if="props.place === 'bar' && campaign.role === 'owner' && campaign.status === 'ready'"
    type="button"
    class="ui-btn viewas-start"
    :title="VIEW_AS_TITLE"
    :disabled="viewAs.busy"
    data-view-as
    @click="startViewAs"
  >
    <Icon name="eye" :size="13" />{{ VIEW_AS_LABEL }}
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

/* In the head row the switch takes the Timeline button's look, the eye before the words; the eye alone keeps the words' height (DU36). */
.viewas-head {
  gap: 7px;
  min-height: calc(1.3em + 16px);
}
</style>
