<script setup lang="ts">
/**
 * The store's filter sections (prompts/d_store_2.md item 2): the left column at 1024 px and wider,
 * and the body of the Filters sheet below it. Kind, Contents, Edition, Tags, Updated and Publisher,
 * each a heading and its choices with counts in grey. Ticking a box changes the URL at once
 * (PackagesView.vue); this component only says which choice was pressed.
 */
import { computed, ref } from 'vue';
import { TAGS_SHOWN, type Facet, type Facets, type FilterKey } from './filters.ts';

const props = defineProps<{ facets: Facets }>();
const emit = defineEmits<{ (e: 'toggle', key: FilterKey, value: string): void }>();

const allTags = ref(false);
const tags = computed(() => {
    const list = props.facets.tags;
    if (allTags.value) return list;
    // A tag that is on stays in view even past the first ten.
    return list.filter((facet, i) => i < TAGS_SHOWN || facet.on);
});

type Section = { key: Exclude<FilterKey, 'updated' | 'tags'>; heading: string; list: Facet[] };
const lists = computed((): Section[] => [
    { key: 'kinds', heading: 'Kind', list: props.facets.kinds },
    { key: 'contents', heading: 'Contents', list: props.facets.contents },
    { key: 'editions', heading: 'Edition', list: props.facets.editions },
]);
</script>

<template>
  <div class="mk-filters">
    <template v-for="section in lists" :key="section.key">
      <section v-if="section.list.length" class="mk-fsec" :data-filter="section.key">
        <h2 class="mk-fhead">{{ section.heading }}</h2>
        <ul class="mk-flist">
          <li v-for="facet in section.list" :key="facet.value">
            <label class="mk-fopt">
              <input type="checkbox" :checked="facet.on" @change="emit('toggle', section.key, facet.value)" />
              <span class="mk-fwords">{{ facet.words }}</span>
              <span class="mk-fcount">{{ facet.count }}</span>
            </label>
          </li>
        </ul>
      </section>
    </template>

    <section v-if="facets.tags.length" class="mk-fsec" data-filter="tags">
      <h2 class="mk-fhead">Tags</h2>
      <ul class="mk-flist">
        <li v-for="facet in tags" :key="facet.value">
          <label class="mk-fopt">
            <input type="checkbox" :checked="facet.on" @change="emit('toggle', 'tags', facet.value)" />
            <span class="mk-fwords">{{ facet.words }}</span>
            <span class="mk-fcount">{{ facet.count }}</span>
          </label>
        </li>
      </ul>
      <button v-if="facets.tags.length > TAGS_SHOWN" type="button" class="mk-link mk-fmore" :aria-expanded="allTags ? 'true' : 'false'" @click="allTags = !allTags">
        {{ allTags ? 'See fewer' : 'See more' }}
      </button>
    </section>

    <section class="mk-fsec" data-filter="updated">
      <h2 class="mk-fhead">Updated</h2>
      <ul class="mk-flist">
        <li v-for="facet in facets.updated" :key="facet.value">
          <button type="button" class="mk-flink" :aria-pressed="facet.on ? 'true' : 'false'" @click="emit('toggle', 'updated', facet.value)">
            <span class="mk-fwords">{{ facet.words }}</span>
            <span class="mk-fcount">{{ facet.count }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="facets.by.length" class="mk-fsec" data-filter="by">
      <h2 class="mk-fhead">Publisher</h2>
      <ul class="mk-flist">
        <li v-for="facet in facets.by" :key="facet.value">
          <label class="mk-fopt">
            <input type="checkbox" :checked="facet.on" @change="emit('toggle', 'by', facet.value)" />
            <span class="mk-fwords">{{ facet.words }}</span>
            <span class="mk-fcount">{{ facet.count }}</span>
          </label>
        </li>
      </ul>
    </section>
  </div>
</template>

<style>
.mk-filters {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
}

.mk-fhead {
  margin: 0 0 6px;
  color: var(--text-0);
  font: 700 13.5px/1.3 var(--font-text);
}

.mk-flist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mk-fopt,
.mk-flink {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--r-1);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mk-fopt:hover,
.mk-flink:hover {
  background: var(--neutral-wash);
  color: var(--text-0);
}

.mk-fopt input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--signal);
}

.mk-fwords {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.mk-fcount {
  flex: none;
  color: var(--text-muted);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.mk-flink[aria-pressed="true"] {
  color: var(--text-0);
  font-weight: 700;
}

.mk-fmore {
  margin-top: 4px;
  padding-left: 4px;
}
</style>
