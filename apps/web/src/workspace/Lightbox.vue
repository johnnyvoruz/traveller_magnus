<script setup lang="ts">
/**
 * One image large (K14): over everything, with its caption to read or change, the way to
 * the next and the one before, and Esc to leave. Focus goes to Close on open, stays inside
 * while it is open, and goes back to where it was on close. Under reduced motion nothing fades.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CampaignImage } from '@voyage/shared';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import EditableText from './EditableText.vue';
import { wrapFocus } from './focus_trap.ts';
import { imageUrl, imageWords } from './images.ts';

const props = defineProps<{
    images: readonly CampaignImage[];
    index: number;
    universeId: string;
    readOnly: boolean;
    /** The record's name, for an image with no caption. */
    name: string;
    /** Where an image is served; the owner's object route when absent (a package page passes the CDN). */
    urlOf?: (hash: string) => string;
}>();

const emit = defineEmits<{
    close: [];
    index: [index: number];
    caption: [hash: string, text: string];
}>();

const dialog = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLElement | null>(null);
const returnTo = ref<HTMLElement | null>(null);

const image = computed(() => props.images[props.index] ?? null);
const count = computed(() => props.images.length);

function step(by: number): void {
    if (count.value < 2) return;
    emit('index', (props.index + by + count.value) % count.value);
}

/** The controls Tab can reach, in order. */
function stops(): HTMLElement[] {
    const root = dialog.value;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>('button, [tabindex="0"], select, input, textarea')].filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
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

/** Focus that lands outside the open lightbox is brought back to Close. */
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
  <!-- On the body: the panel's transform would otherwise make it the containing block of this fixed box. -->
  <Teleport to="body">
  <div ref="dialog" class="ui-modal lightbox" role="dialog" aria-modal="true" :aria-label="image && image.caption ? image.caption : name" @keydown="onKey">
    <div class="ui-modal-scrim" @click="emit('close')"></div>
    <div class="ui-modal-card">
      <div class="ui-modal-bar">
        <span class="ui-modal-title">{{ index + 1 }} of {{ count }}</span>
        <span v-if="image" class="ui-modal-meta">{{ imageWords(image) }}</span>
        <button ref="closeBtn" type="button" class="ui-btn is-icon lightbox-close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
          <Icon name="xmark" :size="14" />
        </button>
      </div>
      <div class="lightbox-stage">
        <button v-if="count > 1" type="button" class="lightbox-step is-prev" aria-label="Previous image" title="Previous (Left)" @click="step(-1)">
          <Icon name="chevron-left" :size="16" />
        </button>
        <img v-if="image" class="lightbox-img" :src="urlOf ? urlOf(image.hash) : imageUrl(universeId, image.hash)" :alt="image.caption || name">
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
  </Teleport>
</template>

<style>
/* The frame (.ui-modal, its scrim, card and bar) is design/base.css. */
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
</style>
