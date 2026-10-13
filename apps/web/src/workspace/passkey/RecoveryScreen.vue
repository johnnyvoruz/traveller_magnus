<script setup lang="ts">
/**
 * A session from a recovery code (findings/passkey_screens_design.md §4). It can do two things:
 * add a passkey, or sign out. Nothing else is reachable. Once a passkey is added, the session is
 * a normal one: the screen says how many codes are left and offers new ones.
 */
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { resetCampaign } from '../../campaign/commit.ts';
import { forgetDeleted } from '../actions.ts';
import { forgetOpening } from '../opening.ts';
import { regenerateRecoveryCodes } from '../../account/passkey.ts';
import { session, signOut } from '../../account/session.ts';
import CodesBlock from './CodesBlock.vue';
import { returnPath } from './recovery.ts';
import PasskeyAdd from './PasskeyAdd.vue';
import { NEW_CODES_OFFER, NOT_REACHED, PASSKEY_ADDED, RECOVERY_DO, RECOVERY_HEADING, RECOVERY_USED, unusedWords } from './words.ts';

const emit = defineEmits<{ signedOut: [] }>();
const router = useRouter();

const step = ref<'add' | 'added' | 'codes'>('add');
const unused = ref<number | null>(null);
const username = ref('');
const codes = ref<string[]>([]);
const busy = ref(false);
const said = ref('');
const heading = ref<HTMLElement | null>(null);

function focusHeading(): void {
    void nextTick(() => { if (heading.value) heading.value.focus(); });
}

/** The passkey is verified and the session read again (account/passkey.ts does both): it is a normal one now. */
function added(): void {
    step.value = 'added';
    focusHeading();
    const user = session.user;
    if (user) {
        unused.value = user.unusedRecoveryCodes;
        username.value = user.username || '';
    }
}

async function newCodes(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    said.value = '';
    try {
        const done = await regenerateRecoveryCodes();
        if (!done.ok) {
            said.value = done.message || NOT_REACHED;
            return;
        }
        codes.value = done.codes;
        step.value = 'codes';
        focusHeading();
    } finally {
        busy.value = false;
    }
}

async function leave(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    said.value = '';
    try {
        const done = await signOut();
        if (!done.ok) {
            said.value = done.message || NOT_REACHED;
            return;
        }
        resetCampaign();
        forgetDeleted();
        forgetOpening();
        emit('signedOut');
    } finally {
        busy.value = false;
    }
}

function toMap(): void {
    codes.value = [];
    void router.push(returnPath());
}

onMounted(focusHeading);
</script>

<template>
  <section class="pk-page-body" aria-labelledby="pk-recovery-h" data-recovery-screen>
    <template v-if="step === 'add'">
      <h1 id="pk-recovery-h" ref="heading" class="pk-h1" tabindex="-1">{{ RECOVERY_HEADING }}</h1>
      <p>{{ RECOVERY_USED }}</p>
      <p>{{ RECOVERY_DO }}</p>
      <PasskeyAdd placeholder="For example, Laptop" focus @added="added" />
      <div class="pk-foot">
        <button type="button" class="pk-link" data-recovery="sign-out" :disabled="busy" @click="leave">{{ busy ? 'Signing out…' : 'Sign out' }}</button>
        <p v-if="said" class="pk-alert" role="alert">{{ said }}</p>
      </div>
    </template>
    <template v-else-if="step === 'added'">
      <h1 id="pk-recovery-h" ref="heading" class="pk-h1" tabindex="-1">{{ PASSKEY_ADDED }}</h1>
      <p v-if="unused !== null">{{ unusedWords(unused) }}</p>
      <p>{{ NEW_CODES_OFFER }}</p>
      <div class="pk-acts">
        <button type="button" class="ui-btn" data-recovery="new-codes" :disabled="busy" @click="newCodes">{{ busy ? 'Making codes…' : 'Make new codes' }}</button>
        <button type="button" class="ui-btn is-primary" @click="toMap">Go to the map</button>
      </div>
      <p v-if="said" class="pk-alert" role="alert">{{ said }}</p>
    </template>
    <template v-else>
      <h1 id="pk-recovery-h" ref="heading" class="pk-h1" tabindex="-1">Your new recovery codes</h1>
      <p>Your old codes no longer work. Save these now: this is the only time they’re shown.</p>
      <CodesBlock :codes="codes" :username="username" />
      <div class="pk-acts">
        <button type="button" class="ui-btn is-primary" @click="toMap">Go to the map</button>
      </div>
    </template>
  </section>
</template>
