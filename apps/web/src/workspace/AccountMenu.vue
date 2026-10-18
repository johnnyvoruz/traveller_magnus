<script setup lang="ts">
/**
 * The pop-up at the rail's foot (design §1; K5f). Signed out it is the sign-in card; signed
 * in it is the account menu, the person's own things (DU10, U10): who, Campaigns… (the Campaigns
 * panel, where the campaigns are opened, made, renamed, deleted, exported and imported, and their
 * switches set), Characters, My packages, Account and sign-in, Help, this device's quiet, Sign out,
 * then About and What's new. It opens over the map and nothing waits on it; a click anywhere else,
 * or Esc, closes it and focus goes back to the rail's button.
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session, signOut } from '../account/session.ts';
import { resetCampaign } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { addressPane, atPane } from '../shell/pane.ts';
import { registerCommand } from '../shell/registry.ts';
import { accountLine, displayName, initials, signInFrom } from './account.ts';
import { forgetDeleted } from './actions.ts';
import { HELP_PATH } from './help_command.ts';
import { forgetOpening } from './opening.ts';
import { MY_PACKAGES_PATH } from './market/command.ts';
import LivingSettings from './LivingSettings.vue';
import SignInCard from './SignInCard.vue';
import { noteReturn, RECOVERY_PATH } from './passkey/recovery.ts';
import { APP_VERSION } from '../version.ts';

const ChangelogWindow = defineAsyncComponent(() => import('./ChangelogWindow.vue'));
const changesOpen = ref(false);

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

// ---- The campaigns live on their own panel now (DU10); the menu keeps the person ---------------

const trouble = ref('');
const ready = computed(() => campaign.status === 'ready' || campaign.status === 'error');
/** The open campaign's name, beside Campaigns… */
const openName = computed(() => (campaign.universes.find((item) => item.id === campaign.universeId) ?? { name: '' }).name);

/** The Campaigns panel: the referee's campaigns as cards, with their actions and switches. */
function openCampaigns(): void {
    const pane = addressPane(route.path, route.query).pane;
    if (pane.kind !== 'campaigns') void router.push(atPane(route.path, route.query, { kind: 'campaigns' }));
    emit('close');
}

/** Help, from the menu as from the palette. */
function openHelp(): void {
    if (route.path !== HELP_PATH) void router.push(HELP_PATH);
    emit('close');
}

/** The Characters list, with or without a campaign. From a character, this returns to the list. */
function openCharacters(): void {
    const pane = addressPane(route.path, route.query).pane;
    if (!(pane.kind === 'characters' && pane.character === null)) {
        void router.push(atPane(route.path, route.query, { kind: 'characters', character: null }));
    }
    if (props.open) emit('close');
}

/** The referee's own packages. The palette command uses this same address. */
function openPackages(): void {
    if (route.path !== MY_PACKAGES_PATH) void router.push(MY_PACKAGES_PATH);
    if (props.open) emit('close');
}

let stopCharacters: (() => void) | null = null;
onMounted(() => {
    stopCharacters = registerCommand({ id: 'characters', name: 'Characters', run: openCharacters });
});
onBeforeUnmount(() => {
    if (stopCharacters) stopCharacters();
});


const name = computed(() => displayName(session.user));
// A passkey account's name is its username: the @ line would only say it again.
const line = computed(() => { const said = accountLine(session.user); return said.replace(/^@/, '') === name.value ? '' : said; });
const mark = computed(() => initials(session.user));

