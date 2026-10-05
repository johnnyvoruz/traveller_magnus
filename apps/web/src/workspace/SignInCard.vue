<script setup lang="ts">
/**
 * What signing in gives, and the one button that does it (design §1). Shown in the pop-up at
 * the rail's foot and in the Campaign panel while signed out. A failed sign-in says so here,
 * in the session's own words, and leaves the button live.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { session, signIn } from '../account/session.ts';
import { isOnline, onOnlineChange } from '../platform/browser.ts';
import { SIGN_IN_FINE, SIGN_IN_FREE, SIGN_IN_LABEL, SIGN_IN_OFFLINE, SIGN_IN_PITCH } from './account.ts';

defineProps<{
    /** The pop-up carries its own heading; the panel's header already names the place. */
    heading?: boolean;
}>();

const busy = ref(false);
const online = ref(true);
const button = ref<HTMLButtonElement | null>(null);
let stopOnline: (() => void) | null = null;

async function start(): Promise<void> {
    if (busy.value || !online.value) return;
    busy.value = true;
    try {
        // On success the page leaves for X; the button stays busy until it does.
        await signIn();
    } finally {
        if (session.error) busy.value = false;
    }
}

onMounted(() => {
    online.value = isOnline();
    stopOnline = onOnlineChange((now) => { online.value = now; });
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
    <button
      ref="button"
      type="button"
      class="ui-btn is-primary signin-go"
      :disabled="busy || !online"
      :aria-busy="busy ? 'true' : undefined"
      @click="start"
    >
      {{ busy ? 'Opening X…' : SIGN_IN_LABEL }}
    </button>
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
