<script setup lang="ts">
/**
 * The account's agent tokens (SI3): name, campaign, what it may do, made, last used, and when it
 * stops working; Revoke on a live one. Never the token text: only its first characters.
 */
import type { AccessTokenList } from '@voyage/shared';
import { stampWords } from './proposal_words.ts';
import { scopeWords, tokenLive } from './agent_access.ts';

type TokenRow = ReturnType<typeof AccessTokenList.parse>['items'][number];

defineProps<{
    items: readonly TokenRow[];
    campaignName: (id: string | null) => string;
    busy: string | null;
    now: number;
}>();
const emit = defineEmits<{ revoke: [id: string] }>();
</script>

<template>
  <ul v-if="items.length" class="pk-rows tok-rows" data-token-list>
    <li v-for="row in items" :key="row.id" class="pk-row" :class="{ 'is-off': !tokenLive(row, now) }" :data-token="row.id">
      <div class="pk-row-main">
        <b>{{ row.name }}</b>
        <span class="pk-quiet">{{ campaignName(row.universeId) }} · {{ scopeWords(row.scopes) }}</span>
        <span class="pk-quiet tok-meta">
          <code class="tok-prefix">{{ row.prefix }}…</code>
          Made {{ stampWords(row.createdAt) }} ·
          {{ row.lastUsedAt ? 'last used ' + stampWords(row.lastUsedAt) : 'never used' }} ·
          <template v-if="row.revokedAt">revoked {{ stampWords(row.revokedAt) }}</template>
          <template v-else-if="!tokenLive(row, now)">stopped working {{ stampWords(row.expiresAt) }}</template>
          <template v-else>works until {{ stampWords(row.expiresAt) }}</template>
        </span>
      </div>
      <div v-if="tokenLive(row, now)" class="pk-acts">
        <button type="button" class="ui-btn" :disabled="busy !== null" data-token-revoke @click="emit('revoke', row.id)">{{ busy === row.id ? 'Revoking…' : 'Revoke' }}</button>
      </div>
    </li>
  </ul>
</template>

<style>
.tok-rows .pk-row.is-off .pk-row-main b {
  color: var(--text-muted);
}

.tok-meta {
  font-size: 12px;
}

.tok-prefix {
  margin-right: 4px;
  font: 400 11.5px/1.4 var(--font-code);
}
</style>
