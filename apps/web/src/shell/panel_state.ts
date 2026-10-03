import { storageGet, storageSet } from '../platform/browser.ts';

export type PanelSpan = 'column' | 'half' | 'full';

const SPAN_KEY = 'voyage_panel_span';

/** half and full are remembered. Anything else, including a missing key, is column. */
export function readSpan(): PanelSpan {
    const raw = storageGet(SPAN_KEY);
    if (raw === 'half' || raw === 'full') return raw;
    return 'column';
}

export function writeSpan(span: PanelSpan): void {
    storageSet(SPAN_KEY, span === 'half' || span === 'full' ? span : 'column');
}

export type EscapeAction = 'ignore' | 'overview' | 'close';

/**
 * Escape closes the panel when the omnibox is shut and no body is open.
 * A selected body returns to the overview. A shut panel or an open omnibox stays.
 */
export function escapeAction(state: { omniOpen: boolean; panelOpen: boolean; bodyOpen: boolean }): EscapeAction {
    if (state.omniOpen || !state.panelOpen) return 'ignore';
    if (state.bodyOpen) return 'overview';
    return 'close';
}
