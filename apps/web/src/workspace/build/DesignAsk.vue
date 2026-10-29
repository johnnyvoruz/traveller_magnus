<script setup lang="ts">
/**
 * The pane's ask, before something changes (findings/builder_system_design.md §16 and §17;
 * mockup kb3_design_by_hand). Two of them, one pattern:
 *
 * - "Design by hand" on a generated or charted system. Hand and generated go both ways
 *   (ruling 5 of 2026-10-10): the toast's Undo returns the version kept before, and a
 *   system by hand can be generated again.
 * - `remove`: a star with what orbits it, or a world with its moons (ruling 3 of
 *   2026-10-10). The remove is already in the draft; the count is the server's, read from
 *   its answer; Cancel takes the remove back out. Nothing is gone until Keep.
 */
import { computed } from 'vue';
import { draftHandle } from './edit.ts';
import { handList, handUi, removedWith } from './hand.ts';
import { cancelDesign, cancelRemove, confirmDesign, confirmRemove } from './hand_acts.ts';

const props = defineProps<{ remove?: boolean }>();

/** How many bodies go with it, once the server's answer is in; null until then. */
const count = computed((): number | null => {
    const asking = handUi.removing;
    const handle = draftHandle.value;
    if (!props.remove || !asking || !handle) return null;
    return removedWith(asking.before, handList(handle.form.value), asking.id);
});
const what = computed(() => (handUi.removing && handUi.removing.kind === 'star' ? 'this star' : 'this world'));
</script>

<template>
  <div v-if="remove && handUi.removing" class="sysed-strip design-ask" role="alertdialog" :aria-label="'Remove ' + handUi.removing.name">
    <p><b>Remove {{ handUi.removing.name }}?</b></p>
    <p v-if="count === null" role="status">Counting the bodies that orbit it…</p>
    <p v-else-if="count === 0" role="status">This does not remove any other body.</p>
    <p v-else role="status">This also removes the {{ count }} {{ count === 1 ? 'body that orbits' : 'bodies that orbit' }} {{ what }}.</p>
    <p class="design-ask-fine">Select Remove to leave the change in the draft. The draft is saved when you select Keep. To put the bodies back, select Cancel.</p>
    <div class="sysed-strip-acts">
      <button type="button" class="ui-btn is-primary" data-remove-confirm :disabled="count === null" @click="confirmRemove()">Remove</button>
      <button type="button" class="ui-btn" data-remove-cancel @click="cancelRemove()">Cancel</button>
    </div>
  </div>
  <div v-else-if="!remove" class="sysed-strip design-ask" role="alertdialog" aria-label="Design by hand">
    <p><b>Design {{ handUi.askName || 'this system' }} by hand?</b></p>
    <p>Building stops for this system. You add, remove, type, and arrange every star, world, and moon yourself. To go back to the previous version, select Undo in the message that appears. To roll the system again later, select Generate a system.</p>
    <p class="design-ask-fine">Copied: the system’s name, its stars, each world’s name and kind, and the mainworld’s profile, notes, zone, allegiance, trade codes, and bases. Not copied: masses, orbits, distances, and everything else that was rolled.</p>
    <div class="sysed-strip-acts">
      <button type="button" class="ui-btn is-primary" data-command="build-design-hand" :disabled="handUi.askBusy" :aria-busy="handUi.askBusy ? 'true' : undefined" @click="confirmDesign()">{{ handUi.askBusy ? 'Changing…' : 'Design by hand' }}</button>
      <button type="button" class="ui-btn" data-design-cancel :disabled="handUi.askBusy" @click="cancelDesign()">Cancel</button>
    </div>
    <p v-if="handUi.askError" class="design-ask-error" role="alert">{{ handUi.askError }}</p>
  </div>
</template>

<style>
.design-ask {
  margin: 14px 16px 0;
}

.design-ask p + p {
  margin-top: 6px;
}

.design-ask-fine {
  color: var(--text-muted);
  font-size: 12.5px;
}

.design-ask-error {
  color: var(--danger);
}
</style>
