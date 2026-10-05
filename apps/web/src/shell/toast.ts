import { reactive } from 'vue';

/** Messages waiting for the toast strip. K5 draws them. At most two, per the design reference. */
export const toasts = reactive<{ message: string }[]>([]);

export function showToast(message: string): void {
    toasts.push({ message });
    if (toasts.length > 2) toasts.splice(0, toasts.length - 2);
}

export function clearToasts(): void {
    toasts.splice(0, toasts.length);
}
