<script setup lang="ts">
/**
 * The account page at /account (findings/passkey_screens_design.md §2 to §4), loaded as its own
 * chunk by views/Account.vue. What it shows follows the session this browser holds:
 *
 * - signed out: the sign-in card;
 * - a new account: its recovery codes, once, then the nudge to add a second passkey;
 * - a recovery session (`session.gate`): the recovery screen and nothing else;
 * - signed in: the username, the passkeys, the recovery codes, the linked accounts, sign out.
 *
 * The calls are Lane A's (account/passkey.ts); each one that changes the account reads the
 * session again itself. No email is shown anywhere, including the stand-in address the server
 * stores.
 */
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
    linkProvider, listLinkedAccounts, listPasskeys, regenerateRecoveryCodes, removePasskey, renamePasskey, setUsername, unlinkAccount,
    type LinkedAccount, type PasskeyRow,
} from '../../account/passkey.ts';
import { loadSession, session, signOut } from '../../account/session.ts';
import { resetCampaign } from '../../campaign/commit.ts';
import { apiFetch } from '../../platform/http.ts';
import { APP_VERSION } from '../../version.ts';
import { readProviders } from '../account.ts';
import { forgetDeleted } from '../actions.ts';
import { forgetOpening } from '../opening.ts';
import CodesBlock from './CodesBlock.vue';
import PasskeyAdd from './PasskeyAdd.vue';
import { returnPath } from './recovery.ts';
import RecoveryScreen from './RecoveryScreen.vue';
// The card body itself, not the wrapper: its field styles are this page's too.
import SignInBody from './SignInBody.vue';
import {
    addedOn, atUsername, CODES_HEADING, CODES_LEAD, CODES_SAVED, heldCodes, LAST_PASSKEY_SAY, LAST_PROVIDER_SAY, lastPasskey, lastProvider,
    LOST_MEANS_LOST, NEW_CODES_ASK, NO_PASSKEY, NOT_REACHED, NUDGE_HEADING, NUDGE_LEAD, ONE_PASSKEY, PASSKEY_ADDED, PASSKEY_EXPLAIN,
    providerName, takeCodes, unusedWords, USERNAME_HINT, usernameProblem,
} from './words.ts';

type Phase = 'loading' | 'out' | 'codes' | 'nudge' | 'recovery' | 'account';
const ORDER = ['twitter', 'discord', 'google'];
const ChangelogWindow = defineAsyncComponent(() => import('../ChangelogWindow.vue'));
const changesOpen = ref(false);

const router = useRouter();
const phase = ref<Phase>('loading');
const heading = ref<HTMLElement | null>(null);

// ---- A new account's codes, then the nudge ----------------------------------------------

const fresh = ref<{ username: string; codes: string[] } | null>(null);
const saved = ref(false);

function focusHeading(): void {
    void nextTick(() => { if (heading.value) heading.value.focus(); });
}

function takeHeld(): boolean {
    const held = takeCodes();
    if (!held) return false;
    fresh.value = held;
    saved.value = false;
    phase.value = 'codes';
    focusHeading();
    return true;
}

function codesSaved(): void {
    if (!saved.value) return;
    fresh.value = null;
    phase.value = 'nudge';
    focusHeading();
}

/** The end of sign-up: back to the address the card was opened from (the home view when it isn't known). */
function nudgeDone(): void {
    void router.push(returnPath());
}

// ---- The account ------------------------------------------------------------------------

/** The account's own fields, as GET /api/me gave them (account/session.ts). */
const me = computed(() => session.user);
const passkeys = ref<PasskeyRow[]>([]);
const linked = ref<LinkedAccount[]>([]);
const offeredIds = ref<string[]>([]);
/** Which control is waiting on the server, and the sentence it got back. */
const busy = ref('');
const pageSay = ref('');
const rowSay = ref<{ id: string; text: string } | null>(null);

const renaming = ref('');
const renameDraft = ref('');
const removing = ref('');
const adding = ref(false);
const addedNote = ref(false);
/** New codes: the question, then the set, once. */
const codesStep = ref<'' | 'ask' | 'show'>('');
const newCodes = ref<string[]>([]);
const codesHeading = ref('');

const nameDraft = ref('');
const nameTyping = ref(false);
const nameRefused = ref('');
const nameSay = computed(() => nameRefused.value || usernameProblem(nameDraft.value, nameTyping.value));
const canName = computed(() => nameDraft.value.trim() !== '' && usernameProblem(nameDraft.value) === '' && !nameRefused.value);

