<script setup lang="ts">
/**
 * The app's one confirm (streams/D.md DU23; UX backlog U23), in the shared modal frame (`.ui-modal*`,
 * design/base.css): a title, what will happen, an optional reason box, and two buttons. Escape or the
 * scrim cancels; focus starts in the box, or on the cancel button, so Enter never confirms by accident.
 * No native dialog. Used by the store (report, take down, restore, remove), the Player Pack and
 * deleting a campaign.
 */
import { nextTick, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{
    title: string;
    text: string;
    confirm: string;
    /** The button that backs out: "Cancel", or the screen's own words ("Keep it"). */
    cancelLabel?: string;
    /** Ask for a reason (up to 500 characters). */
    reason?: boolean;
    /** A red confirm, for a delete. */
    danger?: boolean;
    busy?: boolean;
    /** The confirm's words while busy: "Deleting…". */
    busyText?: string;
    error?: string;
}>(), { cancelLabel: 'Cancel', reason: false, danger: false, busy: false, busyText: '', error: '' });

const emit = defineEmits<{ (e: 'confirm', reason: string): void; (e: 'cancel'): void }>();
const reasonText = ref('');
const box = ref<HTMLTextAreaElement | null>(null);
const cancelEl = ref<HTMLButtonElement | null>(null);
const held = typeof document !== 'undefined' ? document.activeElement : null;

function cancel(): void {
    if (props.busy) return;
    emit('cancel');
    if (held instanceof HTMLElement && held.isConnected) held.focus();
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
}

function send(): void {
    if (props.busy || (props.reason && !reasonText.value.trim())) return;
    emit('confirm', reasonText.value.trim());
}

onMounted(() => {
    void nextTick(() => { (box.value ?? cancelEl.value)?.focus(); });
});
</script>

<template>
  <Teleport to="body">
    <div class="ui-modal ui-ask" role="alertdialog" aria-modal="true" aria-labelledby="ui-ask-h" aria-describedby="ui-ask-text" data-ask @keydown="onKey">
      <div class="ui-modal-scrim" @click="cancel()"></div>
      <form class="ui-modal-card ui-ask-card" @submit.prevent="send">
        <div class="ui-modal-bar"><h2 id="ui-ask-h" class="ui-modal-title ui-ask-title">{{ title }}</h2></div>
        <p id="ui-ask-text" class="ui-ask-text">{{ text }}</p>
        <label v-if="reason" class="ui-ask-fld">
          <span>Reason</span>
          <textarea ref="box" v-model="reasonText" class="ui-ask-box" rows="3" maxlength="500" :disabled="busy"></textarea>
        </label>
        <p v-if="error" class="ui-ask-err" role="alert">{{ error }}</p>
        <div class="ui-ask-acts">
          <button ref="cancelEl" type="button" class="ui-btn" :disabled="busy" data-ask-cancel @click="cancel()">{{ cancelLabel }}</button>
          <button type="submit" class="ui-btn is-primary" :class="{ 'is-danger': danger }" :disabled="busy || (reason && !reasonText.trim())" data-ask-confirm>{{ busy && busyText ? busyText : confirm }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style>
.ui-modal-card.ui-ask-card {
  width: min(460px, 100%);
}

.ui-ask-title {
  margin: 0;
  font: 600 15px/1.35 var(--font-text);
}

.ui-ask-text {
  margin: 0;
  color: var(--text-1);
  font: 400 13.5px/1.5 var(--font-text);
}

.ui-ask-fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.ui-ask-box {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
  resize: vertical;
}

.ui-ask-err {
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-2);
  color: var(--text-1);
  font: 400 12.5px/1.45 var(--font-text);
}

.ui-ask-acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.ui-ask .ui-btn.is-primary.is-danger {
  border-color: var(--danger);
  background: var(--danger);
}

/* Touch: 44 px, below 640 px as the store does, and on any coarse pointer. */
@media (max-width: 639px), (pointer: coarse) {
  .ui-ask .ui-btn,
  .ui-ask-box {
    min-height: 44px;
  }
}
</style>
