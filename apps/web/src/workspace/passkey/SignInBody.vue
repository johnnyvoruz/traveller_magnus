<script setup lang="ts">
/**
 * The sign-in card (findings/passkey_screens_design.md §1; reordered 2026-10-13): "Create an
 * account" with a username first, then the providers the server has switched on (X, Discord,
 * Google), then the passkey's "Sign in" with "I lost my passkey" for a recovery code under it.
 * Shown in the pop-up at the rail's foot, in the Campaign and Characters panels while signed
 * out, and on /account.
 *
 * This body is its own chunk, loaded by workspace/SignInCard.vue when a card is shown. The calls
 * are Lane A's (account/passkey.ts), which load the passkey libraries at the first ceremony.
 * A new account and a recovery code both go on to /account, where the codes and the recovery
 * screen have a whole page and no click outside can close them.
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { CEREMONY_CANCELLED, PASSKEY_UNAVAILABLE, passkeySupported, redeemRecovery, signInWithPasskey, signUp } from '../../account/passkey.ts';
import { session, signIn } from '../../account/session.ts';
import { apiFetch } from '../../platform/http.ts';
import { isOnline, onOnlineChange } from '../../platform/browser.ts';
import { APP_VERSION } from '../../version.ts';

const ChangelogBody = defineAsyncComponent(() => import('../ChangelogBody.vue'));
import { offeredProviders, readProviders, SIGN_IN_FINE, SIGN_IN_OFFLINE, signInFrom, signInPitch, type SignInProvider } from '../account.ts';
import {
    atUsername, CREATE_ACCOUNT, guardRecovery, heldCodes, LOST_PASSKEY, NO_WEBAUTHN_ALONE, NO_WEBAUTHN_PROVIDERS, NOT_REACHED, OTHER_ACCOUNTS,
    PASSKEY_CLOSED, PASSKEY_WAITING, RECOVER_HEADING, RECOVER_LEAD, RECOVERY_PATH, SIGN_IN_PASSKEY,
    USERNAME_HINT, usernameProblem,
} from './words.ts';
import { noteReturn } from './recovery.ts';

defineProps<{
    /** The pop-up carries its own heading; the panel's header already names the place. */
    heading?: boolean;
}>();
/** Mounted: the wrapper hands on a focus asked for before this chunk arrived. */
const emit = defineEmits<{ ready: [] }>();

const router = useRouter();
/** What the card shows: the choices, the username form, the recovery-code form, or the changelog. */
const mode = ref<'card' | 'create' | 'lost' | 'changes'>('card');
/** The ceremony or request under way: '' when none, else what it is for (or a provider's id). */
const busy = ref('');
const offered = ref<SignInProvider[]>(offeredProviders(null));
const online = ref(true);
const canPasskey = ref(true);
/** A line under the control it answers: muted for a closed prompt, the alert colour for a refusal. */
const said = ref<{ text: string; alert: boolean } | null>(null);
/** Which control the line answers: the username form, or the passkey's Sign in. */
const saidAt = ref<'create' | 'passkey'>('passkey');
const username = ref('');
const typing = ref(false);
const nameRefused = ref('');
const recoverName = ref('');
const code = ref('');

/** The first provider, when the browser has no passkeys: the card's top button then. */
const first = ref<HTMLButtonElement | null>(null);
const createEl = ref<HTMLButtonElement | null>(null);
const lostEl = ref<HTMLButtonElement | null>(null);
const nameEl = ref<HTMLInputElement | null>(null);
const recoverEl = ref<HTMLInputElement | null>(null);
const versionEl = ref<HTMLButtonElement | null>(null);
const changesBack = ref<HTMLButtonElement | null>(null);
let stopOnline: (() => void) | null = null;

const nameSay = computed(() => nameRefused.value || usernameProblem(username.value, typing.value));
const canCreate = computed(() => username.value.trim() !== '' && usernameProblem(username.value) === '' && !nameRefused.value);
const canRedeem = computed(() => recoverName.value.trim() !== '' && code.value.replace(/[\s-]/g, '').length >= 12);
const noPasskeySay = computed(() => (offered.value.length ? NO_WEBAUTHN_PROVIDERS : NO_WEBAUTHN_ALONE));

function focusLater(el: () => HTMLElement | null): void {
    void nextTick(() => {
        const target = el();
        if (target) target.focus();
    });
}

