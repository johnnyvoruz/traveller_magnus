<script setup lang="ts">
/**
 * The sign-in card, as the pop-up at the rail's foot, the Campaign and Characters panels and
 * /account place it. The card itself (workspace/passkey/SignInBody.vue) is its own chunk, so
 * nothing of sign-in rides in the first one; it loads when a card is first shown. A focus asked
 * for before it arrives is handed on when it mounts.
 */
import { defineAsyncComponent, ref } from 'vue';

const SignInBody = defineAsyncComponent(() => import('./passkey/SignInBody.vue'));

defineProps<{
    /** The pop-up carries its own heading; the panel's header already names the place. */
    heading?: boolean;
}>();

const body = ref<{ focus: () => void } | null>(null);
let wanted = false;

function ready(): void {
    if (!wanted || !body.value) return;
    wanted = false;
    body.value.focus();
}

defineExpose({
    focus: () => {
        if (body.value) body.value.focus();
        else wanted = true;
    },
});
</script>

<template>
  <!-- The height of a short card is held while its chunk loads, so the pop-up doesn't jump. -->
  <div class="signin-slot">
    <SignInBody ref="body" :heading="heading" @ready="ready" />
  </div>
</template>

<style>
.signin-slot {
  min-height: 120px;
}
</style>
