<script setup lang="ts">
/**
 * "Mentioned in" on a record page (manifesto: Connected): the journal entries whose stored
 * mentions hold this record, latest in-fiction date first and undated last, each a link to
 * its entry. Hidden when there are none. The workspace is the referee's and its journal list
 * shows every entry, so this lists every entry too: there is no player view to filter for.
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { entriesMentioning } from '../campaign/journal.ts';
import { campaign } from '../campaign/store.ts';
import { atPane } from '../shell/pane.ts';
import RecordAvatar from './RecordAvatar.vue';
import { mentionRows, shownMentions } from './record_links.ts';

const props = defineProps<{
    id: string;
}>();

const router = useRouter();
const route = useRoute();
/** "Show all" was pressed: every mentioning entry is listed. */
const all = ref(false);

function nameOf(target: string): string | null {
    const found = campaign.records[target];
    return found && !found.deleted ? found.name : null;
}

const rows = computed(() => {
    void campaign.seq;
    return mentionRows(entriesMentioning(props.id), nameOf);
});
const shown = computed(() => shownMentions(rows.value, all.value));

function target(entryId: string): { path: string; query: Record<string, string> } {
    return atPane(route.path, route.query, { kind: 'journal', entry: entryId });
}

function href(entryId: string): string {
    return router.resolve(target(entryId)).href;
}

function open(entryId: string): void {
    void router.push(target(entryId));
}

watch(() => props.id, () => { all.value = false; });
</script>

<template>
  <section v-if="rows.length" class="rln rln-mentions">
    <h3 class="ui-heading ui-kicker">Mentioned in <span class="ui-count">{{ rows.length }}</span></h3>
    <ul class="rln-rows">
      <li v-for="row in shown.rows" :key="row.id">
        <a class="camp-row rln-row" :href="href(row.id)" @click.prevent="open(row.id)">
          <RecordAvatar :record="{ name: row.title, type: 'note', images: row.images }" :universe-id="campaign.universeId" size="row" :icon="row.icon" />
          <span class="camp-row-text">
            <b>{{ row.title }}</b>
            <span class="camp-row-meta">{{ row.kindWord }}<template v-if="!row.date"> · No date</template></span>
          </span>
          <span v-if="row.date" class="ui-date">{{ row.date }}</span>
        </a>
      </li>
    </ul>
    <button v-if="shown.hidden" type="button" class="rln-more" @click="all = true">
      Show all {{ rows.length }}
    </button>
  </section>
</template>

<style>
.rln-rows {
  margin: 0;
  padding: 0;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  list-style: none;
  overflow: hidden;
}

.rln-rows li + li {
  border-top: 1px solid var(--line-1);
}

.camp-row.rln-row {
  text-decoration: none;
}

.rln-more {
  margin: 6px 0 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 500 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.rln-more:hover {
  color: var(--text-0);
}
</style>
