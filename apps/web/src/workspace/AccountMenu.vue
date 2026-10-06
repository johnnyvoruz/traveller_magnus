<script setup lang="ts">
/**
 * The pop-up at the rail's foot (design §1; K5f). Signed out it is the sign-in card; signed
 * in it is the account menu: who, the campaigns (open one, switch to another, make, rename,
 * delete, export, import), the party, sign out. It opens over the map and nothing waits on
 * it; a click anywhere else, or Esc, closes it and focus goes back to the rail's button. A
 * delete asks once, in a dialog of its own here (the server's delete is soft and cannot be
 * undone). Export saves the campaign's file; Import reads one into an open, empty campaign
 * through campaign/import.ts, whose words are shown as given.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import { session, signOut } from '../account/session.ts';
import { resetCampaign } from '../campaign/commit.ts';
import { importCampaign, parseExport } from '../campaign/import.ts';
import { campaign, createCampaign, deleteCampaign, renameCampaign, switchCampaign } from '../campaign/store.ts';
import { apiFetch } from '../platform/http.ts';
import { saveBlob } from '../platform/browser.ts';
import Icon from '../design/Icon.vue';
import { showToast } from '../shell/toast.ts';
import { accountLine, displayName, initials } from './account.ts';
import { forgetDeleted } from './actions.ts';
import { CAMPAIGN_CAP, canCreate, cleanCampaignName, deleteWords, freshName, sortCampaigns } from './campaigns.ts';
import { stopLocate } from './locate.ts';
import { forgetOpening, retryCampaign } from './opening.ts';
import { liveRecords } from './records.ts';
import SignInCard from './SignInCard.vue';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
    close: [];
    /** Open the Campaign panel. */
    campaign: [];
}>();

const route = useRoute();
const router = useRouter();
const card = ref<{ focus: () => void } | null>(null);
const menu = ref<HTMLElement | null>(null);
const pop = ref<HTMLElement | null>(null);
const leaving = ref(false);

// ---- The campaigns ---------------------------------------------------------------

/** What the pop-up shows instead of the menu: a name for a new campaign, a new name, or the delete's question. */
const mode = ref<'' | 'new' | 'rename' | 'delete'>('');
const draft = ref('');
const busy = ref(false);
const trouble = ref('');

const campaigns = computed(() => sortCampaigns(campaign.universes));
const openOne = computed(() => campaign.universes.find((item) => item.id === campaign.universeId) ?? null);
const ready = computed(() => campaign.status === 'ready' || campaign.status === 'error');
const full = computed(() => !canCreate(campaign.universes.length));
const recordCount = computed(() => liveRecords(campaign.records).length);
/** Import takes an open campaign with no records and no links (campaign/import.ts says so too). */
const emptyCampaign = computed(() => Object.keys(campaign.records).length === 0 && Object.keys(campaign.links).length === 0);
const fileEl = ref<HTMLInputElement | null>(null);
const question = computed(() => (openOne.value ? deleteWords(openOne.value.name, recordCount.value) : ''));

function focusField(): void {
    void nextTick(() => {
        const el = pop.value ? pop.value.querySelector<HTMLElement>('.account-form input, .account-form .is-primary') : null;
        if (el) el.focus();
    });
}

function begin(next: 'new' | 'rename' | 'delete'): void {
    trouble.value = '';
    draft.value = next === 'new' ? freshName(campaign.universes.map((item) => item.name)) : next === 'rename' && openOne.value ? openOne.value.name : '';
    mode.value = next;
    focusField();
}

function back(): void {
    mode.value = '';
    trouble.value = '';
    void nextTick(focusFirst);
}

/** Another campaign is open now: what belonged to the last one is let go, and the panel shows the list. */
function changed(): void {
    forgetDeleted();
    stopLocate();
    if (route.path.startsWith('/campaign/')) void router.push({ path: '/campaign', query: route.query });
}

async function run(work: () => Promise<void>, then: () => void): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    trouble.value = '';
    try {
        await work();
        if (campaign.status === 'error') {
            // The store marks the whole campaign in error when a list call fails; the open one is read back so the panel stands.
            trouble.value = 'That could not be done. Try again.';
            void retryCampaign();
            return;
        }
        then();
    } catch {
        trouble.value = 'That could not be done. Try again.';
    } finally {
        busy.value = false;
    }
}