function items(): HTMLElement[] {
    return menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')) : [];
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

/**
 * Sign out. Only when the server has ended the session is this person's campaign let go and the
 * menu closed; otherwise they stay signed in and the menu says why, in the session's own words.
 */
async function leave(): Promise<void> {
    if (leaving.value) return;
    leaving.value = true;
    trouble.value = '';
    try {
        const done = await signOut();
        if (!done.ok) {
            trouble.value = done.message;
            // Focus stays on Sign out once it's live again, so the next try is one key away.
            void nextTick(() => {
                const el = pop.value ? pop.value.querySelector<HTMLElement>('[data-command="sign-out"]') : null;
                if (el) el.focus();
            });
            return;
        }
        // The next person at this browser must not see this one's campaign.
        resetCampaign();
        forgetDeleted();
        forgetOpening();
        emit('close');
    } finally {
        leaving.value = false;
    }
}

/** The account page: passkeys, recovery codes, linked accounts. "Back to the map" there returns here. */
function openAccount(): void {
    noteReturn(route.fullPath);
    if (route.path !== RECOVERY_PATH) void router.push(RECOVERY_PATH);
    emit('close');
}

function openAbout(): void {
    emit('close');
    void router.push('/welcome');
}

watch(() => props.open, (open) => {
    trouble.value = '';
    // The card opened from Build says so only that once.
    if (!open) signInFrom.value = null;
    if (open) void nextTick(focusFirst);
});
</script>

<template>
  <!-- On the body, in the house pattern: inside the map view it is drawn under an open panel. -->
  <Teleport to="body">
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
      <div ref="menu" class="account-items" role="menu" aria-label="Account" @keydown="onMenuKey">
        <button type="button" role="menuitem" class="account-campaigns" data-command="campaigns" @click="openCampaigns">
          <Icon name="book-sparkles" :size="15" /><span>Campaigns…</span><em v-if="openName">{{ openName }}</em>
        </button>
        <button v-if="ready" type="button" role="menuitem" class="account-characters" data-command="characters" @click="openCharacters">
          <Icon name="user" :size="15" /><span>Characters</span>
        </button>
        <button type="button" role="menuitem" class="account-packages" @click="openPackages">
          <Icon name="store" :size="15" /><span>My packages</span>
        </button>
        <button type="button" role="menuitem" class="account-page" data-command="account-page" @click="openAccount">
          <Icon name="gear" :size="15" /><span>Account and sign-in</span>
        </button>
        <button type="button" role="menuitem" class="account-help" data-command="help" @click="openHelp">
          <Icon name="circle-question" :size="15" /><span>Help</span>
        </button>
        <!-- This device (DU18b): its quiet switch. The campaign's own switches are on the Campaigns panel. -->
        <LivingSettings part="device" :can-change="false" />
        <p v-if="trouble" class="account-trouble" role="alert">{{ trouble }}</p>
        <button type="button" role="menuitem" data-command="sign-out" :disabled="leaving" @click="leave">
          <Icon name="arrow-left" :size="15" /><span>{{ leaving ? 'Signing out…' : 'Sign out' }}</span>
        </button>
      </div>
      <button type="button" class="account-version" data-command="about" @click="openAbout">About Traveller.voyage</button>
      <button type="button" class="account-version" data-version @click="changesOpen = true">Version {{ APP_VERSION }} · What's new</button>
      <ChangelogWindow v-if="changesOpen" @close="changesOpen = false" />
    </template>
    <template v-else>
      <SignInCard ref="card" heading />
      <button type="button" class="account-version" data-command="about" @click="openAbout">About Traveller.voyage</button>
    </template>
  </section>
  </Teleport>
</template>

<style>
/* VesselPlan.vue owns this class, and that page is not on the map; the store's cover editor uses it
   too, and the menu is on every page, so the menu carries the same rule. */
.vplan-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.account-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8;
}

/* Anchored to the rail's foot, clear of the rail whether it is collapsed or expanded. On the
   body it is outside .app, so the expanded rail's width is carried over here (App.vue). */
body:has(.rail.is-expanded) .account-pop {
  --rail-width: var(--rail-width-open);
}

/* The app's version, last in the menu, outside its items. Same look as the store's text links. */
.account-pop .account-version {
  display: block;
  width: 100%;
  margin: 8px 0 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 600 13px/1.4 var(--font-text);
  text-align: right;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.account-pop .account-version:hover {
  color: var(--signal-bright);
}

.account-pop {
  position: fixed;
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

/* What the switch above it shows other people: under its row, in line with the row's words. */
.account-say {
  margin: 0 0 4px;
  padding: 0 10px 0 36px;
  color: var(--text-muted);
  font: 400 12px/1.45 var(--font-text);
}

.account-say.is-todo {
  color: var(--attention);
}

.account-items .account-public[aria-checked='true'] em {
  color: var(--signal);
  font-weight: 700;
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
