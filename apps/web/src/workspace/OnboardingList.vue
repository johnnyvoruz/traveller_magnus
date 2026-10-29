<script setup lang="ts">
/**
 * The onboarding checklist in the account pop-up (DU9; U9): seven lines for the referee of an
 * open campaign, each a button that takes them where the thing is done. Done lines fade; the list
 * leaves at 7 of 7. The states are the campaign's and this session's (onboarding.ts); nothing here
 * is stored.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { frame, onFrame } from '../shell/frame.ts';
import { atPane, type Pane } from '../shell/pane.ts';
import { commands } from '../shell/registry.ts';
import { worldIsOpen } from './first_run.ts';
import { keptPackages, storeSeen } from './market/catalogue_memory.ts';
import { MARKETPLACE_PATH } from './market/command.ts';
import { ensureInvitedKnown, invitedIn, onboardingCount, onboardingLines, onboardingNext, onboardingShows, type OnboardingId } from './onboarding.ts';

const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const router = useRouter();
const worldOpen = ref(false);
/** The store's memory is read when the list opens; it is not reactive. */
const readMarket = () => ({ seen: storeSeen.session, kept: keptPackages().length });
const market = ref(readMarket());
let stopFrame: (() => void) | null = null;

const ICONS = {
    world: 'location-crosshairs',
    ship: 'shuttle-space',
    date: 'calendar-star',
    record: 'pen-to-square',
    entry: 'note-sticky',
    players: 'user',
    package: 'store',
} as const satisfies Record<OnboardingId, string>;

function readWorld(): void {
    const live = frame();
    worldOpen.value = worldIsOpen(live ? live.dossier : null);
}

const lines = computed(() => onboardingLines({
    worldOpen: worldOpen.value,
    records: campaign.records,
    clock: campaign.clock,
    journal: campaign.journal,
    invited: invitedIn(campaign.universeId),
    storeSeen: market.value.seen,
    packagesKept: market.value.kept,
}));
const count = computed(() => onboardingCount(lines.value));
const next = computed(() => onboardingNext(lines.value));
/** The referee of an open campaign, until every line is done. */
const shown = computed(() => campaign.status === 'ready' && campaign.role === 'owner' && onboardingShows(lines.value));

const onMap = computed(() => route.path === '/' || route.path.startsWith('/s/'));

function goPane(pane: Pane): void {
    void router.push(onMap.value ? atPane(route.path, route.query, pane) : atPane('/', {}, pane));
}

/** A palette command, when it is there and can run now. */
function runCommand(id: string): boolean {
    const command = commands().find((item) => item.id === id);
    if (!command || (command.runnable && !command.runnable())) return false;
    // After the pop-up has closed, so the command's own focus is not taken back by the rail.
    void nextTick(() => command.run());
    return true;
}

function run(id: OnboardingId): void {
    emit('close');
    if (id === 'world') {
        if (!runCommand('search')) void router.push('/');
    } else if (id === 'ship' || id === 'date' || id === 'record') {
        goPane({ kind: 'campaign', record: null });
    } else if (id === 'entry') {
        if (!runCommand('journal-new-note')) goPane({ kind: 'journal', entry: null });
    } else if (id === 'players') {
        goPane({ kind: 'party' });
    } else {
        if (route.path !== MARKETPLACE_PATH) void router.push(MARKETPLACE_PATH);
    }
}

onMounted(() => {
    readWorld();
    market.value = readMarket();
    stopFrame = onFrame(readWorld);
    // Players invited (DU9b): the existing list, once per campaign per session, for the referee.
    // The membership module is loaded then, not with the first paint.
    if (campaign.status === 'ready' && campaign.role === 'owner') {
        void ensureInvitedKnown(campaign.universeId, () => import('../campaign/membership.ts').then((m) => m.listPlayers()));
    }
});

onBeforeUnmount(() => {
    if (stopFrame) stopFrame();
});
</script>

<template>
  <section v-if="shown" class="onb" aria-label="Set up this campaign" data-onboarding>
    <p class="onb-head">
      <span class="ui-kicker is-signal">Set up this campaign</span>
      <span class="onb-count" data-onboarding-count>{{ count.done }} of {{ count.total }}</span>
    </p>
    <ol class="onb-lines">
      <li
        v-for="line in lines"
        :key="line.id"
        class="onb-line"
        :class="{ 'is-done': line.done, 'is-next': line.id === next }"
        :data-onboarding-line="line.id"
        :data-done="line.done ? 'true' : 'false'"
      >
        <button type="button" class="onb-btn" :aria-label="line.done ? line.label + ': done' : line.label" @click="run(line.id)">
          <span class="onb-mark" aria-hidden="true"><Icon :name="line.done ? 'check' : ICONS[line.id]" :size="11" /></span>
          <span class="onb-words">{{ line.label }}</span>
          <span v-if="line.done" class="onb-done">Done</span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style>
.onb {
  margin: 0 0 6px;
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--line-1);
}

.onb-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 6px;
}

.onb-head .ui-kicker {
  font-size: 11px;
}

.onb-count {
  color: var(--text-muted);
  font: 700 12px/1.4 var(--font-display);
  letter-spacing: 0.04em;
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

.onb-lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

.onb-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 32px;
  margin: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-0);
  font: 500 13px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.onb-btn:hover {
  background: var(--row-active);
}

.onb-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

/* The mark: a ring for a line to do, lit for the next one, the tick for one done. */
.onb-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--line-2);
  border-radius: 50%;
  color: var(--text-muted);
}

.onb-line.is-next .onb-mark {
  border-color: var(--signal);
  color: var(--signal);
}

.onb-line.is-done .onb-mark {
  border-color: var(--signal-dim);
  background: var(--signal-dim);
  color: var(--bg-0);
}

.onb-words {
  flex: 1 1 auto;
  min-width: 0;
}

.onb-done {
  color: var(--signal);
  font: 600 11px/1.4 var(--font-text);
}

/* Done lines fade. The button still works. */
.onb-line.is-done .onb-btn {
  opacity: 0.6;
}

.onb-line.is-done .onb-btn:hover,
.onb-line.is-done .onb-btn:focus-visible {
  opacity: 1;
}

@media (pointer: coarse) {
  .onb-btn {
    min-height: 44px;
  }
}
</style>