const onlyPasskey = computed(() => lastPasskey(passkeys.value.length, linked.value.length));
const onlyProvider = computed(() => lastProvider(passkeys.value.length, linked.value.length));
/** One row for each provider the server offers or the account has linked, in the card's order. */
const providerRows = computed(() => {
    const ids = new Set([...offeredIds.value, ...linked.value.map((row) => row.providerId)]);
    return ORDER.filter((id) => ids.has(id)).map((id) => ({ id, name: providerName(id), link: linked.value.find((row) => row.providerId === id) || null }));
});

/** A new account's codes, or the nudge after them, are on screen: a late read doesn't replace them. */
function codesOnScreen(): boolean {
    return phase.value === 'codes' || phase.value === 'nudge';
}

/** The session, then the account's lists. */
async function load(): Promise<void> {
    await loadSession();
    if (codesOnScreen()) return;
    if (session.gate === 'recovery') {
        phase.value = 'recovery';
        return;
    }
    if (!session.user) {
        phase.value = 'out';
        return;
    }
    const [keys, links, ids] = await Promise.all([listPasskeys(), listLinkedAccounts(), readProviders((url) => apiFetch(fetch, url))]);
    if (codesOnScreen()) return;
    passkeys.value = keys.ok ? keys.passkeys : [];
    linked.value = links.ok ? links.accounts.filter((row) => ORDER.includes(row.providerId)) : [];
    offeredIds.value = ids || [];
    pageSay.value = !keys.ok ? keys.message : !links.ok ? links.message : '';
    const first = phase.value !== 'account';
    phase.value = 'account';
    if (first) focusHeading();
}

async function act(what: string, work: () => Promise<{ ok: true } | { ok: false; message: string }>, row = ''): Promise<boolean> {
    if (busy.value) return false;
    busy.value = what;
    pageSay.value = '';
    rowSay.value = null;
    try {
        const done = await work();
        if (done.ok) return true;
        const text = done.message || NOT_REACHED;
        if (row) rowSay.value = { id: row, text };
        else pageSay.value = text;
        return false;
    } catch {
        if (row) rowSay.value = { id: row, text: NOT_REACHED };
        else pageSay.value = NOT_REACHED;
        return false;
    } finally {
        busy.value = '';
    }
}

function startRename(row: PasskeyRow): void {
    removing.value = '';
    renaming.value = row.id;
    renameDraft.value = row.name;
    void nextTick(() => {
        const el = document.querySelector<HTMLInputElement>('[data-rename-field]');
        if (el) {
            el.focus();
            el.select();
        }
    });
}

function focusRow(id: string, what: 'rename' | 'remove'): void {
    void nextTick(() => {
        const el = document.querySelector<HTMLElement>('[data-passkey-row="' + id + '"] [data-passkey="' + what + '"]');
        if (el) el.focus();
    });
}

function stopRename(): void {
    const id = renaming.value;
    renaming.value = '';
    if (id) focusRow(id, 'rename');
}

async function saveRename(row: PasskeyRow): Promise<void> {
    const name = renameDraft.value.trim();
    if (!name) return;
    if (name === row.name) {
        stopRename();
        return;
    }
    if (await act('rename', () => renamePasskey(row.id, name), row.id)) {
        row.name = name;
        stopRename();
    }
}

function askRemove(row: PasskeyRow): void {
    renaming.value = '';
    removing.value = row.id;
    void nextTick(() => {
        const el = document.querySelector<HTMLElement>('[data-passkey="remove-keep"]');
        if (el) el.focus();
    });
}

function keepIt(id: string): void {
    removing.value = '';
    focusRow(id, 'remove');
}

function focusAdd(): void {
    void nextTick(() => {
        const el = document.querySelector<HTMLElement>('[data-passkey="add"]');
        if (el) el.focus();
    });
}

async function remove(row: PasskeyRow): Promise<void> {
    if (await act('remove', () => removePasskey(row.id), row.id)) {
        removing.value = '';
        await load();
        focusAdd();
    }
}

function startAdd(): void {
    addedNote.value = false;
    adding.value = true;
}

function stopAdd(): void {
    adding.value = false;
    focusAdd();
}

const codesH = ref<HTMLElement | null>(null);
function focusCodes(): void {
    void nextTick(() => { if (codesH.value) codesH.value.focus(); });
}

