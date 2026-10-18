<script setup lang="ts">
/**
 * One product card (prompts/d_storefront.md point 2): the cover in a fixed 16:9 box with a single
 * kind badge, then the title, "by @handle", one line of facts and "Updated" as a relative date.
 * `wide` is the featured row's banner. Cards load the 640 px file.
 *
 * Every name is a link (manifesto, Connected; prompts/d_store_harden.md item 3): the title opens the
 * package and its link covers the whole card, the kind badge filters the store by kind, and the
 * handle filters it by publisher. Tab goes title, kind, author. In the videos' look (item 5): the red
 * NEW tag on a package updated in the last 7 days, and the date in the outlined date box.
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { PackageCard } from '../../marketplace/catalogue.ts';
import { FAMILY_WORDS, shownCover } from '../../marketplace/covers.ts';
import { byPath, kindPath, packagePath } from './market.ts';
import { cardFacts, dateWords, isNew, updatedWords } from './storefront.ts';

const props = defineProps<{ card: PackageCard; cdn: string; wide?: boolean; now: number }>();

const cover = computed(() => shownCover(props.card, props.cdn));
</script>

<template>
  <article class="mk-card" :class="{ 'is-wide': wide }" :data-cover="cover.source">
    <span class="mk-cover">
      <img :src="cover.thumb" alt="" loading="lazy" decoding="async" width="640" height="360">
      <span v-if="isNew(card.updatedAt, now)" class="ui-new mk-card-new">New</span>
    </span>
    <span class="mk-card-body">
      <RouterLink class="mk-card-title mk-card-link" :to="packagePath(card.id)">{{ card.title }}</RouterLink>
      <RouterLink class="mk-badge" :to="kindPath(cover.family)" :aria-label="'More ' + FAMILY_WORDS[cover.family]">{{ FAMILY_WORDS[cover.family] }}</RouterLink>
      <span v-if="card.hidden" class="mk-st" data-state="failed">Taken down</span>
      <RouterLink class="mk-card-by" :to="byPath(card.authorHandle)">by @{{ card.authorHandle }}</RouterLink>
      <span class="mk-card-facts">{{ cardFacts(card) }}</span>
      <span class="mk-card-when"><time class="ui-date" :datetime="card.updatedAt" :title="updatedWords(card.updatedAt, now)">{{ dateWords(card.updatedAt) }}</time></span>
    </span>
  </article>
</template>

<style>
.mk-card {
  position: relative;
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

/* The title's link covers the card; the kind and the author sit above it as links of their own. */
.mk-card-link {
  color: inherit;
  text-decoration: none;
}

.mk-card-link::after {
  content: '';
  position: absolute;
  inset: 0;
}

.mk-card-link:focus-visible {
  outline: none;
}

.mk-card:has(.mk-card-link:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

.mk-badge,
.mk-card-by {
  position: relative;
  z-index: 1;
  text-decoration: none;
}

.mk-badge:hover,
.mk-card-by:hover {
  color: var(--signal);
  text-decoration: underline;
  text-underline-offset: 3px;
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
  padding-top: 8px;
}

.mk-card-new {
  position: absolute;
  top: 8px;
  right: 8px;
}
</style>
