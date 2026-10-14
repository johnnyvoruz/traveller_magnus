<script setup lang="ts">
/**
 * One question in the app's modal frame (`.ui-modal*`, design/base.css): Report, Take down,
 * Restore, Remove. A reason box when asked for. Escape or the scrim cancels; focus starts in
 * the box, or on Cancel. No native dialog.
 */
import { nextTick, onMounted, ref } from 'vue';

const props = defineProps<{
    title: string;
    text: string;
    confirm: string;
    /** Ask for a reason (up to 500 characters). */
    reason?: boolean;
    danger?: boolean;
    busy?: boolean;
    error?: string;
}>();

const emit = defineEmits<{ (e: 'confirm', reason: string): void; (e: 'cancel'): void }>();
const reasonText = ref('');
const box = ref<HTMLTextAreaElement | null>(null);
const cancelEl = ref<HTMLButtonElement | null>(null);

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        emit('cancel');
    }
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
    <div class="ui-modal mk-ask" role="dialog" aria-modal="true" :aria-label="title" @keydown="onKey">
      <div class="ui-modal-scrim" @click="emit('cancel')"></div>
      <form class="ui-modal-card mk-ask-card" @submit.prevent="send">
        <div class="ui-modal-bar"><span class="ui-modal-title">{{ title }}</span></div>
        <p class="mk-ask-text">{{ text }}</p>
        <label v-if="reason" class="mk-fld">
          <span>Reason</span>
          <textarea ref="box" v-model="reasonText" class="mk-box" rows="3" maxlength="500" :disabled="busy"></textarea>
        </label>
        <p v-if="error" class="mk-err" role="alert">{{ error }}</p>
        <div class="mk-ask-acts">
          <button ref="cancelEl" type="button" class="ui-btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
          <button type="submit" class="ui-btn is-primary" :class="{ 'is-danger': danger }" :disabled="busy || (reason && !reasonText.trim())">{{ confirm }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style>
.ui-modal-card.mk-ask-card {
  width: min(460px, 100%);
}

.mk-ask-text {
  margin: 0;
}

.mk-ask-acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mk-ask .mk-fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.mk-ask .ui-btn.is-primary.is-danger {
  border-color: var(--danger);
  background: var(--danger);
}
</style>