/** The campaign pressed: the open one shows its panel; another is switched to, then shown. */
function pick(id: string): void {
    if (id === campaign.universeId) {
        emit('campaign');
        return;
    }
    void run(() => switchCampaign(id), () => {
        changed();
        emit('campaign');
    });
}

function create(): void {
    const name = cleanCampaignName(draft.value);
    if (!name || full.value) return;
    void run(async () => { await createCampaign(name); }, () => {
        changed();
        mode.value = '';
        emit('campaign');
    });
}

function rename(): void {
    const name = cleanCampaignName(draft.value);
    const target = openOne.value;
    if (!name || !target) return;
    if (name === target.name) {
        back();
        return;
    }
    void run(() => renameCampaign(target.id, name), back);
}

function remove(): void {
    const target = openOne.value;
    if (!target) return;
    void run(() => deleteCampaign(target.id), () => {
        changed();
        mode.value = '';
        showToast('Deleted ' + target.name + '.');
        emit('close');
    });
}

/** The campaign's file, from the server, saved as it names it. */
function exportCampaign(): void {
    const target = openOne.value;
    if (!target) return;
    void run(async () => {
        const res = await apiFetch(fetch, '/api/universes/' + encodeURIComponent(target.id) + '/campaign/export');
        if (!res.ok) throw new Error('export ' + res.status);
        const found = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
        saveBlob(await res.blob(), found ? found[1] : target.name + '.campaign.json');
    }, () => {
        showToast('Exported ' + target.name + '.');
        emit('close');
    });
}

function pickImport(): void {
    if (busy.value || !openOne.value) return;
    trouble.value = '';
    if (fileEl.value) fileEl.value.click();
}

/** A file chosen for Import: parsed and brought in; the module's words are shown as given. */
async function onImportFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files && input.files[0];
    input.value = '';
    const target = openOne.value;
    if (!file || !target || busy.value) return;
    busy.value = true;
    trouble.value = '';
    try {
        const parsed = parseExport(await file.text());
        if (!parsed.ok) {
            trouble.value = parsed.message;
            return;
        }
        const result = await importCampaign(parsed.document, target.id);
        if (!result.ok) {
            trouble.value = result.message;
            return;
        }
        showToast('Imported ' + result.landed + (result.landed === 1 ? ' row' : ' rows') + ' into ' + target.name + '.');
        emit('close');
    } catch {
        trouble.value = 'That file could not be read.';
    } finally {
        busy.value = false;
    }
}

function onFormKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        back();
        return;
    }
    if (event.key === 'Enter' && mode.value !== 'delete') {
        event.preventDefault();
        event.stopPropagation();
        if (mode.value === 'new') create();
        else rename();
        return;
    }
    event.stopPropagation();
}

const name = computed(() => displayName(session.user));
const line = computed(() => accountLine(session.user));
const mark = computed(() => initials(session.user));