/** A passkey added from this page. The first one on a provider account comes with its ten codes, shown once. */
async function passkeyAdded(codes: string[] | null): Promise<void> {
    adding.value = false;
    addedNote.value = true;
    await load();
    if (!codes) {
        focusAdd();
        return;
    }
    newCodes.value = codes;
    codesHeading.value = CODES_HEADING;
    codesStep.value = 'show';
    focusCodes();
}

async function makeCodes(): Promise<void> {
    let got: string[] = [];
    const ok = await act('codes', async () => {
        const done = await regenerateRecoveryCodes();
        if (done.ok) got = done.codes;
        return done;
    });
    if (!ok) return;
    newCodes.value = got;
    codesHeading.value = 'Your new recovery codes';
    codesStep.value = 'show';
    focusCodes();
}

async function codesDone(): Promise<void> {
    newCodes.value = [];
    codesStep.value = '';
    await load();
    void nextTick(() => {
        const el = document.querySelector<HTMLElement>('[data-codes="make"]');
        if (el) el.focus();
    });
}

async function saveUsername(): Promise<void> {
    nameTyping.value = false;
    if (!canName.value || busy.value) return;
    busy.value = 'username';
    pageSay.value = '';
    try {
        const done = await setUsername(nameDraft.value.trim());
        if (!done.ok) {
            // A username refusal belongs at the field; anything else at the top of the page.
            if (atUsername(done.code)) nameRefused.value = done.message;
            else pageSay.value = done.message || NOT_REACHED;
            return;
        }
        nameDraft.value = '';
    } catch {
        pageSay.value = NOT_REACHED;
        return;
    } finally {
        busy.value = '';
    }
    await load();
}

async function unlink(row: LinkedAccount): Promise<void> {
    if (await act('unlink', () => unlinkAccount(row.id), row.providerId)) await load();
}

/** Link Google, Discord, or X to this account: the server's address for the provider, then the page leaves for it. */
async function link(id: string): Promise<void> {
    let url = '';
    const ok = await act('link', async () => {
        const done = await linkProvider(id, '/account');
        if (done.ok) url = done.url;
        return done;
    }, id);
    if (ok && url) globalThis.location.assign(url);
}

/** Sign out. When the server doesn't end the session, the page says so by the button and the person stays signed in. */
async function leave(): Promise<void> {
    if (await act('sign-out', () => signOut(), 'sign-out')) {
        resetCampaign();
        forgetDeleted();
        forgetOpening();
        phase.value = 'out';
    }
}

function signedOut(): void {
    phase.value = 'out';
}

onMounted(() => {
    if (!takeHeld()) void load();
});

// A sign-up from the card on this page hands its codes over here.
watch(heldCodes, (held) => { if (held) takeHeld(); });
// A recovery code redeemed from the card on this page: the route doesn't change, the gate does.
watch(() => session.gate, (gate) => {
    if (gate === 'recovery' && phase.value !== 'recovery') phase.value = 'recovery';
});
// A sign-in from the card on this page: the account is read.
watch(() => (session.user ? session.user.id : ''), (id) => {
    if (id && phase.value === 'out') void load();
});
</script>

