<script setup lang="ts">
/**
 * The icon rail (legacy #app-nav, hex_map.html 1320-1345, style.css 2030-2053): icons when
 * collapsed, labels when expanded, the active item marked. Expanded, it pushes the rest of the
 * shell aside (.app sets --rail-width while the rail is expanded). Every item runs a command from
 * the registry; the rail holds no behaviour of its own beyond expanding.
 *
 * The foot button is the account (findings/campaign_workspace_design.md §1): "Sign in" while
 * signed out, the user's initials once signed in. It never waits on the session: until the
 * session is known it is the signed-out button.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { loadSession, session } from '../account/session.ts';
import Icon from '../design/Icon.vue';
import { displayName, initials, signInFrom } from '../workspace/account.ts';
import { commands } from './registry.ts';

const props = withDefaults(defineProps<{
    /** The system panel is showing. */
    panelOpen: boolean;
    /** The omnibox list is showing. */
    searchOpen: boolean;
    /** The Campaign panel is showing. */
    campaignOpen?: boolean;
    /** The account pop-up is showing. */
    accountOpen?: boolean;
    /** Build can be switched on here: signed in, with a universe open. */
    buildOffered?: boolean;
    /** The Build switch is on. */
    buildOn?: boolean;
}>(), { campaignOpen: false, accountOpen: false, buildOffered: false, buildOn: false });

const accountButton = ref<HTMLButtonElement | null>(null);
const campaignButton = ref<HTMLButtonElement | null>(null);
const systemButton = ref<HTMLButtonElement | null>(null);
const mark = computed(() => initials(session.user));
const who = computed(() => displayName(session.user));

defineExpose({
    focusAccount: () => { if (accountButton.value) accountButton.value.focus(); },
    focusCampaign: () => { if (campaignButton.value) campaignButton.value.focus(); },
    focusSystem: () => { if (systemButton.value) systemButton.value.focus(); },
});

const expanded = ref(false);
/** The locked item with keyboard focus, so its reason is on screen and not only in a tooltip. */
const lockFocus = ref<'campaign' | 'build' | ''>('');
const ready = ref(0);
/** False until /api/me has answered. A signed-in person must not see Campaign and Build switched off first. */
const sessionKnown = ref(session.user !== null);

/** What the two items do today, and the step that unlocks them. */
const CAMPAIGN_LOCK = 'Campaign: sign in to keep records, a party, and a journal.';
const BUILD_LOCK = 'Build: sign in to generate systems and sectors on your map.';

/** Signed out, and we know it: Campaign and Build stay in the list, switched off. The account command opens the sign-in card. */
const lockedGuest = computed(() => sessionKnown.value && session.user === null && has('account'));

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

/** A switched-off item: say why, then open the sign-in card if it is not already open. */
function onLocked(which: 'campaign' | 'build'): void {
    lockFocus.value = which;
    if (!expanded.value) expanded.value = true;
    signInFrom.value = which === 'build' ? 'build' : null;
    if (!props.accountOpen) run('account');
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
    void loadSession().then(() => { sessionKnown.value = true; });
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
          ref="systemButton"
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
          v-if="lockedGuest || has('campaign')"
          ref="campaignButton"
          type="button"
          class="rail-item"
          :class="{ 'is-locked': lockedGuest }"
          :aria-label="lockedGuest ? CAMPAIGN_LOCK : 'Campaign'"
          :title="lockedGuest ? CAMPAIGN_LOCK : 'Campaign'"
          :aria-disabled="lockedGuest ? 'true' : undefined"
          :aria-describedby="lockedGuest ? 'rail-why-campaign' : undefined"
          :aria-expanded="lockedGuest ? undefined : (campaignOpen ? 'true' : 'false')"
          @focus="lockFocus = 'campaign'"
          @blur="lockFocus = ''"
          @click="lockedGuest ? onLocked('campaign') : run('campaign')"
        >
          <Icon name="book-sparkles" :size="20" />
          <span class="rail-label">
            Campaign
            <span v-if="lockedGuest" id="rail-why-campaign" class="rail-why">{{ CAMPAIGN_LOCK }}</span>
          </span>
          <span v-if="lockedGuest && !expanded && lockFocus === 'campaign'" class="rail-pop" role="status">{{ CAMPAIGN_LOCK }}</span>
        </button>
        <button
          v-if="lockedGuest || buildOffered"
          type="button"
          class="rail-item"
          :class="{ 'is-locked': lockedGuest }"
          :aria-label="lockedGuest ? BUILD_LOCK : 'Build'"
          :title="lockedGuest ? BUILD_LOCK : hint('build', buildOn ? 'Build: on' : 'Build: generate and remove systems on your map')"
          :aria-disabled="lockedGuest ? 'true' : undefined"
          :aria-describedby="lockedGuest ? 'rail-why-build' : undefined"
          :aria-pressed="lockedGuest ? undefined : (buildOn ? 'true' : 'false')"
          @focus="lockFocus = 'build'"
          @blur="lockFocus = ''"
          @click="lockedGuest ? onLocked('build') : run('build')"
        >
          <Icon name="draw-polygon" :size="20" />
          <span class="rail-label">
            Build
            <span v-if="lockedGuest" id="rail-why-build" class="rail-why">{{ BUILD_LOCK }}</span>
          </span>
          <span v-if="lockedGuest && !expanded && lockFocus === 'build'" class="rail-pop" role="status">{{ BUILD_LOCK }}</span>
        </button>
        <!-- Lent to Lane Z (marketplace phase 4): the catalogue, signed in or out. -->
        <button v-if="has('marketplace')" type="button" class="rail-item" aria-label="Marketplace" :title="hint('marketplace', 'Marketplace')" @click="run('marketplace')">
          <Icon name="store" :size="20" />
          <span class="rail-label">Marketplace</span>
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
  position: relative;
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

.rail-item:disabled,
.rail-item.is-locked {
  opacity: 0.35;
  cursor: default;
}

.rail-item:not(:disabled):not(.is-locked):hover {
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

.rail.is-expanded .rail-item.is-locked {
  height: auto;
  min-height: 40px;
  align-items: flex-start;
}

.rail-why {
  display: none;
  margin-top: 2px;
  color: var(--text-1);
  font: 400 12px/1.35 var(--font-text);
  white-space: normal;
}

.rail.is-expanded .rail-why {
  display: block;
}

/* Collapsed, focus shows the same sentence beside the rail. Touch and a click expand the rail. */
.rail-pop {
  position: absolute;
  left: calc(100% + 8px);
  top: 0;
  z-index: 6;
  width: max-content;
  max-width: 260px;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--chrome-bg);
  color: var(--text-1);
  font: 400 12px/1.4 var(--font-text);
  text-align: left;
  white-space: normal;
  box-shadow: var(--shadow-pop);
}

@media (prefers-reduced-motion: reduce) {
  .rail,
  .rail-item,
  .rail-label {
    transition: none;
  }
}
</style>
