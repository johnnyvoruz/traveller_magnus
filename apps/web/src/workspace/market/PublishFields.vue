<script setup lang="ts">
/**
 * The package half of a publish: a new package (title, kind, description, tags, cover) or one of
 * yours for a new version. Shared by Publish selection (Build) and Publish records (the records
 * list, contract F18), so both ask the same way. What is typed lives in `marketUi`.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { coverDraft, MARKET_LIMITS, marketUi, parseTags, usePublishTarget, type FormProblem } from './market.ts';
import { defaultCoverUrl, kindFamily } from '../../marketplace/covers.ts';
import CoverEditor from './CoverEditor.vue';
import type { PreparedCover } from './cover_image.ts';
import { sizeWords } from './storefront.ts';
import './market.css';

const props = defineProps<{
    problems: readonly FormProblem[];
    /** Publish was tried: a missing title or kind is said now. */
    tried: boolean;
}>();

const { mine, target, isNew } = usePublishTarget();
const tags = computed(() => parseTags(marketUi.tags));
/** A missing title or kind is said once Publish is tried; a limit passed is said at once. */
const fieldProblems = computed(() => props.problems.filter((item) => item.field !== 'hexes' && item.field !== 'records' && (props.tried || item.field === 'description' || item.field === 'tags')));

/** The draft cover's preview, as an object address; let go when it changes or the form closes. */
const draftUrl = ref('');
watch(coverDraft, (draft) => {
    if (draftUrl.value) URL.revokeObjectURL(draftUrl.value);
    draftUrl.value = draft ? URL.createObjectURL(new Blob([draft.image as BlobPart], { type: 'image/webp' })) : '';
}, { immediate: true });
const coverSrc = computed(() => draftUrl.value || defaultCoverUrl(kindFamily(marketUi.kind), true));

function takeCover(cover: PreparedCover): void {
    coverDraft.value = cover;
}

function problem(field: string): string {
    const found = props.problems.find((item) => item.field === field);
    return found ? found.text : '';
}

onBeforeUnmount(() => {
    if (draftUrl.value) URL.revokeObjectURL(draftUrl.value);
});
</script>

<template>
  <label class="mk-fld">
    <span>Package</span>
    <select v-model="marketUi.target" class="mk-box" :disabled="marketUi.busy">
      <option value="new">A new package</option>
      <option v-for="item in mine" :key="item.id" :value="item.id">{{ item.title }} · {{ item.latestVersion ? 'version ' + item.latestVersion : 'not published yet' }}</option>
    </select>
  </label>

  <template v-if="isNew">
    <label class="mk-fld">
      <span>Title</span>
      <input v-model="marketUi.title" class="mk-box" type="text" :maxlength="MARKET_LIMITS.title" autocomplete="off" :disabled="marketUi.busy" :aria-invalid="tried && problem('title') ? 'true' : undefined" />
      <small :class="{ 'is-full': marketUi.title.length >= MARKET_LIMITS.title }">{{ marketUi.title.length }} of {{ MARKET_LIMITS.title }} characters</small>
    </label>
    <label class="mk-fld">
      <span>Kind</span>
      <input v-model="marketUi.kind" class="mk-box" type="text" :maxlength="MARKET_LIMITS.kind" autocomplete="off" :disabled="marketUi.busy" />
      <small>For example: system, subsector, sector, hexes, or people.</small>
    </label>
    <label class="mk-fld">
      <span>Description</span>
      <textarea v-model="marketUi.description" class="mk-box" rows="3" :maxlength="MARKET_LIMITS.description" :disabled="marketUi.busy"></textarea>
      <small>{{ marketUi.description.length.toLocaleString('en-US') }} of 2,000 characters</small>
    </label>
    <label class="mk-fld">
      <span>Tags</span>
      <input v-model="marketUi.tags" class="mk-box" type="text" autocomplete="off" placeholder="Separate tags with commas" :disabled="marketUi.busy" />
      <small>{{ tags.length }} of {{ MARKET_LIMITS.tags }} tags</small>
    </label>
    <CoverEditor
      :src="coverSrc"
      :source="coverDraft ? 'upload' : 'default'"
      :can-remove="!!coverDraft"
      :busy="marketUi.busy"
      :title="marketUi.title.trim() || 'this package'"
      @take="takeCover"
      @remove="coverDraft = null"
    />
    <p v-for="item in fieldProblems" :key="item.field" class="mk-err" role="alert">{{ item.text }}</p>
  </template>
  <dl v-else-if="target" class="mk-kv">
    <dt>Title</dt><dd>{{ target.title }}</dd>
    <dt>Kind</dt><dd>{{ target.kind }}</dd>
    <dt>Latest version</dt><dd>{{ target.latestVersion }} · {{ sizeWords(target.hexCount) }}</dd>
    <dt>Cover</dt><dd>To change it, open the package's page.</dd>
  </dl>
</template>

<style>
.mk-form > .ui-heading {
  margin-top: 0;
}

.mk-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
}

.mk-fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.mk-fld small {
  font-weight: 400;
  font-size: 11.5px;
}

.mk-fld small.is-full {
  color: var(--attention);
}

.mk-box {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.35 var(--font-text);
}

textarea.mk-box {
  resize: vertical;
}

.mk-kv {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 14px;
  margin: 0;
}

.mk-kv dt {
  color: var(--text-muted);
}

.mk-kv dd {
  margin: 0;
  color: var(--text-0);
}

.mk-recs {
  margin: 0;
  padding: 6px 10px 8px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
}

.mk-recs legend {
  padding: 0 4px;
  color: var(--text-muted);
  font-size: 12px;
}

.mk-recs label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  color: var(--text-0);
}

.mk-recs small {
  margin-left: auto;
  color: var(--text-muted);
  text-transform: capitalize;
}

.mk-note {
  margin: 0;
  padding: 8px 10px;
  border-left: 3px solid var(--attention);
  background: var(--bg-2);
  color: var(--text-0);
}

.mk-err {
  margin: 0;
  padding: 8px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-2);
  color: var(--text-1);
}

.mk-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
