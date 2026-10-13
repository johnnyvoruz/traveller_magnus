<script setup lang="ts">
/**
 * /account. The router loads this view with the first chunk, so it stays thin: the page itself
 * (workspace/passkey/AccountPage.vue) and the passkey client arrive as their own chunk when
 * the page is opened.
 */
import { defineAsyncComponent, onMounted } from 'vue';
import { loadSession } from '../account/session.ts';

const AccountPage = defineAsyncComponent(() => import('../workspace/passkey/AccountPage.vue'));

onMounted(() => { void loadSession(); });
</script>

<template>
  <AccountPage />
</template>

<style>
/*
 * These two rules were this view's when it was the holding page. The view is in the first
 * chunk, so they have reached every screen since; they stay until base.css takes them over.
 */
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
</style>