function show(next: 'card' | 'create' | 'lost' | 'changes'): void {
    const from = mode.value;
    mode.value = next;
    said.value = null;
    nameRefused.value = '';
    if (next === 'create') focusLater(() => nameEl.value);
    else if (next === 'lost') focusLater(() => recoverEl.value);
    else if (next === 'changes') focusLater(() => changesBack.value);
    else if (from === 'changes') focusLater(() => versionEl.value);
    else focusLater(() => (from === 'lost' ? lostEl.value : createEl.value));
}

/** A failed call as the card says it: a closed prompt is quiet; a username refusal goes to the field. */
function failed(fail: { code: string; message: string }): void {
    if (fail.code === CEREMONY_CANCELLED) {
        said.value = { text: PASSKEY_CLOSED, alert: false };
        return;
    }
    if (fail.code === PASSKEY_UNAVAILABLE) {
        canPasskey.value = false;
        return;
    }
    if (atUsername(fail.code)) {
        nameRefused.value = fail.message;
        focusLater(() => nameEl.value);
        return;
    }
    said.value = { text: fail.message || NOT_REACHED, alert: true };
}

async function signInPasskey(): Promise<void> {
    if (busy.value || !online.value) return;
    busy.value = 'passkey';
    said.value = null;
    saidAt.value = 'passkey';
    try {
        const done = await signInWithPasskey();
        if (!done.ok) failed(done);
    } catch {
        said.value = { text: NOT_REACHED, alert: true };
    } finally {
        busy.value = '';
    }
}

async function createAccount(): Promise<void> {
    typing.value = false;
    if (busy.value || !online.value || !canCreate.value) return;
    busy.value = 'create';
    said.value = null;
    saidAt.value = 'create';
    nameRefused.value = '';
    const name = username.value.trim();
    try {
        const done = await signUp(name);
        if (!done.ok) {
            failed(done);
            return;
        }
        // The codes go to the account page in memory; that page shows them once.
        heldCodes.value = { username: name.toLowerCase(), codes: done.codes };
        // The codes and the recovery screen end by returning here.
        noteReturn(router.currentRoute.value.fullPath);
        await router.push(RECOVERY_PATH);
    } catch {
        said.value = { text: NOT_REACHED, alert: true };
    } finally {
        busy.value = '';
    }
}

async function redeem(): Promise<void> {
    if (busy.value || !online.value || !canRedeem.value) return;
    busy.value = 'lost';
    said.value = null;
    try {
        const done = await redeemRecovery(recoverName.value.trim(), code.value.trim());
        if (!done.ok) {
            failed(done);
            return;
        }
        // session.gate is now recovery: the guard takes every route, this one included, to the screen.
        code.value = '';
        guardRecovery(router);
        // The codes and the recovery screen end by returning here.
        noteReturn(router.currentRoute.value.fullPath);
        await router.push(RECOVERY_PATH);
    } catch {
        said.value = { text: NOT_REACHED, alert: true };
    } finally {
        busy.value = '';
    }
}

async function start(provider: SignInProvider): Promise<void> {
    if (busy.value || !online.value) return;
    busy.value = provider.id;
    try {
        // On success the page leaves for the provider; the button stays busy until it does.
        await signIn(fetch, '/', provider.id);
    } finally {
        if (session.error) busy.value = '';
    }
}

function onNameInput(): void {
    typing.value = true;
    nameRefused.value = '';
}

/** Esc on the changelog returns to the sign-in choices. The card is already a dialog. */
function onChangesKey(event: KeyboardEvent): void {
    if (mode.value !== 'changes' || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    show('card');
}

/** Esc inside a form goes back to the card; it doesn't close the pop-up around it. */
function onFormKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || busy.value) return;
    event.preventDefault();
    event.stopPropagation();
    show('card');
}

onMounted(() => {
    // A browser holding a recovery session goes to the account page from wherever it opens sign-in.
    guardRecovery(router);
    online.value = isOnline();
    canPasskey.value = passkeySupported();
    stopOnline = onOnlineChange((now) => { online.value = now; });
    void readProviders((url) => apiFetch(fetch, url)).then((ids) => { offered.value = offeredProviders(ids); });
    // After the card is drawn again for a browser with no passkeys: the top button is then the first provider.
    void nextTick(() => emit('ready'));
});

onBeforeUnmount(() => {
    if (stopOnline) stopOnline();
});

