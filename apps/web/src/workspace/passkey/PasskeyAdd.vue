<script setup lang="ts">
/**
 * "Name this passkey" and the ceremony that adds it: on the second-passkey nudge, on the account
 * page, and on the recovery screen, where it is the one thing that finishes the session.
 * Emits `added` when the server has verified the new passkey, with the ten codes when it was the
 * account's first (account/passkey.ts reveals them then), and `cancel` for the second button.
 */
import { nextTick, onMounted, ref } from 'vue';
import { addPasskey, CEREMONY_CANCELLED } from '../../account/passkey.ts';
import { NOT_REACHED, PASSKEY_CLOSED, PASSKEY_WAITING } from './words.ts';

const props = defineProps<{
    /** The second button's label: "Cancel", "Not now", or none for the recovery screen. */
    cancel?: string;
    placeholder?: string;
    /** Focus the field when it shows (an opened form), not when the page opens on it. */
    focus?: boolean;
}>();
const emit = defineEmits<{ added: [codes: string[] | null]; cancel: [] }>();

const label = ref('');
const busy = ref(false);
const said = ref<{ text: string; alert: boolean } | null>(null);
const field = ref<HTMLInputElement | null>(null);

async function add(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    said.value = null;
    try {
        const done = await addPasskey(label.value.trim() || 'Passkey');
        if (done.ok) {
            emit('added', done.codes);
            return;
        }
        said.value = done.code === CEREMONY_CANCELLED ? { text: PASSKEY_CLOSED, alert: false } : { text: done.message || NOT_REACHED, alert: true };
    } catch {
        said.value = { text: NOT_REACHED, alert: true };
    } finally {
        busy.value = false;
    }
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !props.cancel || busy.value) return;
    event.preventDefault();
    emit('cancel');
}

onMounted(() => {
    if (props.focus) void nextTick(() => { if (field.value) field.value.focus(); });
});
</script>

<template>
  <form class="pk-form" novalidate @submit.prevent="add" @keydown="onKey">
    <label class="pk-field">
      <span>Name this passkey</span>
      <input ref="field" v-model="label" class="signin-input" type="text" maxlength="40" :placeholder="placeholder || 'For example, Phone'" :disabled="busy">
    </label>
    <div class="pk-acts">
      <button type="submit" class="ui-btn is-primary" data-passkey="add-go" :disabled="busy" :aria-busy="busy ? 'true' : undefined">
        {{ busy ? PASSKEY_WAITING : 'Add a passkey' }}
      </button>
      <button v-if="cancel" type="button" class="ui-btn" :disabled="busy" @click="emit('cancel')">{{ cancel }}</button>
    </div>
    <p v-if="said" :class="said.alert ? 'pk-alert' : 'pk-quiet'" :role="said.alert ? 'alert' : 'status'">{{ said.text }}</p>
  </form>
</template>
