<script setup lang="ts">
/**
 * Make an agent token (SI3): a name, the one campaign it reaches, what it may do, and how long it
 * works. The token text shows once, here, with Copy; it is never shown again.
 */
import { computed, nextTick, ref } from 'vue';
import type { AccessScope } from '@voyage/shared';
import { makeToken } from '../../account/tokens.ts';
import { writeClipboard } from '../../platform/browser.ts';
import { showToast } from '../../shell/toast.ts';

const props = defineProps<{ campaigns: readonly { id: string; name: string }[] }>();
const emit = defineEmits<{ made: []; done: [] }>();

const DAYS = [30, 90, 365] as const;
const name = ref('');
const universeId = ref(props.campaigns.length === 1 ? props.campaigns[0].id : '');
const read = ref(true);
const send = ref(true);
const days = ref<number>(90);
const busy = ref(false);
const error = ref('');
const made = ref<{ token: string; name: string } | null>(null);
const tokenEl = ref<HTMLElement | null>(null);

const ready = computed(() => name.value.trim().length > 0 && universeId.value !== '' && (read.value || send.value));

async function make(): Promise<void> {
    if (!ready.value || busy.value) return;
    busy.value = true;
    error.value = '';
    const scopes: AccessScope[] = [];
    if (read.value) scopes.push('campaign:read');
    if (send.value) scopes.push('proposals:write');
    const answer = await makeToken({ name: name.value.trim(), scopes, universeId: universeId.value, expiresInDays: days.value });
    busy.value = false;
    if (!answer) {
        error.value = 'The token could not be made. An account holds at most 10 live tokens; revoke one you no longer use, then try again.';
        return;
    }
    made.value = { token: answer.token, name: answer.row.name };
    name.value = '';
    emit('made');
    void nextTick(() => { if (tokenEl.value) tokenEl.value.focus(); });
}

async function copy(): Promise<void> {
    if (!made.value) return;
    try {
        await writeClipboard(made.value.token);
        showToast('Token copied.');
    } catch {
        showToast('Select the token and copy it.');
    }
}
</script>

<template>
  <div v-if="made" class="tok-once" role="region" aria-label="Your new token" data-token-once>
    <p class="tok-once-h"><b>{{ made.name }}</b>: copy this token now. You won't see it again.</p>
    <code ref="tokenEl" class="tok-text" tabindex="0" data-token-text>{{ made.token }}</code>
    <div class="pk-acts">
      <button type="button" class="ui-btn is-primary" @click="copy">Copy</button>
      <button type="button" class="ui-btn" data-token-done @click="made = null; emit('done')">Done</button>
    </div>
    <p class="pk-note">Give it to your AI as <code>VOYAGE_TOKEN</code>; never paste it into a chat. If this token leaks, revoke it here. It can read this campaign, referee notes included, and send proposals. It cannot change anything without you.</p>
  </div>
  <form v-else class="pk-form tok-form" data-token-make @submit.prevent="make">
    <label class="pk-field">
      <span>Name</span>
      <input v-model="name" type="text" maxlength="60" placeholder="My laptop" data-token-name />
    </label>
    <label class="pk-field">
      <span>Campaign</span>
      <select v-model="universeId" data-token-campaign>
        <option value="" disabled>Choose a campaign</option>
        <option v-for="row in campaigns" :key="row.id" :value="row.id">{{ row.name }}</option>
      </select>
    </label>
    <fieldset class="tok-scopes">
      <legend>It can</legend>
      <label class="pk-check"><input v-model="read" type="checkbox" /> Read the campaign</label>
      <label class="pk-check"><input v-model="send" type="checkbox" /> Send proposals for you to review</label>
    </fieldset>
    <label class="pk-field">
      <span>Works for</span>
      <select v-model.number="days" data-token-days>
        <option v-for="d in DAYS" :key="d" :value="d">{{ d }} days</option>
      </select>
    </label>
    <p v-if="error" class="pk-alert" role="alert">{{ error }}</p>
    <div class="pk-acts">
      <button type="button" class="ui-btn" @click="emit('done')">Cancel</button>
      <button type="submit" class="ui-btn is-primary" :disabled="!ready || busy" data-token-go>{{ busy ? 'Making…' : 'Make a token' }}</button>
    </div>
  </form>
</template>

<style>
.tok-form select,
.tok-form input[type="text"] {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 400 14px/1.3 var(--font-text);
}

.tok-scopes {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}

.tok-scopes legend {
  margin-bottom: 4px;
  padding: 0;
  color: var(--text-muted);
  font: 500 12.5px/1.3 var(--font-text);
}

.tok-once {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  background: var(--wash-faint);
}

.tok-once-h {
  margin: 0;
}

.tok-text {
  display: block;
  padding: 8px 10px;
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--signal);
  font: 400 13px/1.4 var(--font-code);
  overflow-wrap: anywhere;
  user-select: all;
}
</style>
