/**
 * The Records tab's chrome (streams/D.md DU34; Johnny 2026-10-29: "way too much crap on this pane").
 * The rule: what a referee touches every session stays on the tab (the search, Add, the kinds that
 * have records); what is rare or shown elsewhere goes under the head's menu or away. Pure: the chip
 * rule and a row's words run under Node.
 */
import type { TypeFilter, TypeInfo } from './records.ts';
import { RECORD_TYPES } from './records.ts';

/**
 * The kind chips: the kinds that have records, in the chips' order, and the chosen kind while it is
 * chosen even with none left (so the choice can be seen and undone). A kind with no records is not a
 * chip; Add's menu still offers every kind.
 */
export function kindChips(counts: Readonly<Record<TypeFilter, number>>, filter: TypeFilter): TypeInfo[] {
    return RECORD_TYPES.filter((info) => counts[info.type] > 0 || info.type === filter);
}

/**
 * Which edges of a strip that scrolls sideways have more beyond them (DU35): the chips at Column keep
 * one line with the scrollbar hidden, so the strip fades at an edge that hides chips. '' when it all fits.
 */
export function stripEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): '' | 'left' | 'right' | 'both' {
    const left = scrollLeft > 1;
    const right = scrollLeft + clientWidth < scrollWidth - 1;
    if (left && right) return 'both';
    if (left) return 'left';
    if (right) return 'right';
    return '';
}

/**
 * A row's muted line: the kind and the place ("Person · Nowhere in particular"). In a grouped list
 * the group's heading says the kind already, so the place alone.
 */
export function rowMeta(kind: string, place: string, grouped: boolean): string {
    return grouped ? place : kind + ' · ' + place;
}
