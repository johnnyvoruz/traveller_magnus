<script setup lang="ts">
/**
 * The changelog list. Loaded with the window, or in place of the sign-in card, and not before.
 * A version opens that release as its own page: two lines, and a picture once one ships.
 */
import { computed } from 'vue';
import { CHANGELOG, type Release } from '../changelog.ts';

const props = withDefaults(defineProps<{ version?: string }>(), { version: '' });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function writtenDate(date: string): string {
    const [year, month, day] = date.split('-');
    return Number(day) + ' ' + MONTHS[Number(month) - 1] + ' ' + year;
}

const page = computed((): Release | null => {
    if (!props.version) return null;
    return CHANGELOG.find((release) => release.version === props.version) ?? null;
});

const missing = computed(() => props.version.length > 0 && page.value === null);
</script>

<template>
  <div class="changes-body">
    <h2 id="changes-h" class="changes-h">What's new</h2>
    <div class="ui-rule changes-rule"></div>
    <article v-if="page" class="changes-page">
      <p class="changes-ver"><span>{{ page.version }}</span><span class="ui-date">{{ writtenDate(page.date) }}</span></p>
      <h3 class="changes-title">{{ page.title }}</h3>
      <p class="changes-story">{{ page.story[0] }}</p>
      <p class="changes-story">{{ page.story[1] }}</p>
      <figure v-if="page.picture" class="changes-picture">
        <img :src="page.picture" :alt="page.title">
      </figure>
      <details class="changes-more">
        <summary>The full list</summary>
        <ul>
          <li v-for="item in page.items" :key="item">{{ item }}</li>
        </ul>
      </details>
      <p class="changes-help"><a href="/changes">All versions</a><a href="/help">Help</a> How to publish and share.</p>
    </article>
    <template v-else-if="missing">
      <p class="changes-story">This version is not in What's new.</p>
      <p class="changes-help"><a href="/changes">All versions</a><a href="/help">Help</a> How to publish and share.</p>
    </template>
    <template v-else>
      <ol class="ui-steps changes-steps">
        <li v-for="(release, index) in CHANGELOG" :key="release.version" class="ui-step changes-release" :class="{ 'is-lit': index === 0 }">
          <p class="changes-ver"><span>{{ release.version }}</span><span class="ui-date">{{ writtenDate(release.date) }}</span></p>
          <p class="changes-title"><a :href="'/changes/' + release.version">{{ release.title }}</a></p>
          <p class="changes-story">{{ release.story[0] }}</p>
          <p class="changes-story">{{ release.story[1] }}</p>
          <figure v-if="release.picture" class="changes-picture">
            <img :src="release.picture" :alt="release.title">
          </figure>
          <details :open="index === 0 ? true : undefined">
            <summary>The full list</summary>
            <ul>
              <li v-for="item in release.items" :key="item">{{ item }}</li>
            </ul>
          </details>
        </li>
      </ol>
      <p class="changes-help"><a href="/help">Help</a> How to publish and share.</p>
    </template>
  </div>
</template>

<style>
.changes-body {
  min-width: 0;
}

/*
 * The version-video look: the releases on a line of hex steps, the newest lit; the version line in Orbitron.
 * The version and the date are two spans. The date sits in the date box.
 * A version page is the same frame with two lines. The picture is added when it ships.
 */
.changes-h {
  margin: 0;
  color: var(--text-0);
  font: 700 19px/1.3 var(--font-display);
  letter-spacing: 0.02em;
}

.changes-rule {
  margin: 8px 0 14px;
}

.changes-steps {
  margin: 0;
}

.changes-release details {
  padding: 0 0 2px;
}

.changes-release summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}

.changes-ver {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--text-0);
  font: 700 14px/1.3 var(--font-display);
  letter-spacing: 0.06em;
}

.changes-release.is-lit .changes-ver,
.changes-page .changes-ver {
  color: var(--signal);
}

.changes-title {
  margin: 0;
  color: var(--text-1);
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.4;
}

.changes-title a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.changes-title a:hover {
  color: var(--signal);
}

.changes-story {
  margin: 8px 0 0;
  color: var(--text-1);
  font-size: 14px;
  line-height: 1.45;
}

.changes-picture {
  margin: 12px 0 0;
}

.changes-picture img {
  display: block;
  max-width: 100%;
  height: auto;
}

.changes-release ul,
.changes-more ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.changes-release li {
  margin: 0 0 4px;
}

.changes-help {
  margin: 12px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.4;
}

.changes-help a {
  margin-right: 6px;
  border: 0;
  background: none;
  color: var(--signal);
  font: 600 13px/1.4 var(--font-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.changes-help a:hover {
  color: var(--signal-bright);
}
</style>
