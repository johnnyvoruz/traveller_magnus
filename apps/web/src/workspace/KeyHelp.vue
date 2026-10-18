<script setup lang="ts">
/**
 * Keyboard shortcuts (streams/D.md DU13; UX backlog U13): `?`, or "Keyboard shortcuts" in the palette,
 * opens this sheet in the shared modal frame. It lists every key the registry holds right now, grouped
 * (shell/key_help.ts), so a new command's key appears here with no list kept by hand. A key that cannot
 * run just now is shown dimmed. Esc, the close button or the scrim close it, and focus goes back.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import Icon from '../design/Icon.vue';
import { keyGroups } from '../shell/key_help.ts';
import { commands } from '../shell/registry.ts';

const emit = defineEmits<{ close: [] }>();

const card = ref<HTMLElement | null>(null);
const held = typeof document !== 'undefined' ? document.activeElement : null;
const groups = computed(() => keyGroups(commands()));

function close(): void {
    emit('close');
    if (held instanceof HTMLElement) held.focus();
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
}

onMounted(() => {
    void nextTick(() => {
        const first = card.value ? card.value.querySelector<HTMLElement>('button') : null;
        if (first) first.focus();
    });
});
</script>

<template>
  <Teleport to="body">
    <div class="ui-modal key-help" role="dialog" aria-modal="true" aria-labelledby="key-help-h" data-key-help @keydown="onKey">
      <div class="ui-modal-scrim" @click="close()"></div>
      <div ref="card" class="ui-modal-card key-help-card">
        <div class="ui-modal-bar">
          <h2 id="key-help-h" class="ui-modal-title">Keyboard shortcuts</h2>
          <button type="button" class="ui-btn" aria-label="Close" @click="close()"><Icon name="xmark" :size="13" /></button>
        </div>
        <div class="key-help-body">
          <section v-for="group in groups" :key="group.title" class="key-help-group" :aria-labelledby="'key-help-' + group.title">
            <h3 :id="'key-help-' + group.title" class="ui-kicker">{{ group.title }}</h3>
            <dl class="key-help-rows">
              <div v-for="row in group.rows" :key="row.name" class="key-help-row" :class="{ 'is-off': !row.on }">
                <dt><kbd>{{ row.keys }}</kbd></dt>
                <dd>{{ row.name }}</dd>
              </div>
            </dl>
          </section>
          <p class="key-help-fine">Dimmed keys work where their screen or tool is open. These are the keys this screen has now; the map's gestures are under its ? button.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.key-help-card {
  width: min(560px, 100%);
}

.key-help-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: min(70vh, 640px);
  overflow-y: auto;
  padding: 4px 2px 2px;
}

.key-help-rows {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
}

.key-help-row {
  display: grid;
  grid-template-columns: minmax(0, 150px) minmax(0, 1fr);
  align-items: baseline;
  gap: 12px;
}

.key-help-row dt {
  margin: 0;
}

.key-help-row dd {
  margin: 0;
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.key-help-row kbd {
  padding: 0 6px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  color: var(--text-0);
  font: 500 11.5px/1.6 var(--font-code);
  white-space: nowrap;
}

.key-help-row.is-off dd,
.key-help-row.is-off kbd {
  color: var(--text-muted);
}

.key-help-fine {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.45 var(--font-text);
}
</style>
