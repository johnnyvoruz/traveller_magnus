<script setup lang="ts">
/**
 * A person at a glance (slice 2 follow-up 9): the app's one modal pattern (the lightbox's)
 * holding a read-only card, the primary image, the name, the summary and where they are,
 * with "Open record" and Esc. Pressed from a pill on the ship sheet. On the body, as the
 * other modals are, so the panel's transform cannot hold it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { imageUrl, primaryImage } from './images.ts';
import { placeLine, typeInfo } from './records.ts';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const route = useRoute();
const closeBtn = ref<HTMLElement | null>(null);
const returnTo = ref<HTMLElement | null>(null);

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted ? found : null;
});
const image = computed(() => {
    const found = record.value ? primaryImage(record.value) : null;
    return found && campaign.universeId ? { src: imageUrl(campaign.universeId, found.hash), caption: found.caption } : null;
});
const where = computed(() => (record.value ? placeLine(record.value, campaign.records) : ''));

function openRecord(): void {
    if (!record.value) return;
    const id = record.value.id;
    emit('close');
    void router.push({ path: '/campaign/r/' + encodeURIComponent(id), query: route.query });
}

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
  <Teleport to="body">
  <div class="lightbox person-card" role="dialog" aria-modal="true" :aria-label="record ? record.name : 'Person'" @keydown="onKey">
    <div class="lightbox-scrim" @click="emit('close')"></div>
    <div class="lightbox-card person-card-box">
      <div class="lightbox-bar">
        <span class="lightbox-count"><Icon :name="record ? typeInfo(record.type).icon : 'user'" :size="12" />{{ record ? typeInfo(record.type).one : 'Person' }}</span>
        <span class="lightbox-meta"></span>
        <button ref="closeBtn" type="button" class="ui-btn is-icon lightbox-close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
          <Icon name="xmark" :size="14" />
        </button>
      </div>
      <template v-if="record">
        <div class="person-card-body">
          <img v-if="image" class="person-card-img" :src="image.src" :alt="image.caption || record.name" decoding="async">
          <div v-else class="person-card-img is-none" aria-hidden="true"><Icon name="user" :size="36" /></div>
          <div class="person-card-text">
            <h3 class="person-card-name">{{ record.name }}</h3>
            <p v-if="where" class="person-card-where"><Icon name="location-dot" :size="11" />{{ where }}</p>
            <p v-if="record.summary" class="person-card-summary">{{ record.summary }}</p>
            <p v-else class="person-card-summary is-none">No summary yet.</p>
          </div>
        </div>
        <div class="person-card-acts">
          <button type="button" class="ui-btn is-primary person-card-open" @click="openRecord"><Icon name="pen-to-square" :size="12" />Open record</button>
        </div>
      </template>
      <p v-else class="person-card-summary is-none">This record is gone.</p>
    </div>
  </div>
  </Teleport>
</template>

<style>
.person-card-box {
  width: min(520px, 100%);
}

.person-card .lightbox-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.person-card-body {
  display: flex;
  gap: 16px;
  min-width: 0;
}

/* The primary image, square, or the type's mark where there is none. */
.person-card-img {
  flex: 0 0 auto;
  width: 120px;
  height: 120px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  object-fit: cover;
  background: var(--bg-2);
}

.person-card-img.is-none {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.person-card-text {
  flex: 1 1 auto;
  min-width: 0;
}

.person-card-name {
  margin: 2px 0 6px;
  color: var(--text-0);
  font: 700 18px/1.25 var(--font-text);
  overflow-wrap: anywhere;
}

.person-card-where {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 12.5px;
}

.person-card-summary {
  margin: 0;
  color: var(--text-1);
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.person-card-summary.is-none {
  color: var(--text-muted);
  font-style: italic;
}

.person-card-acts {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 520px) {
  .person-card-body {
    flex-direction: column;
  }
}
</style>
