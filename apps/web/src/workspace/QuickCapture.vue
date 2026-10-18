<script setup lang="ts">
/**
 * Quick capture (streams/D.md DU7; UX backlog U7): Q on the map opens one line, "Add a note", under the
 * search row. Enter keeps it as a journal note mentioning the selected hex and the record open in the
 * campaign panel (journal/quick_note.ts), without opening the panel; a toast says so and offers Open.
 * Esc, or leaving the box empty, closes it. The map view says when it opens and what it knows.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { draftNote, saveEntry } from '../campaign/journal.ts';
import { showToast } from '../shell/toast.ts';
import { captureWhere, quickNoteBody, type CaptureContext } from './journal/quick_note.ts';

const props = defineProps<{ context: CaptureContext }>();
const emit = defineEmits<{ close: []; open: [entryId: string] }>();

const text = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const problem = ref('');
/** What it mentions, then what the keys do: one line. */
const say = computed(() => [captureWhere(props.context), 'Enter adds it to the journal. Esc closes.'].filter(Boolean).join(' '));

function keep(): void {
    const body = quickNoteBody(text.value, props.context);
    if (!body) {
        emit('close');
        return;
    }
    const entry = { ...draftNote(), body };
    if (!saveEntry(entry)) {
        problem.value = 'The note could not be kept: the campaign is not open.';
        return;
    }
    emit('close');
    showToast('Note added to the journal.', { action: { label: 'Open', run: () => emit('open', entry.id) } });
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        emit('close');
    }
}

onMounted(() => { void nextTick(() => { if (inputEl.value) inputEl.value.focus(); }); });
</script>

<template>
  <!-- The pane paints above the map view: the box leaves it, as the date chip does, so a wide pane never covers it. -->
  <Teleport to=".app">
  <form class="quick-capture" role="dialog" aria-modal="false" aria-label="Quick note" data-quick-capture @submit.prevent="keep" @keydown="onKey">
    <input ref="inputEl" v-model="text" class="quick-capture-box" type="text" placeholder="Add a note" aria-label="Add a note" maxlength="2000" />
    <p class="quick-capture-say">{{ say }}</p>
    <p v-if="problem" class="quick-capture-say is-error" role="alert">{{ problem }}</p>
  </form>
  </Teleport>
</template>

<style>
/* Under the search field, on its glass, the width of the field at most: where the first hint sits. */
.quick-capture {
  position: absolute;
  top: calc(var(--chrome-top) + var(--chrome-height) + 6px);
  left: calc(var(--rail-width) + var(--chrome-inset));
  z-index: 7;
  box-sizing: border-box;
  width: min(440px, calc(100% - var(--rail-width) - 2 * var(--chrome-inset)));
  margin: 0;
  padding: 8px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--signal);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome), 0 0 24px var(--frame-glow);
}

.quick-capture-box {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-0);
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
}

.quick-capture-box:focus-visible {
  outline: 1px solid var(--signal);
  outline-offset: 1px;
}

.quick-capture-say {
  margin: 6px 2px 0;
  color: var(--text-muted);
  font: 400 12px/1.45 var(--font-text);
}

.quick-capture-say.is-error {
  color: var(--attention);
}

/* Below 680 px the date chip sits under the search: the box goes under the chip, as the hint does. */
@media (max-width: 680px) {
  .quick-capture {
    top: calc(var(--chrome-top) + 2 * (var(--chrome-height) + 8px));
  }

  .quick-capture-box {
    height: 44px;
  }
}
</style>
