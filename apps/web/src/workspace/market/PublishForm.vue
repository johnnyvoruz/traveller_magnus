<script setup lang="ts">
/**
 * Publish selection (findings/marketplace_screens_design.md §2; mockups km_form, km_version,
 * km_limits, km_uncharted). Shown in the Build pane in place of its acts while it is open:
 * what goes in is what is selected. A new package, or a new version of one of yours. The
 * package's fields are PublishFields, shared with Publish records (RecordsPublish.vue).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { hexState, placeNames } from '../build/acts.ts';
import { buildStore } from '../build/seam.ts';
import { draftHandle, edit } from '../build/edit.ts';
import { build } from '../build/state.ts';
import {
    closePublish, formProblems, hexWords, marketUi, parseTags, plural, publish, publishKeys, recordsOn, REFEREE_ONLY_NOTE, refereeOnly, removedWords, usePublishTarget,
} from './market.ts';
import PublishFields from './PublishFields.vue';

const props = defineProps<{ keys: string[] }>();

const router = useRouter();
const root = ref<HTMLElement | null>(null);

const universe = computed(() => {
    const open = buildStore();
    return open ? open.universe() : null;
});
const hexes = computed(() => publishKeys(props.keys, hexState));
const records = computed(() => recordsOn(hexes.value));
const chosen = computed(() => records.value.filter((item) => !marketUi.left.includes(item.id)));
const { target, isNew } = usePublishTarget();
const summary = computed(() => hexWords(hexes.value, (slug) => placeNames(slug + '/0101').sector || slug) + ' · ' + plural(chosen.value.length, 'record', 'records'));
const removed = computed(() => removedWords(hexes.value, hexState));
const problems = computed(() => formProblems({
    isNew: isNew.value,
    title: marketUi.title,
    kind: marketUi.kind,
    description: marketUi.description,
    tags: parseTags(marketUi.tags),
    hexes: hexes.value.length,
    records: chosen.value.length,
}));
const selectionProblems = computed(() => problems.value.filter((item) => item.field === 'hexes' || item.field === 'records'));
/** A missing title or kind is said once Publish is tried. */
const tried = ref(false);
const nextVersion = computed(() => (target.value ? target.value.latestVersion + 1 : 1));
const sendLabel = computed(() => (marketUi.busy ? 'Publishing…' : isNew.value ? 'Publish' : 'Publish version ' + nextVersion.value));

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

      <PublishFields :problems="problems" :tried="tried" />

      <fieldset v-if="records.length" class="mk-recs">
        <legend>Records on these hexes <b>{{ chosen.length }} of {{ records.length }}</b></legend>
        <label v-for="item in records" :key="item.id">
          <input type="checkbox" :checked="!marketUi.left.includes(item.id)" :disabled="marketUi.busy" @change="toggle(item.id, ($event.target as HTMLInputElement).checked)" />
          <span>{{ item.name }}</span><small>{{ item.type }}</small>
          <em v-if="!marketUi.left.includes(item.id) && refereeOnly(item.id)" class="mk-rec-note" data-referee-only>{{ REFEREE_ONLY_NOTE }}</em>
        </label>
      </fieldset>
      <p v-else class="mk-fine">No campaign records are on these hexes.</p>

      <p class="mk-note">A published package is a snapshot of these hexes and records as they are now. Anyone who has its address can read it.</p>
      <p class="mk-fine">A package holds up to 1,280 hexes and 500 records. Titles are up to 80 characters. Use up to 32 tags, each up to 40 characters.</p>
      <p v-if="marketUi.error" class="mk-err" role="alert">{{ marketUi.error }}</p>
      <div class="mk-acts">
        <button type="submit" class="ui-btn is-primary" data-market-publish :disabled="selectionProblems.length > 0 || marketUi.busy" :aria-busy="marketUi.busy ? 'true' : undefined">{{ sendLabel }}</button>
        <button type="button" class="ui-btn" :disabled="marketUi.busy" @click="closePublish()">Cancel</button>
      </div>
    </form>
  </section>
</template>
