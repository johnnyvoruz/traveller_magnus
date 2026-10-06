<script setup lang="ts">
/**
 * The orbit view's nav bar (legacy .sv-view-nav, js/system_viewer.js:1630-1690): back to the
 * map, the system's identity, the edition badge, More tools (a slot), and the keyboard and
 * mouse help, whose table is the commands table itself (orbit/commands.ts). Edit system is a
 * Builder control and is not here.
 */
import Icon from '../design/Icon.vue';
import { keyWords, MOUSE_HELP, ORBIT_COMMANDS } from './commands.ts';
import OrbitPopover from './OrbitPopover.vue';

defineProps<{
    title: string;
    /** The hex, shown as a chip when the title is not already the hex. */
    chip: string;
    place: string;
    /** "3.95 Gyr", or empty until the system document is in. */
    age: string;
    /** The rules edition the system was generated under ("MgT2E"), or empty. */
    edition: string;
    keysOpen: boolean;
}>();

defineEmits<{ back: []; keys: [open: boolean] }>();

/** The keys this view answers to, from the commands table, then the mouse. */
const KEYS: [string, string][] = [
    ...ORBIT_COMMANDS.filter((command) => command.keys.length).map((command): [string, string] => [
        command.keys.map(keyWords).filter(Boolean).join(' / '), command.help,
    ]),
    ...MOUSE_HELP,
];
</script>

<template>
  <header class="orbit-nav">
    <button type="button" class="orbit-btn orbit-back" data-command="orbit-escape" title="Back to the map (Esc)" @click="$emit('back')">
      <Icon name="arrow-left" :size="13" />Map
    </button>
    <div class="orbit-identity">
      <div class="orbit-identity-title">
        <h1>{{ title }}</h1>
        <span v-if="chip" class="ui-hex">{{ chip }}</span>
        <span v-if="edition" class="ui-badge orbit-edition" title="The rules edition this system was generated under">{{ edition }}</span>
      </div>
      <p class="orbit-identity-meta">
        <span v-if="place">{{ place }}</span>
        <template v-if="age">
          <span v-if="place" class="orbit-sep" aria-hidden="true">·</span>
          <span class="orbit-age">{{ age }}</span>
        </template>
      </p>
    </div>
    <div class="orbit-nav-tools">
      <slot name="tools" />
      <OrbitPopover
        id="orbit-keys"
        :open="keysOpen"
        icon="keyboard"
        label="Keyboard and mouse"
        title="Keyboard and mouse"
        :show-label="false"
        @toggle="$emit('keys', !keysOpen)"
        @close="$emit('keys', false)"
      >
        <dl class="orbit-keys">
          <template v-for="row in KEYS" :key="row[0]">
            <dt>{{ row[0] }}</dt>
            <dd>{{ row[1] }}</dd>
          </template>
        </dl>
      </OrbitPopover>
    </div>
  </header>
</template>

<style>
.orbit-nav {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 14px;
  min-height: 57px;
  padding: 8px 14px;
  background: var(--stage-head);
  border-bottom: 1px solid var(--signal-line);
}

.orbit-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid var(--line-1);
}

.orbit-identity-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-width: 0;
}

.orbit-identity h1 {
  margin: 0;
  min-width: 0;
  color: var(--text-0);
  font: 700 18px/1.2 var(--font-text);
  letter-spacing: -0.2px;
  overflow-wrap: anywhere;
}

.orbit-identity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  min-height: 16px;
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.35 var(--font-text);
}

.orbit-sep {
  color: var(--text-faint);
}

.orbit-age {
  font-variant-numeric: var(--tabular);
}

.orbit-nav-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.orbit-keys {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  margin: 0;
}

.orbit-keys dt {
  color: var(--signal);
  font: 700 12px/1.5 var(--font-code);
}

.orbit-keys dd {
  margin: 0;
  color: var(--text-1);
  font-size: 13px;
}
</style>