<template>
  <main class="pk-page ui-ground">
    <div class="pk-page-inner">
      <span class="ui-brand pk-brand">Traveller<span class="ui-brand-dot">.</span>voyage</span>
      <RouterLink v-if="phase !== 'recovery'" :to="returnPath()" class="pk-back">Back to the map</RouterLink>

      <p v-if="phase === 'loading'" class="pk-quiet" role="status">Loading your account…</p>

      <section v-else-if="phase === 'out'" class="pk-page-body pk-frame" aria-label="Sign in">
        <SignInBody heading />
      </section>

      <!-- Right after sign-up: the ten codes, once. -->
      <section v-else-if="phase === 'codes' && fresh" class="pk-page-body" aria-labelledby="pk-codes-first-h" data-account="codes">
        <h1 id="pk-codes-first-h" ref="heading" class="pk-h1" tabindex="-1">{{ CODES_HEADING }}</h1>
        <p>{{ CODES_LEAD }}</p>
        <CodesBlock :codes="fresh.codes" :username="fresh.username" />
        <label class="pk-check">
          <input v-model="saved" type="checkbox" data-codes="saved">
          <span>{{ CODES_SAVED }}</span>
        </label>
        <div class="pk-acts">
          <button type="button" class="ui-btn is-primary" data-codes="continue" :disabled="!saved" @click="codesSaved">Continue</button>
        </div>
      </section>

      <section v-else-if="phase === 'nudge'" class="pk-page-body" aria-labelledby="pk-nudge-h" data-account="nudge">
        <h1 id="pk-nudge-h" ref="heading" class="pk-h1" tabindex="-1">{{ NUDGE_HEADING }}</h1>
        <p>{{ NUDGE_LEAD }}</p>
        <PasskeyAdd cancel="Not now" focus @added="nudgeDone" @cancel="nudgeDone" />
      </section>

      <RecoveryScreen v-else-if="phase === 'recovery'" @signed-out="signedOut" />

      <section v-else-if="phase === 'account' && me" class="pk-page-body" aria-labelledby="pk-account-h" data-account="page">
        <header class="pk-head">
          <h1 id="pk-account-h" ref="heading" class="pk-h1" tabindex="-1">Your account</h1>
          <p v-if="me.username" class="pk-handle">@{{ me.username }}</p>
        </header>
        <p v-if="pageSay" class="pk-alert" role="alert">{{ pageSay }}</p>

        <!-- New codes, in place of the page's sections until they're put away. -->
        <section v-if="codesStep === 'show'" class="pk-card" aria-labelledby="pk-codes-h" data-account="new-codes">
          <h2 id="pk-codes-h" ref="codesH" class="pk-h2" tabindex="-1">{{ codesHeading }}</h2>
          <p>{{ CODES_LEAD }}</p>
          <CodesBlock :codes="newCodes" :username="me.username || ''" />
          <div class="pk-acts">
            <button type="button" class="ui-btn is-primary" @click="codesDone">Done</button>
          </div>
        </section>

        <template v-else>
          <!-- An account from Google, Discord, or X has no username until it chooses one. -->
          <section v-if="!me.username" class="pk-card" aria-labelledby="pk-name-h">
            <h2 id="pk-name-h" class="pk-h2">Choose a username</h2>
            <form class="pk-form" novalidate @submit.prevent="saveUsername">
              <label class="pk-field">
                <span>Username</span>
                <input
                  v-model="nameDraft"
                  class="signin-input"
                  type="text"
                  autocomplete="username"
                  spellcheck="false"
                  autocapitalize="off"
                  maxlength="32"
                  aria-describedby="pk-name-hint pk-name-say"
                  :aria-invalid="nameSay ? 'true' : undefined"
                  :disabled="busy !== ''"
                  @input="nameTyping = true; nameRefused = ''"
                  @blur="nameTyping = false"
                >
              </label>
              <p id="pk-name-hint" class="pk-quiet">{{ USERNAME_HINT }}</p>
              <p id="pk-name-say" class="pk-alert" role="alert">{{ nameSay }}</p>
              <div class="pk-acts">
                <button type="submit" class="ui-btn is-primary" :disabled="busy !== '' || !canName">{{ busy === 'username' ? 'Saving…' : 'Save' }}</button>
              </div>
            </form>
          </section>

          <section class="pk-card" aria-labelledby="pk-keys-h" data-account="passkeys">
            <h2 id="pk-keys-h" class="pk-h2">Passkeys</h2>
            <p class="pk-quiet">{{ PASSKEY_EXPLAIN }}</p>
            <p v-if="passkeys.length === 0">{{ NO_PASSKEY }}</p>
            <ul v-else class="pk-rows">
              <li v-for="row in passkeys" :key="row.id" class="pk-row" :data-passkey-row="row.id">
                <template v-if="renaming === row.id">
                  <form class="pk-row-form" novalidate @submit.prevent="saveRename(row)" @keydown.esc.prevent="stopRename">
                    <label class="pk-field">
                      <span>Passkey name</span>
                      <input v-model="renameDraft" data-rename-field class="signin-input" type="text" maxlength="40" :disabled="busy !== ''">
                    </label>
                    <div class="pk-acts">
                      <button type="submit" class="ui-btn is-primary" :disabled="busy !== '' || !renameDraft.trim()">{{ busy === 'rename' ? 'Saving…' : 'Save' }}</button>
                      <button type="button" class="ui-btn" :disabled="busy !== ''" @click="stopRename">Cancel</button>
                    </div>
                  </form>
                </template>
                <template v-else-if="removing === row.id">
                  <p class="pk-row-q">Remove {{ row.name || 'this passkey' }}? You can’t sign in with it after this.</p>
                  <div class="pk-acts">
                    <button type="button" class="ui-btn is-primary is-danger" data-passkey="remove-go" :disabled="busy !== ''" @click="remove(row)">{{ busy === 'remove' ? 'Removing…' : 'Remove' }}</button>
                    <button type="button" class="ui-btn" data-passkey="remove-keep" :disabled="busy !== ''" @click="keepIt(row.id)">Keep it</button>
                  </div>
                </template>
                <template v-else>
                  <div class="pk-row-main">
                    <b>{{ row.name || 'Passkey' }}</b>
                    <span v-if="addedOn(row.createdAt)" class="pk-quiet">{{ addedOn(row.createdAt) }}</span>
                  </div>
                  <div class="pk-acts">
                    <button type="button" class="ui-btn" data-passkey="rename" :disabled="busy !== ''" @click="startRename(row)">Rename</button>
                    <button
                      type="button"
                      class="ui-btn"
                      data-passkey="remove"
                      :disabled="busy !== '' || onlyPasskey"
                      :aria-describedby="onlyPasskey ? 'pk-last-key' : undefined"
                      @click="askRemove(row)"
                    >
                      Remove
                    </button>
                  </div>
                </template>
                <p v-if="rowSay && rowSay.id === row.id" class="pk-alert pk-row-say" role="alert">{{ rowSay.text }}</p>
              </li>
            </ul>
            <p v-if="onlyPasskey" id="pk-last-key" class="pk-note">{{ LAST_PASSKEY_SAY }}</p>
            <!-- The last-way-in line already asks for a second passkey; this one says it when a provider is linked too. -->
            <p v-else-if="passkeys.length === 1">{{ ONE_PASSKEY }}</p>
            <p v-if="addedNote" class="pk-quiet" role="status">{{ PASSKEY_ADDED }}</p>
            <PasskeyAdd v-if="adding" cancel="Cancel" focus @added="passkeyAdded" @cancel="stopAdd" />
            <div v-else class="pk-acts">
              <button type="button" class="ui-btn" data-passkey="add" :disabled="busy !== ''" @click="startAdd">Add a passkey</button>
            </div>
            <p class="pk-calm">{{ LOST_MEANS_LOST }}</p>
          </section>

          <section class="pk-card" aria-labelledby="pk-rc-h" data-account="codes">
            <h2 id="pk-rc-h" class="pk-h2">Recovery codes</h2>
            <p>{{ unusedWords(me.unusedRecoveryCodes) }}</p>
            <template v-if="codesStep === 'ask'">
              <p class="pk-row-q">{{ NEW_CODES_ASK }}</p>
              <div class="pk-acts">
                <button type="button" class="ui-btn is-primary" data-codes="make-go" :disabled="busy !== ''" @click="makeCodes">{{ busy === 'codes' ? 'Making codes…' : 'Make new codes' }}</button>
                <button type="button" class="ui-btn" :disabled="busy !== ''" @click="codesStep = ''">Cancel</button>
              </div>
            </template>
            <div v-else class="pk-acts">
              <button type="button" class="ui-btn" data-codes="make" :disabled="busy !== '' || !me.hasPasskey" @click="codesStep = 'ask'">Make new codes</button>
            </div>
          </section>

          <section v-if="providerRows.length" class="pk-card" aria-labelledby="pk-links-h" data-account="links">
            <h2 id="pk-links-h" class="pk-h2">Linked accounts</h2>
            <p class="pk-quiet">You can also sign in with these accounts.</p>
            <ul class="pk-rows">
              <li v-for="row in providerRows" :key="row.id" class="pk-row">
                <div class="pk-row-main">
                  <b>{{ row.name }}</b>
                  <span class="pk-quiet">{{ row.link ? 'Linked' : 'Not linked' }}</span>
                </div>
                <div class="pk-acts">
                  <button
                    v-if="row.link"
                    type="button"
                    class="ui-btn"
                    :disabled="busy !== '' || onlyProvider"
                    :aria-describedby="onlyProvider ? 'pk-last-link' : undefined"
                    @click="unlink(row.link)"
                  >
                    Unlink
                  </button>
                  <button v-else type="button" class="ui-btn" :disabled="busy !== ''" @click="link(row.id)">Link</button>
                </div>
                <p v-if="rowSay && rowSay.id === row.id" class="pk-alert pk-row-say" role="alert">{{ rowSay.text }}</p>
              </li>
            </ul>
            <p v-if="onlyProvider" id="pk-last-link" class="pk-note">{{ LAST_PROVIDER_SAY }}</p>
          </section>

          <div class="pk-foot">
            <button type="button" class="ui-btn" data-account="sign-out" :disabled="busy !== ''" @click="leave">{{ busy === 'sign-out' ? 'Signing out…' : 'Sign out' }}</button>
            <p v-if="rowSay && rowSay.id === 'sign-out'" class="pk-alert" role="alert" data-account="sign-out-say">{{ rowSay.text }}</p>
          </div>
        </template>
      </section>
      <!-- Signed out, the sign-in card below says the version itself. -->
      <button v-if="phase !== 'out' && phase !== 'loading'" type="button" class="pk-version" data-version @click="changesOpen = true">Version {{ APP_VERSION }} · What's new</button>
      <ChangelogWindow v-if="changesOpen" @close="changesOpen = false" />
    </div>
  </main>
