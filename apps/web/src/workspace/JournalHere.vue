<script setup lang="ts">
/**
 * "Your journal here" in a dossier (manifesto: Connected): the journal entries that mention
 * this system or are set at it, latest in-fiction date first, each a link to its entry. Hidden
 * when there are none, and when signed out or while the campaign is not open. It reads the
 * campaign already in memory and never fetches. RecordsHere mounts it under the records.
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session } from '../account/session.ts';
import { entriesAtHex, entriesByDate, entriesMentioning } from '../campaign/journal.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { atPane } from '../shell/pane.ts';
import { hexJournalRows, hexTarget, whyWords } from './hex_journal.ts';
import { shownMentions } from './record_links.ts';

const props = defineProps<{
    hexKey: string;
    /** A world's page: the heading says the system, not the world. */
    onWorld: boolean;
}>();

const router = useRouter();
const route = useRoute();
/** "Show all" was pressed. */
const all = ref(false);

function nameOf(target: string): string | null {
    const found = campaign.records[target];
    return found && !found.deleted ? found.name : null;
}

const rows = computed(() => {
    if (!session.user || campaign.status !== 'ready') return [];
    void campaign.seq;
    const mentioning = new Set(entriesMentioning(hexTarget(props.hexKey)).map((entry) => entry.id));
    const here = new Set(entriesAtHex(props.hexKey).map((entry) => entry.id));
    if (!mentioning.size && !here.size) return [];
    return hexJournalRows(entriesByDate(), mentioning, here, nameOf);
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

watch(() => props.hexKey, () => { all.value = false; });
</script>

<template>
  <section v-if="rows.length" class="here jh">
    <div class="here-head">
      <h3 class="ui-heading ui-kicker">{{ onWorld ? 'Your journal in this system' : 'Your journal here' }} <span class="ui-count">{{ rows.length }}</span></h3>
    </div>
    <ul class="here-rows">
      <li v-for="row in shown.rows" :key="row.id">
        <a class="here-row jh-row" :href="href(row.id)" @click.prevent="open(row.id)">
          <span class="here-glyph" aria-hidden="true"><Icon :name="row.icon" :size="13" /></span>
          <span class="here-text">
            <b>{{ row.title }}</b>
            <small>{{ row.kindWord }} · {{ whyWords(row.why) }}<template v-if="!row.date"> · No date</template></small>
          </span>
          <span v-if="row.date" class="ui-date">{{ row.date }}</span>
        </a>
      </li>
    </ul>
    <button v-if="shown.hidden" type="button" class="jh-more" @click="all = true">
      Show all {{ rows.length }}
    </button>
  </section>
</template>

<style>
.here-row.jh-row {
  text-decoration: none;
}

.jh-more {
  margin: 6px 0 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 500 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.jh-more:hover {
  color: var(--text-0);
}
</style>
