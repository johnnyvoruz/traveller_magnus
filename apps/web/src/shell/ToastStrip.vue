<script setup lang="ts">
/**
 * The toast strip (design_reference.md §3; campaign_manager_plan.md §6.3): at the lower left,
 * at most two, each with an optional action. A toast leaves after its time unless the pointer
 * is on it or focus is in it. It is a polite live region, so a screen reader hears it.
 */
import { onBeforeUnmount, watch } from 'vue';
import Icon from '../design/Icon.vue';
import { dismissToast, toasts, type Toast } from './toast.ts';

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const held = new Set<number>();

function stop(id: number): void {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
}

function start(toast: Toast): void {
    stop(toast.id);
    if (held.has(toast.id)) return;
    timers.set(toast.id, setTimeout(() => { dismissToast(toast.id); }, toast.ms));
}

function hold(toast: Toast): void {
    held.add(toast.id);
    stop(toast.id);
}

function release(toast: Toast): void {
    held.delete(toast.id);
    start(toast);
}

function act(toast: Toast): void {
    const action = toast.action;
    dismissToast(toast.id);
    if (action) action.run();
}

watch(() => toasts.map((toast) => toast.id), (ids) => {
    for (const toast of toasts) if (!timers.has(toast.id) && !held.has(toast.id)) start(toast);
    for (const id of [...timers.keys()]) if (!ids.includes(id)) stop(id);
    for (const id of [...held]) if (!ids.includes(id)) held.delete(id);
}, { immediate: true });

onBeforeUnmount(() => {
    for (const id of [...timers.keys()]) stop(id);
});
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      @mouseenter="hold(toast)"
      @mouseleave="release(toast)"
      @focusin="hold(toast)"
      @focusout="release(toast)"
    >
      <span class="toast-text">{{ toast.message }}</span>
      <button v-if="toast.action" type="button" class="toast-act" @click="act(toast)">{{ toast.action.label }}</button>
      <button type="button" class="toast-close" aria-label="Dismiss" title="Dismiss" @click="dismissToast(toast.id)">
        <Icon name="xmark" :size="13" />
      </button>
    </div>
  </div>
</template>

<style>
.toasts {
  position: absolute;
  left: calc(var(--rail-width) + var(--chrome-inset) + 16px);
  bottom: 22px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(460px, calc(100vw - var(--rail-width) - 2 * var(--chrome-inset) - 32px));
  pointer-events: none;
  transition: left var(--t-rail) ease;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 8px 9px 14px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--signal-dim);
  border-radius: var(--r-2);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
  pointer-events: auto;
  animation: toast-in var(--t-fast) var(--ease-out) both;
}

.toast-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.toast-act {
  flex: 0 0 auto;
  margin: 0;
  padding: 4px 10px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-2);
  background: transparent;
  color: var(--signal);
  font: 700 13px/1.3 var(--font-text);
  cursor: pointer;
}

.toast-act:hover {
  border-color: var(--signal);
  background: var(--row-active);
}

.toast-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.toast-close:hover {
  color: var(--text-0);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .toasts {
    transition: none;
  }

  .toast {
    animation: none;
  }
}
</style>
