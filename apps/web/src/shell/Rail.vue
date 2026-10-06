<script setup lang="ts">
/**
 * The icon rail (legacy #app-nav, hex_map.html 1320-1345, style.css 2030-2053): icons when
 * collapsed, labels when expanded, the active item marked. Expanded, it pushes the rest of the
 * shell aside (MapView sets --rail-width from its state). Every item runs a command from
 * the registry; the rail holds no behaviour of its own beyond expanding.
 *
 * The foot button is the account (findings/campaign_workspace_design.md §1): "Sign in" while
 * signed out, the user's initials once signed in. It never waits on the session: until the
 * session is known it is the signed-out button.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { session } from '../account/session.ts';
import Icon from '../design/Icon.vue';
import { displayName, initials } from '../workspace/account.ts';
import { commands } from './registry.ts';

withDefaults(defineProps<{
    /** The system panel is showing. */
    panelOpen: boolean;
    /** The omnibox list is showing. */
    searchOpen: boolean;
    /** The Campaign panel is showing. */
    campaignOpen?: boolean;
    /** The account pop-up is showing. */
    accountOpen?: boolean;
}>(), { campaignOpen: false, accountOpen: false });

const accountButton = ref<HTMLButtonElement | null>(null);
const mark = computed(() => initials(session.user));
const who = computed(() => displayName(session.user));

defineExpose({ focusAccount: () => { if (accountButton.value) accountButton.value.focus(); } });

const expanded = ref(false);
const ready = ref(0);

function findCommand(id: string) {
    void ready.value;
    return commands().find((item) => item.id === id);
}

/** An item is offered only where its command exists (the orbit view has no search field). */
function has(id: string): boolean {
    return findCommand(id) !== undefined;
}

function canRun(id: string): boolean {
    const command = findCommand(id);
    if (!command) return false;
    return command.runnable ? command.runnable() : true;
}

function run(id: string): void {
    const command = findCommand(id);
    if (!command || !canRun(id)) return;
    command.run();
}

/** A tooltip with the command's first shortcut, read from the registry once it is filled. */
function hint(id: string, label: string): string {
    void ready.value;
    const command = commands().find((item) => item.id === id);
    const key = command && command.keys ? command.keys[0] : '';
    return key ? label + ' (' + key + ')' : label;
}

onMounted(() => {
    // Commands register in the parents' mounted hooks, which run after this one.
    void nextTick(() => { ready.value += 1; });
});
</script>

<template>
  <nav class="rail" :class="{ 'is-expanded': expanded }" aria-label="Workspace navigation">
    <button
      type="button"
      class="rail-item"
      :aria-label="expanded ? 'Collapse navigation' : 'Expand navigation'"
      :title="expanded ? 'Collapse navigation' : 'Expand navigation'"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="expanded = !expanded"
    >
      <Icon name="bars" :size="20" />
      <span class="rail-label">{{ expanded ? 'Collapse navigation' : 'Expand navigation' }}</span>
    </button>
    <div class="rail-scroll">
      <div class="rail-group" role="group" aria-label="Explore">
        <button type="button" class="rail-item" aria-label="Map" :title="hint('home', 'Map')" @click="run('home')">
          <Icon name="map" :size="20" />
          <span class="rail-label">Map</span>
        </button>
        <button
          type="button"
          class="rail-item"
          aria-label="System"
          :title="panelOpen ? 'System' : 'System: select a world on the map'"
          :aria-expanded="panelOpen ? 'true' : 'false'"
          :disabled="!canRun('system-panel')"
          @click="run('system-panel')"
        >
          <Icon name="planet-ringed" :size="20" />
          <span class="rail-label">System</span>
        </button>
        <button
          v-if="has('campaign')"
          type="button"
          class="rail-item"
          aria-label="Campaign"
          title="Campaign"
          :aria-expanded="campaignOpen ? 'true' : 'false'"
          @click="run('campaign')"
        >
          <Icon name="book-sparkles" :size="20" />
          <span class="rail-label">Campaign</span>
        </button>
      </div>
    </div>
    <div class="rail-group" role="group" aria-label="Account">
      <button
        v-if="has('account')"
        ref="accountButton"
        type="button"
        class="rail-item rail-account"
        :aria-label="session.user ? 'Account: ' + who : 'Sign in'"
        :title="session.user ? 'Account: ' + who : 'Sign in'"
        aria-haspopup="true"
        aria-controls="account-pop"
        :aria-expanded="accountOpen ? 'true' : 'false'"
        @click="run('account')"
      >
        <span v-if="session.user && mark" class="account-mark" aria-hidden="true">{{ mark }}</span>
        <Icon v-else name="user" :size="20" />
        <span class="rail-label">{{ session.user ? who : 'Sign in' }}</span>
      </button>
    </div>
  </nav>
</template>

<style>
.rail {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 5px;
  box-sizing: border-box;
  width: var(--rail-width);
  padding: 10px 7px;
  overflow: hidden;
  background: var(--rail-glass);
  border-right: 1px solid var(--line-1);
  box-shadow: var(--shadow-rail);
  color: var(--rail-text);
  font: 400 12px/1.2 var(--font-text);
  transition: width var(--t-rail) ease;
}

.rail.is-expanded {
  width: var(--rail-width-open);
}

/* The rail never shows a scrollbar; wheel and keyboard still scroll a long list. */
.rail-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}

.rail-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.rail-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 0;
  border-top: 1px solid var(--line-1);
}

/* 14.5px of left padding centres the 22px icon in the collapsed button, so expanding does not move it. */
.rail-item {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 40px;
  margin: 0;
  padding: 9px 12px 9px 14.5px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.rail-item:disabled {
  opacity: 0.35;
  cursor: default;
}

.rail-item:not(:disabled):hover {
  background: var(--rail-hover);
  color: var(--text-0);
}

.rail-item[aria-expanded="true"],
.rail-item[aria-pressed="true"] {
  background: var(--row-active);
  border-color: var(--row-active-line);
  color: var(--signal-active);
}

.rail-item:focus-visible {
  outline-offset: -2px;
}

.rail-item .ui-icon {
  flex: 0 0 22px;
  width: 22px;
  height: 20px;
  color: var(--rail-icon);
}

.rail-item[aria-expanded="true"] .ui-icon,
.rail-item[aria-pressed="true"] .ui-icon {
  color: var(--signal-bright);
}

/* The initials sit where the icon sits, so signing in does not move the button's contents. */
.rail-account .account-mark {
  margin: 0 -2px;
}

.rail-label {
  min-width: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity var(--t-rail) ease;
}

.rail.is-expanded .rail-label {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .rail,
  .rail-item,
  .rail-label {
    transition: none;
  }
}
</style>
