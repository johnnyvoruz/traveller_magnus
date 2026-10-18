/**
 * The store's two motions when the results change (prompts/d_store_harden.md item 2): the results
 * dissolve to the new set, and when their top has gone above the window the scroller glides it back
 * into view. Durations and easing are the motion tokens (design_reference.md §4: a dissolve is
 * `--t-base`), with the version videos' ease (`--ease-video`, GSAP's power2.out), read from the
 * element; reduced motion makes both instant.
 */
import { cancelFrame, nextFrame, now, prefersReducedMotion } from '../../platform/browser.ts';

/** A token's duration in milliseconds ("300ms" or "0.3s"); 0 when it is missing. */
export function tokenMs(value: string): number {
    const text = value.trim();
    const n = parseFloat(text);
    if (!Number.isFinite(n)) return 0;
    return text.endsWith('ms') ? n : text.endsWith('s') ? n * 1000 : n;
}

function motion(el: Element): { duration: number; easing: string } {
    const style = getComputedStyle(el);
    const easing = style.getPropertyValue('--ease-video').trim() || style.getPropertyValue('--ease-out').trim() || 'ease-out';
    return { duration: tokenMs(style.getPropertyValue('--t-base')), easing };
}

/** The new set fades up from a faint copy of itself: nothing goes blank, nothing changes size. */
export function dissolve(el: HTMLElement): void {
    if (prefersReducedMotion() || typeof el.animate !== 'function') return;
    const { duration, easing } = motion(el);
    if (duration > 0) el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration, easing });
}

/** power2.out, the videos' ease (`--ease-video`), for the glide. */
export function easeOut(t: number): number {
    return 1 - (1 - t) ** 2;
}

let gliding = 0;

/** Scrolls `scroller` to `top` over the dissolve's duration, then calls `done`. */
export function glide(scroller: HTMLElement, top: number, done: () => void = () => {}): void {
    if (gliding) cancelFrame(gliding);
    gliding = 0;
    const from = scroller.scrollTop;
    const { duration } = motion(scroller);
    if (prefersReducedMotion() || duration <= 0 || Math.abs(top - from) < 1) {
        scroller.scrollTop = top;
        done();
        return;
    }
    const start = now();
    const step = () => {
        const t = Math.min(1, (now() - start) / duration);
        scroller.scrollTop = from + (top - from) * easeOut(t);
        gliding = t < 1 ? nextFrame(step) : 0;
        if (t >= 1) done();
    };
    gliding = nextFrame(step);
}

/**
 * Where the scroller should go so the results' top is in view again: `null` when it already is.
 * `resultsTop` and `scrollerTop` are viewport tops; `gap` is the room left above the results.
 */
export function backToResults(scrollTop: number, resultsTop: number, scrollerTop: number, gap: number): number | null {
    if (resultsTop >= scrollerTop) return null;
    return Math.max(0, scrollTop + (resultsTop - scrollerTop) - gap);
}