/** Focus lands on the card's top button: "Create an account", or the first provider without passkeys. */
defineExpose({ focus: () => { const top = createEl.value || first.value; if (top) top.focus(); } });
</script>

<template>
  <div class="signin" @keydown="onChangesKey">
    <template v-if="mode === 'changes'">
      <button ref="changesBack" type="button" class="signin-link" data-changes="back" @click="show('card')">Back</button>
      <ChangelogBody />
    </template>
    <template v-else>
    <h2 v-if="heading && mode !== 'lost'" class="signin-title">Sign in</h2>

    <!-- The recovery-code form, in the card's place. -->
    <form v-if="mode === 'lost'" class="signin-form" aria-labelledby="signin-recover-h" novalidate @submit.prevent="redeem" @keydown="onFormKey">
      <h2 id="signin-recover-h" class="signin-title">{{ RECOVER_HEADING }}</h2>
      <p>{{ RECOVER_LEAD }}</p>
      <label class="signin-field">
        <span>Username</span>
        <input ref="recoverEl" v-model="recoverName" class="signin-input" type="text" autocomplete="username" spellcheck="false" autocapitalize="off" maxlength="24" :disabled="busy !== ''">
      </label>
      <label class="signin-field">
        <span>Recovery code</span>
        <input v-model="code" class="signin-input signin-code" type="text" autocomplete="one-time-code" spellcheck="false" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX" maxlength="20" :disabled="busy !== ''">
      </label>
      <div class="signin-acts">
        <button type="submit" class="ui-btn is-primary signin-go" :disabled="busy !== '' || !online || !canRedeem" :aria-busy="busy === 'lost' ? 'true' : undefined">
          {{ busy === 'lost' ? 'Checking…' : 'Sign in with the code' }}
        </button>
        <button type="button" class="ui-btn" :disabled="busy !== ''" @click="show('card')">Back</button>
      </div>
      <p v-if="said" :class="said.alert ? 'signin-error' : 'signin-quiet'" :role="said.alert ? 'alert' : 'status'">{{ said.text }}</p>
    </form>

    <template v-else>
      <p class="signin-pitch" :data-signin-from="signInFrom || undefined">{{ signInPitch(signInFrom) }}</p>

      <!-- A new account, first: the filled button, and its username form in its place. -->
      <template v-if="canPasskey">
        <button v-if="mode === 'card'" ref="createEl" type="button" class="ui-btn is-primary signin-go" data-signin="create" :disabled="busy !== '' || !online" @click="show('create')">
          {{ CREATE_ACCOUNT }}
        </button>
        <form v-else class="signin-form is-boxed" aria-label="Create an account" novalidate @submit.prevent="createAccount" @keydown="onFormKey">
          <label class="signin-field">
            <span>Choose a username</span>
            <input
              ref="nameEl"
              v-model="username"
              class="signin-input"
              type="text"
              autocomplete="username"
              spellcheck="false"
              autocapitalize="off"
              maxlength="32"
              aria-describedby="signin-name-hint signin-name-say"
              :aria-invalid="nameSay ? 'true' : undefined"
              :disabled="busy !== ''"
              @input="onNameInput"
              @blur="typing = false"
            >
          </label>
          <p id="signin-name-hint" class="signin-hint">{{ USERNAME_HINT }}</p>
          <p id="signin-name-say" class="signin-error" role="alert">{{ nameSay }}</p>
          <div class="signin-acts">
            <button type="submit" class="ui-btn is-primary" data-signin="create-go" :disabled="busy !== '' || !online || !canCreate" :aria-busy="busy === 'create' ? 'true' : undefined">
              {{ busy === 'create' ? PASSKEY_WAITING : 'Create account' }}
            </button>
            <button type="button" class="ui-btn" :disabled="busy !== ''" @click="show('card')">Cancel</button>
          </div>
        </form>
        <p v-if="said && saidAt === 'create'" :class="said.alert ? 'signin-error' : 'signin-quiet'" :role="said.alert ? 'alert' : 'status'">{{ said.text }}</p>
      </template>
      <p v-else class="signin-note" role="status">{{ noPasskeySay }}</p>

      <!-- The providers: one row each, the first the filled one when there is no passkey button. -->
      <div v-if="offered.length" class="signin-ways">
        <p v-if="canPasskey" class="signin-rule">{{ OTHER_ACCOUNTS }}</p>
        <button
          v-for="(provider, index) in offered"
          :key="provider.id"
          :ref="(el) => { if (index === 0 && !canPasskey) first = el as HTMLButtonElement | null; }"
          type="button"
          class="ui-btn signin-go"
          :class="{ 'is-primary': index === 0 && !canPasskey }"
          :disabled="busy !== '' || !online"
          :aria-busy="busy === provider.id ? 'true' : undefined"
          @click="start(provider)"
        >
          {{ busy === provider.id ? provider.opening : provider.label }}
        </button>
      </div>

      <!-- The passkey, last in the list: a plain button, with the way in for a lost passkey directly under it. -->
      <template v-if="canPasskey">
        <button
          type="button"
          class="ui-btn signin-go"
          data-signin="passkey"
          :disabled="busy !== '' || !online"
          :aria-busy="busy === 'passkey' ? 'true' : undefined"
          @click="signInPasskey"
        >
          {{ busy === 'passkey' ? PASSKEY_WAITING : SIGN_IN_PASSKEY }}
        </button>
        <button ref="lostEl" type="button" class="signin-link" data-signin="lost" :disabled="busy !== ''" @click="show('lost')">{{ LOST_PASSKEY }}</button>
        <p v-if="said && saidAt === 'passkey'" :class="said.alert ? 'signin-error' : 'signin-quiet'" :role="said.alert ? 'alert' : 'status'">{{ said.text }}</p>
      </template>
      <p v-if="!online" class="signin-note" role="status">{{ SIGN_IN_OFFLINE }}</p>
      <p v-else-if="session.error" class="signin-error" role="alert">{{ session.error }}</p>
      <p class="signin-fine">{{ SIGN_IN_FINE }}</p>
    </template>
    <button ref="versionEl" type="button" class="signin-version" data-version @click="show('changes')">Version {{ APP_VERSION }} · What's new</button>
    </template>
  </div>
