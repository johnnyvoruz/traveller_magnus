<script setup lang="ts">
/**
 * Help, in the app's one modal frame (design/base.css .ui-modal).
 * Escape, Close, and the scrim leave it. Focus starts on Close and returns to the opener.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../design/Icon.vue';
import { wrapFocus } from './focus_trap.ts';
import HelpGuide from './HelpGuide.vue';

const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
const returnTo = ref<HTMLElement | null>(null);

function stops(): HTMLElement[] {
    const root = dialog.value;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>('button, a[href]')].filter((el) => el.getClientRects().length > 0);
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
        const list = stops();
        const at = list.indexOf(document.activeElement as HTMLElement);
        const next = wrapFocus(list.length, at, event.shiftKey);
        if (next !== null) {
            event.preventDefault();
            list[next].focus();
        }
        event.stopPropagation();
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        emit('close');
        return;
    }
    event.stopPropagation();
}

function holdFocus(event: FocusEvent): void {
    const root = dialog.value;
    if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
    const list = stops();
    if (list.length) list[0].focus();
}

onMounted(() => {
    returnTo.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('focusin', holdFocus);
    void nextTick(() => { if (closeBtn.value) closeBtn.value.focus(); });
});

onBeforeUnmount(() => {
    document.removeEventListener('focusin', holdFocus);
    const back = returnTo.value;
    if (back && back.isConnected) back.focus();
});
</script>

<template>
  <Teleport to="body">
    <div ref="dialog" class="ui-modal help" role="dialog" aria-modal="true" aria-labelledby="help-h" @keydown="onKey">
      <div class="ui-modal-scrim" @click="emit('close')"></div>
      <div class="ui-modal-card help-card">
        <div class="ui-modal-bar">
          <button ref="closeBtn" type="button" class="ui-btn is-icon help-close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
            <Icon name="xmark" :size="14" />
          </button>
        </div>
        <HelpGuide />
      </div>
    </div>
  </Teleport>
</template>

<style>
.ui-modal-card.help-card {
  box-sizing: border-box;
  width: min(560px, 100%);
  max-height: calc(100vh - 48px);
  min-height: 0;
  overflow: auto;
}

.help-close {
  margin-left: auto;
}

@media (max-width: 480px) {
  .ui-modal.help {
    padding: 8px;
  }

  .ui-modal-card.help-card {
    max-height: calc(100vh - 16px);
  }
}
</style>
