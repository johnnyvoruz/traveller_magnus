<script setup lang="ts">
/**
 * The read view for record details and a journal body. Nodes become elements.
 * Nothing here assigns HTML from the source: a tag in the text stays text.
 */
import type { BodyPart } from './body.ts';
import type { RichNode } from './rich.ts';
import RichNodes from './RichNodes.vue';
import { vRecordCard } from '../record_card.ts';

defineProps<{ nodes: RichNode[] }>();

const emit = defineEmits<{
    open: [part: Exclude<BodyPart, { kind: 'text' }>];
}>();
</script>

<template>
  <template v-for="(part, index) in nodes" :key="index">
    <template v-if="part.kind === 'text'">{{ part.text }}</template>
    <strong v-else-if="part.kind === 'bold'">
      <RichNodes :nodes="part.children" @open="emit('open', $event)" />
    </strong>
    <em v-else-if="part.kind === 'italic'">
      <RichNodes :nodes="part.children" @open="emit('open', $event)" />
    </em>
    <a
      v-else-if="part.kind === 'link'"
      :href="part.href"
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      <RichNodes :nodes="part.children" @open="emit('open', $event)" />
    </a>
    <ul v-else-if="part.kind === 'list'">
      <li v-for="(item, itemIndex) in part.items" :key="itemIndex">
        <RichNodes :nodes="item" @open="emit('open', $event)" />
      </li>
    </ul>
    <br v-else-if="part.kind === 'break'">
    <button
      v-else
      v-record-card="part.kind === 'record' ? part.id : null"
      type="button"
      class="ui-chip jn-token"
      @click="emit('open', part)"
    >{{ part.label }}</button>
  </template>
</template>

<style>
.edit-view.is-rich {
  white-space: normal;
}

.edit-view.is-rich ul {
  margin: 0.35em 0;
  padding-left: 1.2em;
}

.edit-view.is-rich a {
  color: var(--signal);
}

.jn-token {
  margin: 0 2px;
  vertical-align: baseline;
  cursor: pointer;
}
</style>
