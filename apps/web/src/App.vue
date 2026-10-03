<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { APP_VERSION } from './version';

type Me = { id: string; email: string | null; role: string; profile: { handle: string; displayName: string } | null };

const me = ref<Me | null>(null);
const busy = ref(false);
const error = ref('');

async function loadMe() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (res.ok) {
      const body = await res.json();
      me.value = body.data as Me;
    } else {
      me.value = null;
    }
  } catch {
    me.value = null;
  }
}

async function signIn() {
  busy.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'twitter', callbackURL: '/' }),
    });
    const body = await res.json();
    if (res.ok && body.url) {
      location.assign(body.url);
      return;
    }
    error.value = body.message || body.error?.message || 'Sign-in is not available.';
  } catch {
    error.value = 'Sign-in is not available.';
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  busy.value = true;
  try {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin' });
  } finally {
    busy.value = false;
    await loadMe();
  }
}

onMounted(loadMe);
</script>

<template>
  <main class="holding">
    <h1>Traveller.voyage</h1>
    <p>A mapping engine and orbit engine for Traveller. Opening soon.</p>

    <section class="account">
      <template v-if="me">
        <p class="who">
          Signed in as <span class="handle">{{ me.profile?.handle ?? me.id }}</span>
          <span class="role">{{ me.role }}</span>
        </p>
        <button type="button" class="btn" :disabled="busy" @click="signOut">Sign out</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="signIn">Sign in with X</button>
      </template>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <p class="ver">{{ APP_VERSION }}</p>
  </main>
</template>

<style>
.holding {
  min-height: 100vh;
  margin: 0;
  background: var(--bg-0);
  color: var(--text-1);
  font-family: var(--font-text);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--sp-3);
}
h1 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  color: var(--signal);
  letter-spacing: 0.06em;
}
p {
  margin: 0;
  color: var(--text-2);
}
.account {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
}
.who {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.handle {
  font-family: var(--font-data);
  color: var(--signal);
}
.role {
  font-family: var(--font-display);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  border: 1px solid var(--line-1);
  border-radius: var(--r-pill);
  padding: 2px var(--sp-2);
}
.btn {
  font-family: var(--font-text);
  font-size: 14px;
  color: var(--text-1);
  background: transparent;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-2);
  padding: var(--sp-2) var(--sp-4);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
}
.btn:hover {
  background: var(--surface-2);
  border-color: var(--signal);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn-primary {
  background: var(--signal);
  color: var(--bg-0);
  border-color: var(--signal);
}
.btn-primary:hover {
  background: var(--signal-bright);
  border-color: var(--signal-bright);
}
.err {
  color: var(--attention);
  font-size: 12px;
}
.ver {
  font-family: var(--font-data);
  color: var(--text-muted);
}
</style>
