<script setup lang="ts">
/**
 * What signing in gives, and a button for each provider the server has switched on (X, Discord,
 * Google). The server is asked once which it has; until it answers, and when it cannot, the
 * card offers X alone, as it always did (design §1). Shown in the pop-up at
 * the rail's foot and in the Campaign panel while signed out. A failed sign-in says so here,
 * in the session's own words, and leaves the button live.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { session, signIn } from '../account/session.ts';
import { apiFetch } from '../platform/http.ts';
import { isOnline, onOnlineChange } from '../platform/browser.ts';
import { offeredProviders, readProviders, SIGN_IN_FINE, SIGN_IN_FREE, SIGN_IN_OFFLINE, SIGN_IN_PITCH, type SignInProvider } from './account.ts';

defineProps<{
    /** The pop-up carries its own heading; the panel's header already names the place. */
    heading?: boolean;
}>();

/** The id of the provider being opened; empty when none is. */
const busy = ref('');
const offered = ref<SignInProvider[]>(offeredProviders(null));
const online = ref(true);
const button = ref<HTMLButtonElement | null>(null);
let stopOnline: (() => void) | null = null;

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

onMounted(() => {
    online.value = isOnline();
    stopOnline = onOnlineChange((now) => { online.value = now; });
    void readProviders((url) => apiFetch(fetch, url)).then((ids) => { offered.value = offeredProviders(ids); });
});

onBeforeUnmount(() => {
    if (stopOnline) stopOnline();
});

defineExpose({ focus: () => { if (button.value) button.value.focus(); } });
</script>

<template>
  <div class="signin">
    <h2 v-if="heading" class="signin-title">Sign in</h2>
    <p class="signin-pitch">{{ SIGN_IN_PITCH }} {{ SIGN_IN_FREE }}</p>
    <!-- One row a provider, the height held for one before the server has answered. The first is the filled one. -->
    <div class="signin-ways">
      <button
        v-for="(provider, index) in offered"
        :key="provider.id"
        :ref="(el) => { if (index === 0) button = el as HTMLButtonElement | null; }"
        type="button"
        class="ui-btn signin-go"
        :class="{ 'is-primary': index === 0 }"
        :disabled="busy !== '' || !online"
        :aria-busy="busy === provider.id ? 'true' : undefined"
        @click="start(provider)"
      >
        {{ busy === provider.id ? provider.opening : provider.label }}
      </button>
      <p v-if="offered.length === 0" class="signin-note" role="status">Sign-in is not switched on here.</p>
    </div>
    <p v-if="!online" class="signin-note" role="status">{{ SIGN_IN_OFFLINE }}</p>
    <p v-else-if="session.error" class="signin-error" role="alert">{{ session.error }}</p>
    <p class="signin-fine">{{ SIGN_IN_FINE }}</p>
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
  font: 700 17px/1.3 var(--font-text);
}

.signin p {
  margin: 0;
}

.signin-ways {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 38px;
}

.signin-go {
  justify-content: center;
  min-height: 38px;
  font-size: 14px;
}

.signin-note,
.signin-error {
  color: var(--attention);
  font-size: 12.5px;
}

.signin-fine {
  color: var(--text-muted);
  font-size: 12px;
}
</style>
