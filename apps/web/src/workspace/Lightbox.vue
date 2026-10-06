<script setup lang="ts">
/**
 * One image large (K14): over everything, with its caption to read or change, the way to
 * the next and the one before, and Esc to leave. Focus goes to Close on open and back to
 * where it was on close. Under reduced motion nothing fades.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CampaignImage } from '@voyage/shared';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import EditableText from './EditableText.vue';
import { imageUrl, imageWords } from './images.ts';

const props = defineProps<{
    images: readonly CampaignImage[];
    index: number;
    universeId: string;
    readOnly: boolean;
    /** The record's name, for an image with no caption. */
    name: string;
}>();

const emit = defineEmits<{
    close: [];
    index: [index: number];
    caption: [hash: string, text: string];
}>();

const closeBtn = ref<HTMLElement | null>(null);
const returnTo = ref<HTMLElement | null>(null);

const image = computed(() => props.images[props.index] ?? null);
const count = computed(() => props.images.length);

function step(by: number): void {
    if (count.value < 2) return;
    emit('index', (props.index + by + count.value) % count.value);
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        emit('close');
        return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        event.preventDefault();
        event.stopPropagation();
        step(event.key === 'ArrowRight' ? 1 : -1);
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
  <div class="lightbox" role="dialog" aria-modal="true" :aria-label="image && image.caption ? image.caption : name" @keydown="onKey">
    <div class="lightbox-scrim" @click="emit('close')"></div>
    <div class="lightbox-card">
      <div class="lightbox-bar">
        <span class="lightbox-count">{{ index + 1 }} of {{ count }}</span>
        <span v-if="image" class="lightbox-meta">{{ imageWords(image) }}</span>
        <button ref="closeBtn" type="button" class="ui-btn is-icon lightbox-close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
          <Icon name="xmark" :size="14" />
        </button>
      </div>
      <div class="lightbox-stage">
        <button v-if="count > 1" type="button" class="lightbox-step is-prev" aria-label="Previous image" title="Previous (Left)" @click="step(-1)">
          <Icon name="chevron-left" :size="16" />
        </button>
        <img v-if="image" class="lightbox-img" :src="imageUrl(universeId, image.hash)" :alt="image.caption || name">
        <button v-if="count > 1" type="button" class="lightbox-step is-next" aria-label="Next image" title="Next (Right)" @click="step(1)">
          <Icon name="chevron-right" :size="16" />
        </button>
      </div>
      <div v-if="image" class="lightbox-caption">
        <EditableText
          :key="image.hash"
          label="Caption"
          prompt="Add a caption"
          :value="image.caption || ''"
          :max="CAMPAIGN_LIMITS.caption"
          :disabled="readOnly"
          @save="emit('caption', image.hash, $event)"
        />
      </div>
    </div>
  </div>
</template>

<style>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: lightbox-in var(--t-fast) var(--ease-out) both;
}

.lightbox-scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--bg-0) 88%, transparent);
}

.lightbox-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(1100px, 100%);
  max-height: 100%;
  padding: 12px 14px 14px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-4);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
}

.lightbox-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lightbox-count {
  color: var(--text-0);
  font-weight: 600;
}

.lightbox-meta {
  flex: 1 1 auto;
  color: var(--text-muted);
  font-size: 12.5px;
}

.lightbox-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  max-height: calc(100vh - 200px);
  overflow: hidden;
  border-radius: var(--r-3);
  background: var(--bg-0);
}

.lightbox-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 200px);
  object-fit: contain;
}

.lightbox-step {
  position: absolute;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-top: -20px;
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--chrome-glass);
  color: var(--text-0);
  cursor: pointer;
}

.lightbox-step.is-prev { left: 12px; }
.lightbox-step.is-next { right: 12px; }

.lightbox-step:hover {
  border-color: var(--signal);
  color: var(--signal);
}

.lightbox-caption {
  padding: 0 2px;
}

@keyframes lightbox-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .lightbox {
    animation: none;
  }
}
</style>
