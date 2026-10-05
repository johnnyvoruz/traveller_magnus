<script setup lang="ts">
/**
 * The pop-up at the rail's foot (design §1). Signed out it is the sign-in card; signed in it
 * is the account menu: who, the campaign, sign out. It opens over the map and nothing waits
 * on it; a click anywhere else, or Esc, closes it and focus goes back to the rail's button.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { session, signOut } from '../account/session.ts';
import { resetCampaign } from '../campaign/commit.ts';
import Icon from '../design/Icon.vue';
import { accountLine, displayName, initials } from './account.ts';
import { forgetDeleted } from './actions.ts';
import SignInCard from './SignInCard.vue';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
    close: [];
    /** Open the Campaign panel. */
    campaign: [];
}>();

const card = ref<{ focus: () => void } | null>(null);
const menu = ref<HTMLElement | null>(null);
const leaving = ref(false);

const name = computed(() => displayName(session.user));
const line = computed(() => accountLine(session.user));
const mark = computed(() => initials(session.user));

function items(): HTMLElement[] {
    return menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

function focusFirst(): void {
    if (session.user) {
        const list = items();
        if (list[0]) list[0].focus();
    } else if (card.value) {
        card.value.focus();
    }
}

/** Up and Down walk the menu and wrap; Home and End jump. */
function onMenuKey(event: KeyboardEvent): void {
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(event.target as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (event.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    event.stopPropagation();
    list[next].focus();
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    emit('close');
}

async function leave(): Promise<void> {
    if (leaving.value) return;
    leaving.value = true;
    try {
        await signOut();
        // The next person at this browser must not see this one's campaign.
        resetCampaign();
        forgetDeleted();
    } finally {
        leaving.value = false;
        emit('close');
    }
}

watch(() => props.open, (open) => {
    if (open) void nextTick(focusFirst);
});
</script>

<template>
  <div v-if="open" class="account-backdrop" @click="$emit('close')"></div>
  <section
    v-if="open"
    id="account-pop"
    class="account-pop"
    :class="{ 'is-menu': session.user !== null }"
    :aria-label="session.user ? 'Account' : 'Sign in'"
    @keydown="onKey"
  >
    <template v-if="session.user">
      <div class="account-who">
        <span class="account-mark is-large" aria-hidden="true">{{ mark }}</span>
        <div>
          <b>{{ name }}</b>
          <span v-if="line">{{ line }}</span>
        </div>
      </div>
      <div ref="menu" class="account-items" role="menu" aria-label="Account" @keydown="onMenuKey">
        <button type="button" role="menuitem" @click="$emit('campaign')">
          <Icon name="book-sparkles" :size="15" /><span>Campaign</span><em>yours</em>
        </button>
        <button type="button" role="menuitem" :disabled="leaving" @click="leave">
          <Icon name="arrow-left" :size="15" /><span>{{ leaving ? 'Signing out…' : 'Sign out' }}</span>
        </button>
      </div>
    </template>
    <SignInCard v-else ref="card" heading />
  </section>
</template>

<style>
.account-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8;
}

/* Anchored to the rail's foot, clear of the rail whether it is collapsed or expanded. */
.account-pop {
  position: absolute;
  left: calc(var(--rail-width) + var(--chrome-inset));
  bottom: var(--chrome-inset);
  z-index: 9;
  box-sizing: border-box;
  width: min(330px, calc(100vw - var(--rail-width) - 2 * var(--chrome-inset)));
  padding: 16px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-4);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13.5px/1.5 var(--font-text);
  animation: account-pop-in var(--t-fast) var(--ease-out) both;
}

.account-pop.is-menu {
  width: min(300px, calc(100vw - var(--rail-width) - 2 * var(--chrome-inset)));
  padding: 8px;
}

@keyframes account-pop-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

.account-who {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--line-1);
  margin-bottom: 6px;
}

.account-who div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.account-who b {
  color: var(--text-0);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.account-who span {
  color: var(--text-muted);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

/* The user's initials: on the rail's button and, larger, at the head of the menu. */
.account-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-pill);
  background: var(--wash);
  color: var(--signal);
  font: 700 12px/1 var(--font-text);
  letter-spacing: 0.04em;
}

.account-mark.is-large {
  width: 40px;
  height: 40px;
  font-size: 14px;
}

.account-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-items button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 14px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out);
}

.account-items button:hover,
.account-items button:focus-visible {
  background: var(--row-active);
}

.account-items button:focus-visible {
  outline-offset: -2px;
}

.account-items button:disabled {
  opacity: 0.6;
  cursor: default;
}

.account-items .ui-icon {
  flex: 0 0 16px;
  color: var(--signal);
}

.account-items em {
  margin-left: auto;
  color: var(--text-muted);
  font: 400 12px/1 var(--font-text);
}

@media (prefers-reduced-motion: reduce) {
  .account-pop {
    animation: none;
  }

  .account-items button {
    transition: none;
  }
}
</style>
