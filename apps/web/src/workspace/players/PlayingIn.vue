<script setup lang="ts">
/**
 * "Playing in" (players_build_plan.md P5; streams/D.md P5): the campaigns this account plays in,
 * under the account's own in the Campaigns panel. Each card names the campaign and its referee;
 * Open reads it as a player and shows its records. Nothing shows for an account that plays in none.
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadPlaying, openPlaying } from '../../campaign/membership.ts';
import { campaign } from '../../campaign/store.ts';
import Icon from '../../design/Icon.vue';
import { atPane } from '../../shell/pane.ts';
import { showToast } from '../../shell/toast.ts';

const route = useRoute();
const router = useRouter();
const busy = ref<string | null>(null);

async function open(id: string): Promise<void> {
    if (busy.value) return;
    if (id !== campaign.universeId) {
        busy.value = id;
        try {
            await openPlaying(id);
        } catch {
            showToast('That campaign could not be opened. Try again.');
            return;
        } finally {
            busy.value = null;
        }
    }
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: null }));
}

onMounted(() => { void loadPlaying(); });
</script>

<template>
  <section v-if="campaign.playing.length" class="cps-playing" data-playing-in aria-labelledby="cps-playing-h">
    <h3 id="cps-playing-h" class="ui-heading ui-kicker">Playing in <span class="ui-count">{{ campaign.playing.length }}</span></h3>
    <ul class="cps-list">
      <li v-for="item in campaign.playing" :key="item.id">
        <article class="cps-card ui-frame" :class="{ 'is-open': item.id === campaign.universeId }" :aria-labelledby="'cps-p-' + item.id" :data-playing="item.id">
          <div class="cps-head">
            <h3 :id="'cps-p-' + item.id" class="cps-name" tabindex="-1">{{ item.name }}</h3>
            <span v-if="item.id === campaign.universeId" class="ui-chip cps-open">Open</span>
          </div>
          <p class="cps-facts">Run by {{ item.ownerHandle }}</p>
          <div class="cps-acts">
            <button type="button" class="ui-btn" :class="{ 'is-primary': item.id === campaign.universeId }" :disabled="busy !== null" data-playing-open @click="open(item.id)">
              <Icon name="book-sparkles" :size="13" />{{ item.id === campaign.universeId ? 'Show records' : busy === item.id ? 'Opening…' : 'Open' }}
            </button>
          </div>
        </article>
      </li>
    </ul>
  </section>
</template>

<style>
.cps-playing {
  margin-top: 18px;
}

.cps-playing > .ui-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
}
</style>
