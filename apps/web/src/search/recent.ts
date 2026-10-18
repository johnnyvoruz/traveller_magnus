/**
 * Places, records, entries and packages opened from the palette this session.
 * Memory only. Nothing is written to storage.
 */
import type { OmniResult } from './omni.ts';

export const RECENT_CAP = 8;

const recent: OmniResult[] = [];

function keyOf(result: OmniResult): string {
    if (result.kind === 'system') return 'system:' + result.sector + '/' + result.hex;
    if (result.kind === 'sector') return 'sector:' + result.sector;
    if (result.kind === 'record' || result.kind === 'entry' || result.kind === 'package') return result.kind + ':' + result.id;
    return '';
}

/** Newest first. Examples, commands and the "more" row are not remembered. */
export function rememberRecent(result: OmniResult): void {
    const key = keyOf(result);
    if (!key) return;
    const kept = recent.filter((item) => keyOf(item) !== key);
    kept.unshift({ ...result });
    recent.length = 0;
    for (const item of kept.slice(0, RECENT_CAP)) recent.push(item);
}

export function recentResults(): OmniResult[] {
    return recent.map((item) => ({ ...item }));
}

export function clearRecent(): void {
    recent.length = 0;
}
