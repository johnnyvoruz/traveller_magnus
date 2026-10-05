import { reactive } from 'vue';

/** One thing a toast can offer: "Undo", "Try again". */
export type ToastAction = { label: string; run: () => void };

export type Toast = {
    id: number;
    message: string;
    action: ToastAction | null;
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
export function showToast(message: string, options: { action?: ToastAction; ms?: number } = {}): number {
    const id = next++;
    const action = options.action ?? null;
    toasts.push({ id, message, action, ms: options.ms ?? (action ? TOAST_ACTION_MS : TOAST_MS) });
    if (toasts.length > 2) toasts.splice(0, toasts.length - 2);
    return id;
}

export function dismissToast(id: number): void {
    const at = toasts.findIndex((toast) => toast.id === id);
    if (at >= 0) toasts.splice(at, 1);
}

export function clearToasts(): void {
    toasts.splice(0, toasts.length);
}