</template>

<style>
.signin {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 420px;
  color: var(--text-1);
  font: 400 13.5px/1.5 var(--font-text);
}

.signin-title {
  margin: 0;
  color: var(--text-0);
  font: 700 17px/1.3 var(--font-display);
  letter-spacing: 0.02em;
}

.signin p {
  margin: 0;
}

.signin-ways {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signin-go {
  justify-content: center;
  min-height: 38px;
  font-size: 14px;
}

/* Two classes: a page around the card (/account) styles its own paragraphs. */
.signin .signin-hint,
.signin .signin-quiet {
  color: var(--text-muted);
  font-size: 12.5px;
}

.signin .signin-rule {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
}

.signin-rule::before,
.signin-rule::after {
  flex: 1;
  height: 1px;
  background: var(--line-1);
  content: "";
}

.signin-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signin-form.is-boxed {
  padding: 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
}

.signin-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-1);
  font: 600 12.5px/1.4 var(--font-text);
}

/* The card's own field, so it looks the same wherever the card is: the pop-up, a panel, or /account. */
.signin-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
}

.signin-input::placeholder {
  color: var(--text-muted);
}

.signin-input:focus-visible {
  outline: none;
  border-color: var(--signal);
  box-shadow: 0 0 0 2px var(--signal-glow);
}

.signin-input[aria-invalid="true"] {
  border-color: var(--attention);
}

.signin-code {
  font-family: var(--font-code);
  letter-spacing: 0.06em;
}

.signin-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* A plain link in the card's own type: the way in for a person who has lost their passkey. */
.signin-link {
  align-self: flex-start;
  margin: 0;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 400 12.5px/1.4 var(--font-text);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.signin-link:disabled {
  opacity: 0.6;
  cursor: default;
}

.signin .signin-note,
.signin .signin-error {
  color: var(--attention);
  font-size: 12.5px;
}

.signin-error:empty {
  display: none;
}

.signin .signin-fine {
  color: var(--text-muted);
  font-size: 12px;
}

/* The app's version, last in the card. Same look as the store's text links. */
.signin .signin-version {
  display: block;
  width: 100%;
  margin: -4px 0 0;
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

.signin .signin-version:hover {
  color: var(--signal-bright);
}

/* The changelog replaces this card. The list scrolls so Back stays on screen. */
.signin .changes-body {
  max-height: calc(100vh - 140px);
  overflow: auto;
}
</style>
