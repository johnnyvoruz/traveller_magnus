import { storageGet, storageSet } from '../platform/browser.ts';

export type PanelSpan = 'column' | 'half' | 'full';

const SPAN_KEY = 'voyage_panel_span';

/** A visit can show a span without writing it. Null means storage. */
let visit: PanelSpan | null = null;
const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of listeners) listener();
}

/** Fires after holdSpan, releaseSpan, or writeSpan. */
export function onSpan(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** half and full are remembered. Anything else, including a missing key, is column. A visit wins. */
export function readSpan(): PanelSpan {
    if (visit) return visit;
    const raw = storageGet(SPAN_KEY);
    if (raw === 'half' || raw === 'full') return raw;
    return 'column';
}

export function writeSpan(span: PanelSpan): void {
    visit = null;
    storageSet(SPAN_KEY, span === 'half' || span === 'full' ? span : 'column');
    notify();
}

/** Show this span until releaseSpan, or until writeSpan records a choice. Storage stays as it was. */
export function holdSpan(span: PanelSpan): void {
    visit = span;
    notify();
}

/** The remembered span shows again. A writeSpan during the visit already cleared this. */
export function releaseSpan(): void {
    if (!visit) return;
    visit = null;
    notify();
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