</template>

<style>
/* The page scrolls on its own: the app frame around it is fixed to the window. */
.pk-page {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  background: var(--ground-fill);
  color: var(--text-1);
  font: 400 14px/1.55 var(--font-text);
}

.pk-page-inner {
  box-sizing: border-box;
  width: min(640px, 100%);
  margin: 0 auto;
  padding: 32px 16px 64px;
}

.pk-page p {
  margin: 0;
  color: var(--text-1);
}

.pk-back {
  display: inline-block;
  margin-bottom: 20px;
  color: var(--signal);
  font-size: 13px;
  text-underline-offset: 2px;
}

.pk-page-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* The app's version, last on the page. Same look as the store's text links. */
.pk-page .pk-version {
  display: block;
  margin: 20px 0 0 0;
  margin-left: auto;
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

.pk-page .pk-version:hover {
  color: var(--signal-bright);
}

.pk-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
}

/* The version-video look: the page on the ground (its grid and stars held to the window as the page scrolls), the brand at the top, the sign-in and the cards in frames, titles in Orbitron. */
.pk-page.ui-ground::before,
.pk-page.ui-ground::after {
  position: fixed;
}

.pk-brand {
  display: block;
  width: max-content;
  margin-bottom: 18px;
}

.pk-frame {
  box-sizing: border-box;
  max-width: 462px;
  padding: 20px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-4);
  background: var(--bg-0);
  box-shadow: 0 0 24px var(--frame-glow);
}

