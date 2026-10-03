<script setup lang="ts">
</script>

<template>
  <main class="design-placeholder">
    <h1>Design</h1>
    <p>The design-system page arrives with chart detail.</p>
  </main>
</template>

<style>
.design-placeholder {
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
.design-placeholder h1 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  color: var(--signal);
  letter-spacing: 0.06em;
}
.design-placeholder p {
  margin: 0;
  color: var(--text-muted);
}
</style>
