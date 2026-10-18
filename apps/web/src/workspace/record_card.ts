/**
 * The one record hover card (campaign_manager_plan.md §4.4 rule 4): which record it shows and
 * where the link it belongs to sits. A record link opts in with `v-record-card="id"`; the card
 * itself (RecordCard.vue) is mounted once, beside the panels. A mouse resting on a link, or
 * the keyboard reaching it, shows the card; leaving, Escape, scrolling or a click closes it.
 * Touch never shows it: a tap opens the record, as before.
 */
import { reactive, type Directive } from 'vue';

/** How long a mouse rests on a link before the card shows (§4.4: 300). */
export const SHOW_AFTER = 300;
/** How long the card waits after the mouse leaves, so it can be reached. */
export const HIDE_AFTER = 150;
/** The card's id, for the link's aria-describedby while it shows. */
export const CARD_ID = 'record-card';

export type CardRect = { left: number; top: number; right: number; bottom: number };

/** How many connections the card names (plan §4.4: "2–3 relationships"). */
export const CARD_TIES = 3;

/** The first `cap` connections, and how many more there are. */
export function cardTies<T>(list: readonly T[], cap = CARD_TIES): { shown: T[]; more: number } {
    return { shown: list.slice(0, cap), more: Math.max(0, list.length - cap) };
}

export const recordCard = reactive<{ id: string | null; rect: CardRect | null }>({ id: null, rect: null });

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
    if (event.key !== 'Escape' || !recordCard.id) return;
    // Escape closes the card only; the panel's own Escape waits for the next press.
    event.preventDefault();
    event.stopPropagation();
    closeCard();
}

function onScroll(): void {
    closeCard();
}

function show(id: string, el: HTMLElement): void {
    clearTimers();
    if (anchor && anchor !== el) anchor.removeAttribute('aria-describedby');
    const box = el.getBoundingClientRect();
    anchor = el;
    el.setAttribute('aria-describedby', CARD_ID);
    if (!recordCard.id) {
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('scroll', onScroll, true);
    }
    recordCard.id = id;
    recordCard.rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

/** Closes the card at once. */
export function closeCard(): void {
    clearTimers();
    if (anchor) anchor.removeAttribute('aria-describedby');
    anchor = null;
    if (recordCard.id) {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('scroll', onScroll, true);
    }
    recordCard.id = null;
    recordCard.rect = null;
}

/** The mouse left a link or the card: the card goes unless the mouse reaches the card first. */
export function leaveCard(): void {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    if (!recordCard.id || hideTimer) return;
    hideTimer = setTimeout(closeCard, HIDE_AFTER);
}

/** The mouse is on the card: it stays. */
export function keepCard(): void {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
}

/**
 * Where the card goes: under the link, or over it when there is no room below; its left edge
 * on the link's, kept inside the view with a margin.
 */
export function cardPlace(rect: CardRect, size: { width: number; height: number }, view: { width: number; height: number }, gap = 6, margin = 8): { left: number; top: number } {
    const below = rect.bottom + gap;
    const above = rect.top - gap - size.height;
    const top = below + size.height <= view.height - margin || above < margin ? below : above;
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, view.width - margin - size.width));
    return { left, top: Math.max(margin, top) };
}

type Bound = { id: string | null; off: () => void };
const bound = new WeakMap<HTMLElement, Bound>();

function bind(el: HTMLElement, id: string | null): void {
    const state: Bound = { id, off: () => {} };
    const enter = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || !state.id) return;
        keepCard();
        const want = state.id;
        if (recordCard.id === want && anchor === el) return;
        if (showTimer) clearTimeout(showTimer);
        showTimer = setTimeout(() => { show(want, el); }, SHOW_AFTER);
    };
    const leave = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        leaveCard();
    };
    const focus = () => {
        // The keyboard reached the link; a click's focus does not count.
        if (state.id && el.matches(':focus-visible')) show(state.id, el);
    };
    const blur = () => { if (anchor === el) closeCard(); };
    const click = () => { closeCard(); };
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

/** `v-record-card="record.id"` on a record link; null or empty leaves the element alone. */
export const vRecordCard: Directive<HTMLElement, string | null | undefined> = {
    mounted(el, binding) {
        bind(el, binding.value || null);
    },
    updated(el, binding) {
        const state = bound.get(el);
        if (state) state.id = binding.value || null;
    },
    beforeUnmount(el) {
        const state = bound.get(el);
        if (state) state.off();
        bound.delete(el);
        if (anchor === el) closeCard();
    },
};
