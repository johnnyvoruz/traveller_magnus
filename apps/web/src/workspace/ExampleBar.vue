<script setup lang="ts">
/**
 * The banner across the Campaign panel while it shows the example campaign (DL8): what this is, a
 * Create an account link (it leaves the example and opens the account panel's sign-up), and a way
 * out that puts the panel back as it was.
 */
import { useRouter } from 'vue-router';
import { session } from '../account/session.ts';
import { EXAMPLE_BANNER, leaveExample } from './example_campaign.ts';

const router = useRouter();

function createAccount(): void {
    void leaveExample(router, { path: '/', query: { panel: 'account' } });
}

function leave(): void {
    void leaveExample(router);
}
</script>

<template>
  <div class="example-bar" role="status" data-example-bar>
    <p class="example-bar-text">{{ EXAMPLE_BANNER }}</p>
    <div class="example-bar-acts">
      <button v-if="!session.user" type="button" class="example-bar-link" data-example-create @click="createAccount">Create an account</button>
      <button type="button" class="ui-btn" data-example-leave @click="leave">Leave the example</button>
    </div>
  </div>
</template>

<style>
.example-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin: -4px 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--signal-dim);
  border-left: 3px solid var(--signal);
  border-radius: var(--r-3);
  background: var(--wash-faint);
}

.example-bar-text {
  flex: 1 1 220px;
  margin: 0;
  color: var(--text-0);
  font: 500 13.5px/1.45 var(--font-text);
}

.example-bar-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.example-bar-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 600 13px/1.4 var(--font-text);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.example-bar-link:hover,
.example-bar-link:focus-visible {
  color: var(--signal-bright);
}

@media (max-width: 599px) {
  .example-bar-acts .ui-btn,
  .example-bar-link {
    min-height: 44px;
  }
}
</style>
