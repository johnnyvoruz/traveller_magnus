/**
 * The records list grouped by type (campaign gap audit §4.1): a heading per type with its
 * count, groups that fold and stay folded per campaign on this device, and the window of items
 * a long list draws. Pure but for the device storage it reads and writes; it runs under Node.
 */
import type { CampaignRecord, CampaignRecordType } from '@voyage/shared';
import { storageGet, storageSet } from '../platform/browser.ts';
import { RECORD_TYPES } from './records.ts';

/** From this many rows the list draws only what is near the view. */
export const VIRTUAL_FROM = 200;
/** A row's height before it has been measured, in px. */
export const ROW_GUESS = 64;
/** A group heading's height before it has been measured, in px. */
export const HEAD_GUESS = 40;

export type ListItem =
    | { kind: 'head'; key: string; type: CampaignRecordType; count: number; folded: boolean }
    | { kind: 'row'; key: string; record: CampaignRecord };

/**
 * The list's items. Ungrouped (a type chip is chosen): the rows as given. Grouped: the types in
 * the type chips' order, each with its heading and, unless folded, its rows in the order given.
 * `open` (a search is typed) unfolds every group, so no match is hidden. Empty groups are left out.
 */
export function groupItems(rows: readonly CampaignRecord[], grouped: boolean, folded: ReadonlySet<CampaignRecordType>, open = false): ListItem[] {
    if (!grouped) return rows.map((record) => ({ kind: 'row', key: record.id, record }));
    const byType = new Map<CampaignRecordType, CampaignRecord[]>();
    for (const record of rows) {
        const list = byType.get(record.type);
        if (list) list.push(record);
        else byType.set(record.type, [record]);
    }
    const items: ListItem[] = [];
    for (const info of RECORD_TYPES) {
        const list = byType.get(info.type);
        if (!list || !list.length) continue;
        const shut = !open && folded.has(info.type);
        items.push({ kind: 'head', key: 'head:' + info.type, type: info.type, count: list.length, folded: shut });
        if (!shut) for (const record of list) items.push({ kind: 'row', key: record.id, record });
    }
    return items;
}

function foldKey(universeId: string): string {
    return 'voyage.recordGroups.' + universeId;
}

/** The folded groups kept for this campaign on this device. Anything unreadable reads as none. */
export function readFolded(universeId: string | null): Set<CampaignRecordType> {
    if (!universeId) return new Set();
    const raw = storageGet(foldKey(universeId));
    if (!raw) return new Set();
    try {
        const list: unknown = JSON.parse(raw);
        const known = new Set<string>(RECORD_TYPES.map((info) => info.type));
        return new Set(Array.isArray(list) ? list.filter((type): type is CampaignRecordType => typeof type === 'string' && known.has(type)) : []);
    } catch {
        return new Set();
    }
}

export function writeFolded(universeId: string | null, folded: ReadonlySet<CampaignRecordType>): void {
    if (!universeId) return;
    storageSet(foldKey(universeId), JSON.stringify([...folded]));
}

/**
 * Which items to draw: those within `view` px of the visible part, given each item's height.
 * `top` is how far the list's top is scrolled above the view (negative while the list is below
 * the top). The pads stand in for the items left out, so the scroll height stays true.
 */
export function windowOf(heights: readonly number[], top: number, view: number, overscan = 400): { start: number; end: number; padBefore: number; padAfter: number } {
    const from = Math.max(0, top - overscan);
    const to = Math.max(0, top + Math.max(0, view) + overscan);
    let at = 0;
    let start = heights.length;
    let padBefore = 0;
    for (let i = 0; i < heights.length; i++) {
        if (at + heights[i] > from) {
            start = i;
            padBefore = at;
            break;
        }
        at += heights[i];
    }
    if (start === heights.length) padBefore = at;
    let end = start;
    let y = padBefore;
    while (end < heights.length && y < to) {
        y += heights[end];
        end += 1;
    }
    let padAfter = 0;
    for (let i = end; i < heights.length; i++) padAfter += heights[i];
    return { start, end, padBefore, padAfter };
}
