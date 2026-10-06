<script setup lang="ts">
/**
 * The deck plan at the window's size (follow-up 1): the one modal pattern (the lightbox's),
 * with the viewer inside it unchanged (pan, zoom, Fit, the credit), Esc to leave, focus back
 * where it was. The viewer is Agent C's deckplan/DeckPlanView.vue, wrapped, not edited.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DeckPlan } from '@voyage/shared';
import DeckPlanView from '../deckplan/DeckPlanView.vue';
import Icon from '../design/Icon.vue';

defineProps<{ plan: DeckPlan; name: string }>();
const emit = defineEmits<{ close: [] }>();

const closeBtn = ref<HTMLElement | null>(null);
const returnTo = ref<HTMLElement | null>(null);

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        emit('close');
        return;
    }
    event.stopPropagation();
}

onMounted(() => {
    returnTo.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void nextTick(() => { if (closeBtn.value) closeBtn.value.focus(); });
});

onBeforeUnmount(() => {
    const back = returnTo.value;
    if (back && back.isConnected) back.focus();
});
</script>

<template>
  <!-- On the body: the panel's transform would otherwise make it the containing block of this fixed box. -->
  <Teleport to="body">
  <div class="lightbox plan-modal" role="dialog" aria-modal="true" :aria-label="'Deck plan of ' + name" @keydown="onKey">
    <div class="lightbox-scrim" @click="emit('close')"></div>
    <div class="lightbox-card plan-modal-card">
      <div class="lightbox-bar">
        <span class="lightbox-count">{{ plan.name }}</span>
        <span class="lightbox-meta">{{ name }} · drag to pan, wheel to zoom, F to fit</span>
        <button ref="closeBtn" type="button" class="ui-btn is-icon lightbox-close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
          <Icon name="xmark" :size="14" />
        </button>
      </div>
      <div class="plan-modal-view">
        <DeckPlanView :plan="plan" />
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style>
.plan-modal {
  padding: 16px;
}

.plan-modal-card {
  width: 100%;
  height: 100%;
}

.plan-modal-view {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
}
</style>
