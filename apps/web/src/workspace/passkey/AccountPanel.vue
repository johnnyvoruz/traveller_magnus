<script setup lang="ts">
/**
 * The account in the shell (streams/D.md DU11; UX backlog U11): `?panel=account`, hosted by
 * shell/PanelHost.vue like the other panes, over the map with the rail beside it. The body is the
 * account page in its panel mode: sign-in when signed out, a new account's codes, the recovery
 * screen, or the username, passkeys, recovery codes, linked accounts, Agent access and Sign out.
 * /account redirects here, so the recovery flow keeps its address.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../../design/Icon.vue';
import { observeSize } from '../../platform/browser.ts';
import Panel from '../../shell/Panel.vue';
import { onSpan, readSpan, writeSpan, type PanelSpan } from '../../shell/panel_state.ts';
import AccountPage from './AccountPage.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; width: [px: number] }>();

const panel = ref<InstanceType<typeof Panel> | null>(null);
const span = ref<PanelSpan>(readSpan());
let stopSpan: (() => void) | null = null;
let stopSize: (() => void) | null = null;
let sized: HTMLElement | null = null;

function panelElement(): HTMLElement | null {
    return panel.value ? panel.value.element : null;
}

function publish(): void {
    const el = panelElement();
    emit('width', props.open && el ? el.offsetWidth : 0);
}

function bindSize(): void {
    const el = panelElement();
    if (el === sized) return;
    if (stopSize) stopSize();
    stopSize = null;
    sized = el;
    if (el) stopSize = observeSize(el, publish);
}

function chooseSpan(next: PanelSpan): void {
    span.value = next;
    writeSpan(next);
    void nextTick(publish);
}

/** Opened: focus goes to the account's heading, or the sign-in card's first control. */
function focusIn(): void {
    void nextTick(() => {
        const el = panelElement();
        const target = el ? el.querySelector<HTMLElement>('.pk-h1, .pk-page-body button, .pk-page-body input') : null;
        if (target) target.focus();
    });
}

watch(() => props.open, (open) => {
    if (open) span.value = readSpan();
    void nextTick(() => { bindSize(); publish(); });
    if (open) focusIn();
});

onMounted(() => {
    stopSpan = onSpan(() => { span.value = readSpan(); });
    bindSize();
    void nextTick(publish);
    if (props.open) focusIn();
});

onBeforeUnmount(() => {
    if (stopSpan) stopSpan();
    if (stopSize) stopSize();
});
</script>

<template>
  <div class="account-root" data-account-panel>
    <Panel ref="panel" :open="open" title="Account" meta="" chip="" :span="span" @close="emit('close')" @span="chooseSpan">
      <template #glyph><Icon name="user" :size="16" /></template>
      <AccountPage panel />
    </Panel>
  </div>
</template>
