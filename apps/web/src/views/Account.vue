<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { loadSession, session, signIn, signOut } from '../account/session.ts';
import { APP_VERSION } from '../version';

const busy = ref(false);

async function onSignIn() {
  busy.value = true;
  try {
    await signIn();
  } finally {
    busy.value = false;
  }
}

async function onSignOut() {
  busy.value = true;
  try {
    await signOut();
  } finally {
    busy.value = false;
  }
}

onMounted(() => { void loadSession(); });
</script>

<template>
  <main class="holding">
    <h1>Traveller.voyage</h1>
    <p>A mapping engine and orbit engine for Traveller. Opening soon.</p>

    <section class="account">
      <template v-if="session.user">
        <p class="who">
          Signed in as <span class="handle">{{ session.user.profile?.handle ?? session.user.id }}</span>
          <span class="role">{{ session.user.role }}</span>
        </p>
        <button type="button" class="btn" :disabled="busy" @click="onSignOut">Sign out</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="onSignIn">Sign in with X</button>
      </template>
      <p v-if="session.error" class="err">{{ session.error }}</p>
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