function items(): HTMLElement[] {
    return menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

function focusFirst(): void {
    if (session.user) {
        const list = items();
        if (list[0]) list[0].focus();
    } else if (card.value) {
        card.value.focus();
    }
}

/** Up and Down walk the menu and wrap; Home and End jump. */
function onMenuKey(event: KeyboardEvent): void {
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(event.target as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (event.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    event.stopPropagation();
    list[next].focus();
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    emit('close');
}

async function leave(): Promise<void> {
    if (leaving.value) return;
    leaving.value = true;
    try {
        await signOut();
        // The next person at this browser must not see this one's campaign.
        resetCampaign();
        forgetDeleted();
        forgetOpening();
    } finally {
        leaving.value = false;
        emit('close');
    }
}

watch(() => props.open, (open) => {
    mode.value = '';
    trouble.value = '';
    if (open) void nextTick(focusFirst);
});
</script>

<template>
  <div v-if="open" class="account-backdrop" @click="$emit('close')"></div>
  <section
    v-if="open"
    id="account-pop"
    ref="pop"
    class="account-pop"
    :class="{ 'is-menu': session.user !== null }"
    :aria-label="session.user ? 'Account' : 'Sign in'"
    @keydown="onKey"
  >
    <template v-if="session.user">
      <div class="account-who">
        <span class="account-mark is-large" aria-hidden="true">{{ mark }}</span>
        <div>
          <b>{{ name }}</b>
          <span v-if="line">{{ line }}</span>
        </div>
      </div>
      <div v-if="mode === 'delete'" class="account-form" role="alertdialog" aria-labelledby="account-delete-q" @keydown="onFormKey">
        <p id="account-delete-q" class="account-q">{{ question }}</p>
        <p v-if="trouble" class="account-trouble" role="alert">{{ trouble }}</p>
        <div class="account-form-acts">
          <button type="button" class="ui-btn is-primary is-danger account-delete-go" :disabled="busy" @click="remove">
            <Icon name="trash" :size="12" />{{ busy ? 'Deleting…' : 'Delete' }}
          </button>
          <button type="button" class="ui-btn account-keep" :disabled="busy" @click="back">Keep it</button>
        </div>
      </div>
      <div v-else-if="mode" class="account-form" role="group" :aria-label="mode === 'new' ? 'New campaign' : 'Rename the campaign'" @keydown="onFormKey">
        <label class="account-field">
          <span>{{ mode === 'new' ? 'Name the new campaign' : 'A new name' }}</span>
          <input v-model="draft" type="text" class="camp-input" :maxlength="CAMPAIGN_LIMITS.name" :disabled="busy">
        </label>
        <p v-if="trouble" class="account-trouble" role="alert">{{ trouble }}</p>
        <div class="account-form-acts">
          <button type="button" class="ui-btn is-primary account-go" :disabled="busy || !cleanCampaignName(draft)" @click="mode === 'new' ? create() : rename()">
            <Icon name="check" :size="12" />{{ busy ? 'Saving…' : mode === 'new' ? 'Create' : 'Rename' }}
          </button>
          <button type="button" class="ui-btn account-cancel" :disabled="busy" @click="back">Cancel</button>
        </div>
      </div>
      <div v-else ref="menu" class="account-items" role="menu" aria-label="Account" @keydown="onMenuKey">
        <p v-if="ready && campaigns.length" class="account-group">Your campaigns</p>
        <button
          v-for="item in campaigns"
          :key="item.id"
          type="button"
          role="menuitem"
          class="account-campaign"
          :class="{ 'is-open': item.id === campaign.universeId }"
          :disabled="busy"
          :title="item.id === campaign.universeId ? 'Open the Campaign panel' : 'Switch to ' + item.name"
          @click="pick(item.id)"
        >
          <Icon :name="item.id === campaign.universeId ? 'book-sparkles' : 'circle-dashed'" :size="15" /><span>{{ item.name }}</span><em v-if="item.id === campaign.universeId">open</em>
        </button>
        <button v-if="ready" type="button" role="menuitem" class="account-new" :disabled="busy || full" :title="full ? 'Ten campaigns is the most an account holds' : 'Make another campaign'" @click="begin('new')">
          <Icon name="plus" :size="15" /><span>New campaign…</span><em v-if="full">{{ CAMPAIGN_CAP }} is the most</em>
        </button>
        <button v-if="openOne" type="button" role="menuitem" class="account-rename" :disabled="busy" @click="begin('rename')">
          <Icon name="pen-to-square" :size="15" /><span>Rename {{ openOne.name }}</span>
        </button>
        <button v-if="openOne" type="button" role="menuitem" class="account-delete" :disabled="busy" @click="begin('delete')">
          <Icon name="trash" :size="15" /><span>Delete {{ openOne.name }}</span>
        </button>
        <button v-if="openOne" type="button" role="menuitem" class="account-export" :disabled="busy" @click="exportCampaign">
          <Icon name="file-export" :size="15" /><span>Export {{ openOne.name }}</span>
        </button>
        <button v-if="openOne" type="button" role="menuitem" class="account-import" :disabled="busy || !emptyCampaign" :title="emptyCampaign ? 'Bring a campaign file into this empty campaign' : 'Import takes an empty campaign: make a new one first'" @click="pickImport">
          <Icon name="file-import" :size="15" /><span>Import into {{ openOne.name }}…</span><em v-if="!emptyCampaign">not empty</em>
        </button>
        <input ref="fileEl" class="vplan-file" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="onImportFile">
        <button v-if="ready" type="button" role="menuitem" class="account-party" @click="router.push({ path: '/campaign/party', query: route.query }); $emit('close')">
          <Icon name="shuttle-space" :size="15" /><span>Go to the party</span>
        </button>
        <p v-if="trouble" class="account-trouble" role="alert">{{ trouble }}</p>
        <button type="button" role="menuitem" :disabled="leaving" @click="leave">
          <Icon name="arrow-left" :size="15" /><span>{{ leaving ? 'Signing out…' : 'Sign out' }}</span>
        </button>
      </div>
    </template>
    <SignInCard v-else ref="card" heading />
  </section>
</template>

<style>
.account-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8;
}

/* Anchored to the rail's foot, clear of the rail whether it is collapsed or expanded. */
.account-pop {
  position: absolute;
  left: calc(var(--rail-width) + var(--chrome-inset));
  bottom: var(--chrome-inset);
  z-index: 9;
  box-sizing: border-box;
  width: min(330px, calc(100vw - var(--rail-width) - 2 * var(--chrome-inset)));
  padding: 16px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-4);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13.5px/1.5 var(--font-text);
  animation: account-pop-in var(--t-fast) var(--ease-out) both;
}

.account-pop.is-menu {
  width: min(300px, calc(100vw - var(--rail-width) - 2 * var(--chrome-inset)));
  padding: 8px;
}

@keyframes account-pop-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

.account-who {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--line-1);
  margin-bottom: 6px;
}

