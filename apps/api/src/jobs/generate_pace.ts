export const BUSY_SENTENCE = 'This universe is busy. Generation stopped. Try again in a minute.';

/** Milliseconds to wait before a refused post is tried again. Null means the job should end. */
export function busyDelayMs(retryAfter: string | null, attempt: number): number | null {
    if (attempt >= 2) return null;
    const seconds = Number(retryAfter ?? '60');
    const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 60_000;
    return Math.min(60_000, wait);
}

/** The first slice offset that has not reported. A later slice must not hide a hole in front of it. */
export function nextSliceOffset(applied: readonly number[], total: number, size: number): number {
    const have = new Set(applied);
    const step = size > 0 ? size : 1;
    for (let cursor = 0; cursor < total; cursor += step) {
        if (!have.has(cursor)) return cursor;
    }
    return total;
}
