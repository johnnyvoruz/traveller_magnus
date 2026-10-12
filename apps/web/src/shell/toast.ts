import { reactive } from 'vue';

/**
 * One thing a toast can offer: "Undo", "Try again", "Stop".
 * `close` defaults to closing the toast when the action runs, which is what every
 * existing caller does. Set it false to leave the toast up (a job's Stop).
 */
export type ToastAction = { label: string; run: () => void; close?: boolean };

export type Toast = {
    id: number;
    message: string;
    action: ToastAction | null;
    /** A spinner, and one announcement. Later edits to message stay on screen and stay quiet. */
    busy: boolean;
    /** How long it stays, in milliseconds, while nobody is pointing at it or focused in it. */
    ms: number;
};

/** A plain message stays this long; one with something to press stays longer. */
export const TOAST_MS = 6000;
export const TOAST_ACTION_MS = 10000;

/** Messages waiting for the toast strip (shell/ToastStrip.vue). At most two, per the design reference. */
export const toasts = reactive<Toast[]>([]);

let next = 1;

/** Shows a message, with an optional action. Returns its id, for dismissToast. */
export function showToast(message: string, options: { action?: ToastAction; ms?: number; busy?: boolean } = {}): number {
    const id = next++;
    const action = options.action ?? null;
    toasts.push({
        id,
        message,
        action,
        busy: options.busy === true,
        ms: options.ms ?? (action ? TOAST_ACTION_MS : TOAST_MS),
    });
    if (toasts.length > 2) toasts.splice(0, toasts.length - 2);
    return id;
}

/** Runs the action. Closes the toast first unless the action sets `close` to false. */
export function runToastAction(toast: Toast): void {
    const action = toast.action;
    if (!action) return;
    if (action.close !== false) dismissToast(toast.id);
    action.run();
}

/**
 * The words a busy toast says the first time it is seen. Returns null when every busy
 * toast in the list was already announced, including when only its message changed.
 * `announced` is the caller's set of ids.
 */
export function nextBusyAnnouncement(list: readonly { id: number; busy: boolean; message: string }[], announced: Set<number>): string | null {
    let text: string | null = null;
    const live = new Set<number>();
    for (const toast of list) {
        if (!toast.busy) continue;
        live.add(toast.id);
        if (!announced.has(toast.id)) {
            announced.add(toast.id);
            text = toast.message;
        }
    }
    for (const id of announced) if (!live.has(id)) announced.delete(id);
    return text;
}

/** A length from an inline custom property, such as "12px". Anything else is 0. */
export function readPx(value: string): number {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * The orbit toast, in viewport pixels. Same corner as the picture's own rules: 18px from
 * its top-right, under the flight strip and an open drawer, and no lower than 200px above
 * the picture's foot.
 */
export function orbitToastBox(
    stage: { top: number; right: number; width: number; height: number },
    flightPx: number,
    drawerPx: number,
    viewportWidth: number,
): { top: number; right: number; maxWidth: number } {
    const topIn = Math.min(18 + flightPx + drawerPx, Math.max(0, stage.height - 200));
    return {
        top: stage.top + topIn,
        right: viewportWidth - stage.right + 18,
        maxWidth: Math.min(460, Math.max(0, stage.width - 36)),
    };
}

export function dismissToast(id: number): void {
    const at = toasts.findIndex((toast) => toast.id === id);
    if (at >= 0) toasts.splice(at, 1);
}

export function clearToasts(): void {
    toasts.splice(0, toasts.length);
}
