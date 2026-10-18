<script setup lang="ts">
/**
 * Publish, from the store's header (prompts/d_store_harden.md item 4): a short chooser in the app's
 * modal frame. Records (people, ships, organizations) opens Publish records for the open campaign;
 * Map hexes goes to the map with Build on, to select hexes and then Publish selection. When a way
 * can't be taken yet, the chooser says what to do first in one sentence (`note`), with Sign in when
 * that is the step. The store does the work (PackagesView.vue); this only says what was chosen.
 */
import { nextTick, onMounted, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { wrapFocus } from '../focus_trap.ts';

defineProps<{
    /** What to do first, after a way was chosen and can't be taken yet. */
    note: string;
    /** The note's step is signing in. */
    signIn: boolean;
    /** Records is opening the campaign. */
    busy: boolean;
}>();

const emit = defineEmits<{ records: []; hexes: []; signin: []; close: [] }>();
const card = ref<HTMLElement | null>(null);

function stops(): HTMLElement[] {
    return card.value ? Array.from(card.value.querySelectorAll<HTMLElement>('button:not([disabled])')) : [];
}

/** Tab stays in the chooser; Escape closes it. */
function onKey(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
        const list = stops();
        const next = wrapFocus(list.length, list.indexOf(document.activeElement as HTMLElement), event.shiftKey);
        if (next !== null) {
            event.preventDefault();
            list[next].focus();
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        emit('close');
    }
}

onMounted(() => {
    void nextTick(() => {
        const first = card.value ? card.value.querySelector<HTMLElement>('.mk-way') : null;
        if (first) first.focus();
    });
});
</script>

<template>
  <Teleport to="body">
    <div class="ui-modal mk-choose" role="dialog" aria-modal="true" aria-labelledby="mk-choose-h" data-publish-chooser @keydown="onKey">
      <div class="ui-modal-scrim" @click="emit('close')"></div>
      <div ref="card" class="ui-modal-card mk-choose-card">
        <div class="ui-modal-bar">
          <h2 id="mk-choose-h" class="ui-modal-title">Publish</h2>
          <button type="button" class="ui-btn mk-choose-close" aria-label="Close" @click="emit('close')"><Icon name="xmark" :size="13" /></button>
        </div>
        <p class="mk-choose-lead">Share what you made. Everyone can find it here and import it into a campaign.</p>
        <div class="mk-ways">
          <button type="button" class="mk-way" data-way="records" :disabled="busy" @click="emit('records')">
            <Icon name="book-sparkles" :size="22" />
            <span class="mk-way-words">
              <span class="ui-kicker">Records</span>
              <b>People, ships, organizations</b>
              <span class="mk-fine">Publish records from your campaign.</span>
            </span>
          </button>
          <button type="button" class="mk-way" data-way="hexes" :disabled="busy" @click="emit('hexes')">
            <Icon name="draw-polygon" :size="22" />
            <span class="mk-way-words">
              <span class="ui-kicker">Map hexes</span>
              <b>Systems, a subsector, a sector</b>
              <span class="mk-fine">Publish part of your map, with its records.</span>
            </span>
          </button>
        </div>
        <p v-if="busy" class="mk-fine" role="status">Opening your campaign…</p>
        <div v-else-if="note" class="mk-choose-note" role="status">
          <p>{{ note }}</p>
          <button v-if="signIn" type="button" class="ui-btn is-primary" @click="emit('signin')">Sign in</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.ui-modal-card.mk-choose-card {
  width: min(520px, 100%);
}

.mk-choose-close {
  margin-left: auto;
}

.mk-choose-lead {
  margin: 0;
  color: var(--text-1);
}

.mk-ways {
  display: grid;
  gap: 10px;
}

/* A way to publish: a tile with the rail's icon for it (Campaign, Build), a kicker and one line. */
.mk-way {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-3);
  background: var(--bg-0);
  color: var(--text-0);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.mk-way:hover:not(:disabled) {
  border-color: var(--signal-line);
  background: var(--surface-2);
}

.mk-way:disabled {
  opacity: 0.5;
  cursor: default;
}

.mk-way .ui-icon {
  flex: none;
  margin-top: 2px;
  color: var(--signal);
}

.mk-way-words {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.mk-way-words b {
  font: 700 15px/1.3 var(--font-text);
}

.mk-choose-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 8px 10px;
  border-left: 3px solid var(--attention);
  background: var(--bg-2);
}

.mk-choose-note p {
  flex: 1 1 220px;
  margin: 0;
  color: var(--text-0);
}

@media (prefers-reduced-motion: reduce) {
  .mk-way {
    transition: none;
  }
}
</style>