.pk-h1 {
  margin: 0;
  color: var(--text-0);
  font: 700 24px/1.25 var(--font-display);
  letter-spacing: 0.02em;
  outline: none;
}

.pk-h2 {
  margin: 0;
  color: var(--text-0);
  font: 700 16px/1.3 var(--font-text);
  outline: none;
}

.pk-page .pk-handle {
  color: var(--signal);
  font: 500 15px/1.3 var(--font-code);
}

.pk-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-4);
  background: var(--bg-0);
  box-shadow: 0 0 24px var(--frame-glow);
}

.pk-rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pk-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 10px 0;
  border-top: 1px solid var(--line-1);
}

.pk-row:first-child {
  border-top: 0;
}

.pk-row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pk-row-main b {
  color: var(--text-0);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.pk-row-form {
  display: flex;
  flex: 1 1 100%;
  flex-direction: column;
  gap: 8px;
}

.pk-row-say {
  flex: 1 1 100%;
}

.pk-page .pk-row-q {
  flex: 1 1 100%;
  color: var(--text-0);
}

.pk-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pk-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-1);
  font: 600 12.5px/1.4 var(--font-text);
}

.pk-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pk-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.pk-check input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--signal);
}

.pk-page .pk-quiet,
.pk-quiet {
  color: var(--text-muted);
  font-size: 13px;
}

/* The lost-means-lost sentence: said plainly, in the page's own colour. */
.pk-page .pk-calm {
  color: var(--text-2);
  font-size: 13px;
}

.pk-page .pk-note {
  color: var(--text-2);
  font-size: 13px;
}

.pk-page .pk-alert,
.pk-alert {
  color: var(--attention);
  font-size: 13px;
}

.pk-alert:empty {
  display: none;
}

.pk-foot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
}

.pk-link {
  margin: 0;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--text-2);
  font: 400 13px/1.4 var(--font-text);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.pk-link:disabled {
  opacity: 0.6;
  cursor: default;
}

/* The card lines up under "Back to the map", at its own width. */
.pk-page .signin {
  margin: 0;
}
</style>
