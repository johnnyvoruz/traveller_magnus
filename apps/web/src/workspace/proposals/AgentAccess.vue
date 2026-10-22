<script setup lang="ts">
/**
 * Agent access on the account page (spec_session_ingest.md §2.1, SI3): the account's tokens and
 * Make a token. While the server answers that agent access is paused, the section says so and how
 * to bring in a session without a token (Copy for your AI, then paste the reply).
 */
import { computed, onMounted, ref } from 'vue';
import { revokeToken } from '../../account/tokens.ts';
import { listCampaigns } from '../../campaign/store.ts';
import { showToast } from '../../shell/toast.ts';
import { readAccess, tokenLive, type AccessState } from './agent_access.ts';
import TokenList from './TokenList.vue';
import TokenMake from './TokenMake.vue';

const state = ref<AccessState | null>(null);
const campaigns = ref<{ id: string; name: string }[]>([]);
const busy = ref<string | null>(null);
const making = ref(false);
const stamp = ref(Date.now());

const live = computed(() => (state.value && state.value.kind === 'on' ? state.value.items.filter((row) => tokenLive(row, stamp.value)).length : 0));

function campaignName(id: string | null): string {
    if (!id) return 'Every campaign';
    const row = campaigns.value.find((item) => item.id === id);
    return row ? row.name : 'A campaign no longer here';
}

async function load(): Promise<void> {
    state.value = await readAccess();
    stamp.value = Date.now();
}

async function revoke(id: string): Promise<void> {
    if (busy.value) return;
    busy.value = id;
    const ok = await revokeToken(id);
    busy.value = null;
    showToast(ok ? 'Token revoked. It stops working on its next request.' : 'The token could not be revoked. Try again.');
    await load();
}

/** A new token is in the list at once; its text stays on screen until Done. */
async function onMade(): Promise<void> {
    await load();
}

onMounted(async () => {
    const [list] = await Promise.all([listCampaigns(), load()]);
    campaigns.value = (list ?? []).map((row) => ({ id: row.id, name: row.name }));
});
</script>

<template>
  <section class="pk-card" aria-labelledby="pk-agent-h" data-account="agent-access">
    <h2 id="pk-agent-h" class="pk-h2">Agent access</h2>
    <p class="pk-quiet">A token lets your own AI read one campaign and send proposals to it. Proposals wait in the Campaign panel until you accept them.</p>
    <p v-if="!state" class="pk-quiet" role="status">Loading…</p>
    <p v-else-if="state.kind !== 'on'" class="pk-note" role="status" data-agent-off>{{ state.message }}</p>
    <template v-else>
      <TokenList :items="state.items" :campaign-name="campaignName" :busy="busy" :now="stamp" @revoke="revoke" />
      <p v-if="!state.items.length && !making" class="pk-quiet">You have no tokens.</p>
      <TokenMake v-if="making" :campaigns="campaigns" @made="onMade" @done="making = false" />
      <div v-else class="pk-acts">
        <button type="button" class="ui-btn" :disabled="live >= 10 || !campaigns.length" data-token-new @click="making = true">Make a token</button>
        <span v-if="live >= 10" class="pk-quiet">An account holds at most 10 live tokens.</span>
      </div>
    </template>
  </section>
</template>
