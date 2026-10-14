<script setup lang="ts">
/**
 * A campaign's imports (contracts/b_marketplace.md F3, F14): title, version, in place or
 * placed, "Update available" with Update (the same preview, its placement kept), and Remove,
 * a plain delete confirmed in the app modal. There is no undo.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { session } from '../../account/session.ts';
import { campaign, listCampaigns } from '../../campaign/store.ts';
import { marketWire, type InstallRow } from '../../marketplace/catalogue.ts';
import MarketAsk from './MarketAsk.vue';
import { placementWords, plural, removeWords } from './place.ts';

const wire = marketWire();
const universeId = ref(campaign.universeId ?? '');
const rows = ref<InstallRow[]>([]);
const loading = ref(false);
const error = ref('');
const asking = ref<InstallRow | null>(null);
const busy = ref(false);
const askError = ref('');
const said = ref('');

const mine = computed(() => campaign.universes.filter((item) => session.user && item.ownerId === session.user.id));

async function load(): Promise<void> {
    if (!universeId.value) return;
    loading.value = true;
    error.value = '';
    try {
        rows.value = await wire.installs(universeId.value);
    } catch (err) {
        rows.value = [];
        error.value = err instanceof Error && err.message ? err.message : 'The imports could not be loaded. Try again.';
    } finally {
        loading.value = false;
    }
}

function updatePath(row: InstallRow): string {
    return '/packages/' + encodeURIComponent(row.packageId) + '?import=' + encodeURIComponent(universeId.value) + '&update=' + encodeURIComponent(row.installId);
}

async function remove(): Promise<void> {
    const row = asking.value;
    if (!row || busy.value) return;
    busy.value = true;
    askError.value = '';
    try {
        const done = await wire.remove(universeId.value, row.installId);
        asking.value = null;
        said.value = 'Removed ' + row.title + ': ' + plural(done.hexes, 'hex', 'hexes') + ', ' + plural(done.records, 'record', 'records') + '.';
        await load();
    } catch (err) {
        askError.value = err instanceof Error && err.message ? err.message : 'The import could not be removed. Try again.';
    } finally {
        busy.value = false;
    }
}

watch(universeId, () => { said.value = ''; void load(); });

onMounted(async () => {
    if (!campaign.universes.length) await listCampaigns();
    if (!universeId.value && mine.value.length) universeId.value = mine.value[0]!.id;
    else void load();
});
</script>

<template>
  <section class="mk-ins" aria-label="Imports">
    <div class="mk-ins-bar">
      <h2 class="ui-heading">Imports</h2>
      <select v-if="mine.length" v-model="universeId" class="mk-box mk-ins-pick" aria-label="Campaign">
        <option v-for="item in mine" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </div>
    <p v-if="said" class="mk-status" role="status">{{ said }}</p>
    <p v-if="error" class="mk-err" role="alert">{{ error }}</p>
    <p v-if="!mine.length" class="build-fine">You have no campaign yet.</p>
    <p v-else-if="!loading && !rows.length && !error" class="build-fine">Nothing is imported into this campaign.</p>
    <ul v-else class="mk-ins-list">
      <li v-for="row in rows" :key="row.installId">
        <div class="mk-ins-what">
          <RouterLink :to="'/packages/' + encodeURIComponent(row.packageId)"><b>{{ row.title }}</b></RouterLink>
          <small>Version {{ row.version }} &middot; {{ placementWords(row) }} &middot; {{ plural(row.hexCount, 'hex', 'hexes') }}</small>
        </div>
        <span v-if="row.updateAvailable" class="mk-st" data-state="done">Update available</span>
        <RouterLink v-if="row.updateAvailable" class="ui-btn" :to="updatePath(row)">Update</RouterLink>
        <button type="button" class="ui-btn" @click="asking = row; askError = ''">Remove</button>
      </li>
    </ul>
    <MarketAsk
      v-if="asking"
      :title="'Remove ' + asking.title"
      :text="removeWords(asking, asking.recordCount)"
      confirm="Remove"
      danger
      :busy="busy"
      :error="askError"
      @confirm="remove()"
      @cancel="asking = null"
    />
  </section>
</template>

<style>
.mk-ins {
  margin-top: 22px;
}

.mk-ins-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mk-ins-pick {
  width: auto;
  min-width: 180px;
}

.mk-ins-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.mk-ins-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line-soft);
}

.mk-ins-what {
  display: flex;
  flex: 1 1 220px;
  flex-direction: column;
}

.mk-ins-what a {
  color: var(--text-0);
}

.mk-ins-what small {
  color: var(--text-muted);
}

.mk-ins .ui-btn {
  text-decoration: none;
}
</style>