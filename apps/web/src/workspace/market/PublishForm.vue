<script setup lang="ts">
/**
 * Publish selection (findings/marketplace_screens_design.md §2; mockups km_form, km_version,
 * km_limits, km_uncharted). Shown in the Build pane in place of its acts while it is open:
 * what goes in is what is selected. A new package, or a new version of one of yours.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { hexState, placeNames } from '../build/acts.ts';
import { buildStore } from '../build/seam.ts';
import { draftHandle, edit } from '../build/edit.ts';
import { build } from '../build/state.ts';
import {
    closePublish, formProblems, hexWords, MARKET_LIMITS, marketStore, marketUi, parseTags, plural, publish, publishKeys, recordsOn, removedWords,
} from './market.ts';

const props = defineProps<{ keys: string[] }>();

const router = useRouter();
const store = marketStore();
const root = ref<HTMLElement | null>(null);

const universe = computed(() => {
    const open = buildStore();
    return open ? open.universe() : null;
});
const hexes = computed(() => publishKeys(props.keys, hexState));
const records = computed(() => recordsOn(hexes.value));
const chosen = computed(() => records.value.filter((item) => !marketUi.left.includes(item.id)));
const mine = computed(() => { void store.tick(); return store.listings(); });
const target = computed(() => (marketUi.target === 'new' ? null : mine.value.find((item) => item.id === marketUi.target) ?? null));
const isNew = computed(() => marketUi.target === 'new' || !target.value);
const tags = computed(() => parseTags(marketUi.tags));
const summary = computed(() => hexWords(hexes.value, (slug) => placeNames(slug + '/0101').sector || slug) + ' · ' + plural(chosen.value.length, 'record', 'records'));
const removed = computed(() => removedWords(hexes.value, hexState));
const problems = computed(() => formProblems({
    isNew: isNew.value,
    title: marketUi.title,
    kind: marketUi.kind,
    description: marketUi.description,
    tags: tags.value,
    hexes: hexes.value.length,
    records: chosen.value.length,
}));
const selectionProblems = computed(() => problems.value.filter((item) => item.field === 'hexes' || item.field === 'records'));
/** A missing title or kind is said once Publish is tried; a limit passed is said at once. */
const tried = ref(false);
const fieldProblems = computed(() => problems.value.filter((item) => item.field !== 'hexes' && item.field !== 'records' && (tried.value || item.field === 'description' || item.field === 'tags')));
const nextVersion = computed(() => (target.value ? target.value.latestVersion + 1 : 1));
const sendLabel = computed(() => (marketUi.busy ? 'Publishing…' : isNew.value ? 'Publish' : 'Publish version ' + nextVersion.value));

function problem(field: string): string {
    const found = problems.value.find((item) => item.field === field);
    return found ? found.text : '';
}

function toggle(id: string, on: boolean): void {
    marketUi.left = on ? marketUi.left.filter((item) => item !== id) : [...marketUi.left, id];
}

async function send(): Promise<void> {
    const open = universe.value;
    if (!open || marketUi.busy) return;
    tried.value = true;
    if (problems.value.length) return;
    const path = await publish({ id: open.id, truthVersion: open.truthVersion }, hexes.value, chosen.value.map((item) => item.id));
    if (path) void router.push(path);
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePublish();
    }
}

onMounted(() => {
    void nextTick(() => {
        const first = root.value ? root.value.querySelector<HTMLElement>('select, input, button') : null;
        if (first) first.focus();
    });
});

// Opened on one system, the form belongs to it: another hex, or none, closes it (what was typed stays for next time).
// Many hexes follow the selection as before.
watch(() => (props.keys.length === 1 ? props.keys[0] : null), (now, was) => {
    if (was !== null && now !== was) closePublish();
});
// A draft or a preview opened meanwhile (E, G) takes the pane: what is published is what is kept.
watch(() => draftHandle.value !== null || edit.opening || build.preview !== null, (taken) => {
    if (taken) closePublish();
});
onBeforeUnmount(() => {
    if (props.keys.length === 1) closePublish();
});
</script>

<template>
  <section ref="root" class="mk-form" aria-label="Publish selection" @keydown="onKey">
    <h3 class="ui-heading">Publish selection</h3>
    <form class="mk-fields" @submit.prevent="send">
      <p class="mk-sum"><b>{{ summary }}</b><span v-if="removed">{{ removed }}</span></p>
      <p v-for="item in selectionProblems" :key="item.text" class="mk-err" role="alert">{{ item.text }}</p>

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
          <small>For example: system, subsector, sector, or hexes.</small>
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
        <p v-for="item in fieldProblems" :key="item.field" class="mk-err" role="alert">{{ item.text }}</p>
      </template>
      <dl v-else-if="target" class="mk-kv">
        <dt>Title</dt><dd>{{ target.title }}</dd>
        <dt>Kind</dt><dd>{{ target.kind }}</dd>
        <dt>Latest version</dt><dd>{{ target.latestVersion }} · {{ plural(target.hexCount, 'hex', 'hexes') }}</dd>
      </dl>

      <fieldset v-if="records.length" class="mk-recs">
        <legend>Records on these hexes <b>{{ chosen.length }} of {{ records.length }}</b></legend>
        <label v-for="item in records" :key="item.id">
          <input type="checkbox" :checked="!marketUi.left.includes(item.id)" :disabled="marketUi.busy" @change="toggle(item.id, ($event.target as HTMLInputElement).checked)" />
          <span>{{ item.name }}</span><small>{{ item.type }}</small>
        </label>
      </fieldset>
      <p v-else class="build-fine">No campaign records are on these hexes.</p>

      <p class="mk-note">A published package is a snapshot of these hexes and records as they are now. Anyone who has its address can read it.</p>
      <p class="build-fine">A package holds up to 1,280 hexes and 500 records. Titles are up to 80 characters. Use up to 32 tags, each up to 40 characters.</p>
      <p v-if="marketUi.error" class="mk-err" role="alert">{{ marketUi.error }}</p>
      <div class="mk-acts">
        <button type="submit" class="ui-btn is-primary" data-market-publish :disabled="selectionProblems.length > 0 || marketUi.busy" :aria-busy="marketUi.busy ? 'true' : undefined">{{ sendLabel }}</button>
        <button type="button" class="ui-btn" :disabled="marketUi.busy" @click="closePublish()">Cancel</button>
      </div>
    </form>
  </section>
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

.mk-sum span {
  display: block;
  margin-top: 4px;
  color: var(--text-1);
}

.mk-sum {
  margin: 0;
  padding: 8px 10px;
  border-left: 3px solid var(--signal);
  background: var(--bg-2);
  color: var(--text-0);
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
