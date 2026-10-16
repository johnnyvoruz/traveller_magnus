<script setup lang="ts">
/**
 * One product card (prompts/d_storefront.md point 2): the cover in a fixed 16:9 box with a single
 * kind badge, then the title, "by @handle", one line of facts and "Updated" as a relative date.
 * The whole card is one link. `wide` is the featured row's banner. Cards load the 640 px file.
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { PackageCard } from '../../marketplace/catalogue.ts';
import { FAMILY_WORDS, shownCover } from '../../marketplace/covers.ts';
import { packagePath } from './market.ts';
import { cardFacts, updatedWords } from './storefront.ts';

const props = defineProps<{ card: PackageCard; cdn: string; wide?: boolean; now: number }>();

const cover = computed(() => shownCover(props.card, props.cdn));
</script>

<template>
  <RouterLink class="mk-card" :class="{ 'is-wide': wide }" :to="packagePath(card.id)" :data-cover="cover.source">
    <span class="mk-cover">
      <img :src="cover.thumb" :alt="card.title" loading="lazy" decoding="async" width="640" height="360">
      <span class="mk-badge">{{ FAMILY_WORDS[cover.family] }}</span>
    </span>
    <span class="mk-card-body">
      <b class="mk-card-title">{{ card.title }}</b>
      <span v-if="card.hidden" class="mk-st" data-state="failed">Taken down</span>
      <span class="mk-card-by">by @{{ card.authorHandle }}</span>
      <span class="mk-card-facts">{{ cardFacts(card) }}</span>
      <span class="mk-card-when">{{ updatedWords(card.updatedAt, now) }}</span>
    </span>
  </RouterLink>
</template>

<style>
.mk-card {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  color: var(--text-0);
  text-decoration: none;
  transition: border-color var(--t-fast) var(--ease-out);
}

.mk-card:hover {
  border-color: var(--signal-line);
}

.mk-cover {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--store-placeholder);
}

.mk-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mk-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--store-badge);
  color: var(--text-0);
  font: 600 11px/1.5 var(--font-text);
}

.mk-card-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px 12px;
}

.mk-card-title {
  font: 700 15px/1.3 var(--font-display);
}

.mk-card.is-wide .mk-card-title {
  font-size: 18px;
}

.mk-card-by,
.mk-card-facts,
.mk-card-when {
  color: var(--text-muted);
  font-size: 12.5px;
}

.mk-card-by {
  color: var(--text-1);
}

.mk-card-when {
  margin-top: auto;
  padding-top: 4px;
}
</style>