.account-who div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.account-who b {
  color: var(--text-0);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.account-who span {
  color: var(--text-muted);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

/* The user's initials: on the rail's button and, larger, at the head of the menu. */
.account-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-pill);
  background: var(--wash);
  color: var(--signal);
  font: 700 12px/1 var(--font-text);
  letter-spacing: 0.04em;
}

.account-mark.is-large {
  width: 40px;
  height: 40px;
  font-size: 14px;
}

.account-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-items button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 14px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out);
}

.account-items button:hover,
.account-items button:focus-visible {
  background: var(--row-active);
}

.account-items button:focus-visible {
  outline-offset: -2px;
}

.account-items button:disabled {
  opacity: 0.6;
  cursor: default;
}

.account-items .ui-icon {
  flex: 0 0 16px;
  color: var(--signal);
}

.account-items em {
  margin-left: auto;
  color: var(--text-muted);
  font: 400 12px/1 var(--font-text);
}

.account-group {
  margin: 4px 0 2px;
  padding: 0 10px;
  color: var(--text-muted);
  font: 700 10.5px/1.4 var(--font-text);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.account-items .account-campaign .ui-icon {
  color: var(--text-muted);
}

.account-items .account-campaign.is-open .ui-icon {
  color: var(--signal);
}

.account-items .account-campaign.is-open span {
  color: var(--text-0);
  font-weight: 600;
}

.account-items .account-delete .ui-icon {
  color: var(--danger);
}

.account-items .account-campaign + .account-new {
  margin-top: 2px;
}

/* A name to type, or the delete's question, in the menu's place. */
.account-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 10px 10px;
}

.account-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-1);
  font: 600 12.5px/1.4 var(--font-text);
}

.account-q {
  margin: 0;
  color: var(--text-0);
  font: 400 14px/1.5 var(--font-text);
}

.account-trouble {
  margin: 0;
  padding: 0 10px;
  color: var(--attention);
  font: 400 12.5px/1.45 var(--font-text);
}

.account-form .account-trouble {
  padding: 0;
}

.account-form-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ui-btn.is-primary.is-danger {
  border-color: var(--danger);
  background: var(--danger);
  color: var(--bg-0);
}

.ui-btn.is-primary.is-danger .ui-icon {
  color: inherit;
}

@media (prefers-reduced-motion: reduce) {
  .account-pop {
    animation: none;
  }

  .account-items button {
    transition: none;
  }
}
</style>
