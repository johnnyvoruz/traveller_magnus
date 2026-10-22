/**
 * The world hover card (DW1), the world counterpart of the record card (record_card.ts): which world it
 * shows and where the link it belongs to sits. A world link opts in with `v-world-card="hexKey"`; the
 * card (WorldCard.vue) is mounted once, beside the record card. The same rules as the record card: a
 * mouse resting on the link, or the keyboard reaching it, shows it; leaving, Escape, scrolling or a click
 * closes it; touch never shows it. Only one card shows at a time: this one closes the record card.
 */
import { reactive, type Directive } from 'vue';
import { closeCard as closeRecordCard, HIDE_AFTER, SHOW_AFTER, type CardRect } from './record_card.ts';

/** The card's id, for the link's aria-describedby while it shows. */
export const WORLD_CARD_ID = 'world-card';

export const worldCard = reactive<{ hexKey: string | null; rect: CardRect | null }>({ hexKey: null, rect: null });

let anchor: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
    showTimer = null;
    hideTimer = null;
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !worldCard.hexKey) return;
    // Escape closes the card only; the panel's own Escape waits for the next press.
    event.preventDefault();
    event.stopPropagation();
    closeWorldCard();
}

function onScroll(): void {
    closeWorldCard();
}

function show(hexKey: string, el: HTMLElement): void {
    clearTimers();
    closeRecordCard();
    if (anchor && anchor !== el) anchor.removeAttribute('aria-describedby');
    const box = el.getBoundingClientRect();
    anchor = el;
    el.setAttribute('aria-describedby', WORLD_CARD_ID);
    if (!worldCard.hexKey) {
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('scroll', onScroll, true);
    }
    worldCard.hexKey = hexKey;
    worldCard.rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

/** Closes the card at once. */
export function closeWorldCard(): void {
    clearTimers();
    if (anchor) anchor.removeAttribute('aria-describedby');
    anchor = null;
    if (worldCard.hexKey) {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('scroll', onScroll, true);
    }
    worldCard.hexKey = null;
    worldCard.rect = null;
}

/** The mouse left a link or the card: the card goes unless the mouse reaches the card first. */
export function leaveWorldCard(): void {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    if (!worldCard.hexKey || hideTimer) return;
    hideTimer = setTimeout(closeWorldCard, HIDE_AFTER);
}

/** The mouse is on the card: it stays. */
export function keepWorldCard(): void {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
}

type Bound = { hexKey: string | null; off: () => void };
const bound = new WeakMap<HTMLElement, Bound>();

function bind(el: HTMLElement, hexKey: string | null): void {
    const state: Bound = { hexKey, off: () => {} };
    const enter = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || !state.hexKey) return;
        keepWorldCard();
        const want = state.hexKey;
        if (worldCard.hexKey === want && anchor === el) return;
        if (showTimer) clearTimeout(showTimer);
        showTimer = setTimeout(() => { show(want, el); }, SHOW_AFTER);
    };
    const leave = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        leaveWorldCard();
    };
    const focus = () => {
        // The keyboard reached the link; a click's focus does not count.
        if (state.hexKey && el.matches(':focus-visible')) show(state.hexKey, el);
    };
    const blur = () => { if (anchor === el) closeWorldCard(); };
    const click = () => { closeWorldCard(); };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('focus', focus);
    el.addEventListener('blur', blur);
    el.addEventListener('click', click);
    state.off = () => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointerleave', leave);
        el.removeEventListener('focus', focus);
        el.removeEventListener('blur', blur);
        el.removeEventListener('click', click);
    };
    bound.set(el, state);
}

/** `v-world-card="hexKey"` on a world link; null or empty leaves the element alone. */
export const vWorldCard: Directive<HTMLElement, string | null | undefined> = {
    mounted(el, binding) {
        bind(el, binding.value || null);
    },
    updated(el, binding) {
        const state = bound.get(el);
        if (state) state.hexKey = binding.value || null;
    },
    beforeUnmount(el) {
        const state = bound.get(el);
        if (state) state.off();
        bound.delete(el);
        if (anchor === el) closeWorldCard();
    },
};

/** "Amber zone", "Red zone", or nothing: the index's A or R. */
export function zoneWords(zone: string): string {
    return zone === 'A' ? 'Amber zone' : zone === 'R' ? 'Red zone' : '';
}

/** "Naval base · Scout base", or the index's own letters when they are something else. */
export function baseWords(marks: { naval: boolean; scout: boolean; text: string }): string {
    if (marks.text) return 'Bases ' + marks.text;
    return [marks.naval ? 'Naval base' : '', marks.scout ? 'Scout base' : ''].filter(Boolean).join(' · ');
}
