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
