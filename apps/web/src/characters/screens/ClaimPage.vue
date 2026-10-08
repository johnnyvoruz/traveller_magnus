<script setup lang="ts">
/**
 * The page a share link opens. Signed out, it offers sign-in and comes back here.
 * Signed in, one press claims the character and opens it. A used, expired or revoked link says so.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadSession, session, signIn } from '../../account/session.ts';
import { atPane } from '../../shell/pane.ts';
import { registerCommand } from '../../shell/registry.ts';
import { characters, claim } from './client.ts';
import { claimFace, claimRefusal, type ClaimOutcome } from './model.ts';

const route = useRoute();
const router = useRouter();
const checked = ref(false);
const outcome = ref<ClaimOutcome>('ready');
const busy = ref(false);
let stopCommands: (() => void) | null = null;

const token = computed(() => {
    const raw = route.params.token;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' ? value : '';
});

const signedIn = computed(() => session.user !== null);
const face = computed(() => claimFace(checked.value && signedIn.value, outcome.value));

function returnPath(): string {
    return route.fullPath.startsWith('/claim/') ? route.fullPath : '/claim/' + encodeURIComponent(token.value);
}

async function startSignIn(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
        await signIn(fetch, returnPath());
    } finally {
        if (session.error) busy.value = false;
    }
}

async function take(): Promise<void> {
    if (busy.value || !signedIn.value || outcome.value !== 'ready') return;
    if (!token.value) {
        outcome.value = 'missing';
        return;
    }
    busy.value = true;
    try {
        const result = await claim(token.value);
        if (!result) {
            outcome.value = claimRefusal('', characters.error);
            return;
        }
        outcome.value = 'claimed';
        await router.push(atPane('/', {}, { kind: 'characters', character: result.characterId }));
    } finally {
        busy.value = false;
    }
}

function bindCommands(): void {
    if (stopCommands) stopCommands();
    stopCommands = null;
    if (!checked.value) return;
    if (!signedIn.value) {
        stopCommands = registerCommand({ id: 'character-claim-sign-in', name: 'Sign in to claim', run: () => { void startSignIn(); } });
        return;
    }
    if (outcome.value === 'ready') {
        stopCommands = registerCommand({ id: 'character-claim', name: 'Claim this character', run: () => { void take(); } });
    }
}

watch([checked, signedIn, outcome], bindCommands);

onMounted(() => {
    void loadSession().then(() => {
        checked.value = true;
        if (!token.value) outcome.value = 'missing';
        bindCommands();
    });
});

onBeforeUnmount(() => {
    if (stopCommands) stopCommands();
});
</script>

<template>
  <main class="claim-page">
    <section class="claim-card" :aria-label="face.title">
      <h1>{{ face.title }}</h1>
      <p v-if="!checked">Checking the session.</p>
      <p v-else>{{ face.line }}</p>
      <p v-if="session.error" class="claim-trouble" role="alert">{{ session.error }}</p>
      <button
        v-if="checked && face.state === 'signed-out'"
        type="button"
        class="ui-btn is-primary"
        data-command="character-claim-sign-in"
        :disabled="busy"
        @click="startSignIn"
      >{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      <button
        v-else-if="checked && face.state === 'ready'"
        type="button"
        class="ui-btn is-primary"
        data-command="character-claim"
        :disabled="busy"
        @click="take"
      >{{ busy ? 'Claiming…' : 'Claim' }}</button>
      <a v-else-if="checked && face.state === 'refused'" class="ui-btn" href="/">Back to the map</a>
    </section>
  </main>
</template>

<style>
.claim-page {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-0);
  color: var(--text-1);
}

.claim-card {
  box-sizing: border-box;
  width: min(420px, 100%);
  padding: 24px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-4);
  background: var(--panel-raised);
}

.claim-card h1 {
  margin: 0 0 8px;
  color: var(--text-0);
  font: 500 22px/1.3 var(--font-display);
}

.claim-card p {
  margin: 0 0 16px;
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
}

.claim-trouble {
  color: var(--danger);
}
</style>
