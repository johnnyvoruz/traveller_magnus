/**
 * The pane address (findings/panes_swap_design.md, shape A). Pure.
 * The path names the view. The panel query names the pane.
 * The router does not use this yet: old addresses behave as they do now.
 */

export type Query = Record<string, string | string[] | null | undefined>;

export type PaneView =
    | { kind: 'home' }
    | { kind: 'sector'; sector: string }
    | { kind: 'map'; sector: string; hex: string; body: string | null }
    | { kind: 'orbit'; sector: string; hex: string; body: string | null }
    | { kind: 'page' };

export type Pane =
    | { kind: 'shut' }
    | { kind: 'dossier' }
    | { kind: 'campaign'; record: string | null }
    | { kind: 'party' };

export type PaneAddress = { view: PaneView; pane: Pane };

/** Where focus moves when the pane changes. A cold load leaves it. */
export type FocusTarget =
    | 'leave'
    | 'list-search'
    | 'record-title'
    | 'record-row'
    | 'party-tab'
    | 'dossier-heading'
    | 'rail-campaign'
    | 'rail-system';

export type Redirect = { path: string; query: Record<string, string> };

const KEPT = ['panel', 'record', 'x', 'y', 'z', 'date', 'time', 'campaignStandIn'];

function first(value: string | string[] | null | undefined): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string' || raw.length === 0) return undefined;
    return raw;
}

function decode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function partsOf(path: string): string[] {
    return path.split('/').filter((part) => part.length > 0);
}

function viewOf(parts: string[]): PaneView {
    if (parts.length === 0) return { kind: 'home' };
    if (parts[0] !== 's' || !parts[1]) return { kind: 'page' };
    const sector = decode(parts[1]);
    if (parts.length === 2) return { kind: 'sector', sector };
    const hex = decode(parts[2]);
    if (parts.length === 3) return { kind: 'map', sector, hex, body: null };
    if (parts.length === 5 && parts[3] === 'b' && parts[4]) {
        return { kind: 'map', sector, hex, body: decode(parts[4]) };
    }
    if (parts[3] === 'orbit' && parts.length === 4) return { kind: 'orbit', sector, hex, body: null };
    if (parts[3] === 'orbit' && parts.length === 6 && parts[4] === 'b' && parts[5]) {
        return { kind: 'orbit', sector, hex, body: decode(parts[5]) };
    }
    return { kind: 'page' };
}

/** The path /campaign, /campaign/party, or /campaign/r/:record. Null for any other path. */
function campaignPane(parts: string[]): Pane | null {
    if (parts[0] !== 'campaign') return null;
    if (parts.length === 1) return { kind: 'campaign', record: null };
    if (parts.length === 2 && parts[1] === 'party') return { kind: 'party' };
    if (parts.length === 3 && parts[1] === 'r' && parts[2]) {
        return { kind: 'campaign', record: decode(parts[2]) };
    }
    return null;
}

function dossierDefault(view: PaneView): boolean {
    return view.kind === 'map' || view.kind === 'orbit';
}

function paneFromQuery(view: PaneView, query: Query): Pane {
    const panel = first(query.panel);
    if (panel === 'closed') return { kind: 'shut' };
    if (panel === 'party') return { kind: 'party' };
    if (panel === 'campaign') {
        const record = first(query.record);
        return { kind: 'campaign', record: record ? decode(record) : null };
    }
    if (panel === 'dossier' || panel === undefined) {
        return dossierDefault(view) || panel === 'dossier' ? { kind: 'dossier' } : { kind: 'shut' };
    }
    return dossierDefault(view) ? { kind: 'dossier' } : { kind: 'shut' };
}

/** The view and the pane an address names. */
export function paneOf(path: string, query: Query = {}): PaneAddress {
    const parts = partsOf(path);
    const legacy = campaignPane(parts);
    if (legacy) return { view: { kind: 'home' }, pane: legacy };
    const view = viewOf(parts);
    return { view, pane: paneFromQuery(view, query) };
}

function text(value: string | string[] | null | undefined): string | undefined {
    const raw = first(value);
    return raw === undefined ? undefined : raw;
}

/**
 * The one writer of the query. Sets the given keys and keeps the pane, the
 * camera, the clock and the dev stand-in. A null or empty change drops that key.
 */
export function withQuery(query: Query, changes: Query): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of KEPT) {
        const value = text(query[key]);
        if (value !== undefined) out[key] = value;
    }
    for (const key of Object.keys(changes)) {
        const value = text(changes[key]);
        if (value === undefined) delete out[key];
        else out[key] = value;
    }
    return out;
}

/**
 * The three old campaign paths, onto the home map, and the strip of panel=dossier.
 * Null when the address is already in its canonical form.
 */
export function campaignRedirect(path: string, query: Query = {}): Redirect | null {
    const parts = partsOf(path);
    const legacy = campaignPane(parts);
    if (legacy) {
        if (legacy.kind === 'party') return { path: '/', query: withQuery(query, { panel: 'party', record: null }) };
        if (legacy.kind === 'campaign' && legacy.record) {
            return { path: '/', query: withQuery(query, { panel: 'campaign', record: legacy.record }) };
        }
        return { path: '/', query: withQuery(query, { panel: 'campaign', record: null }) };
    }
    if (first(query.panel) === 'dossier') {
        const kept = path.startsWith('/') ? path : '/' + path;
        return { path: kept.length > 0 ? kept : '/', query: withQuery(query, { panel: null }) };
    }
    return null;
}

function samePane(previous: Pane, next: Pane): boolean {
    if (previous.kind !== next.kind) return false;
    if (previous.kind === 'campaign' && next.kind === 'campaign') return previous.record === next.record;
    return true;
}

/**
 * Focus follows a pane change. No previous pane is a cold load, and focus stays.
 * The list search stands for the search, or the first button when the list is empty.
 * The record row stands for that row, then the search.
 */
export function focusTarget(previous: Pane | null, next: Pane): FocusTarget {
    if (!previous || samePane(previous, next)) return 'leave';
    if (next.kind === 'campaign' && next.record) return 'record-title';
    if (previous.kind === 'campaign' && previous.record && next.kind === 'campaign') return 'record-row';
    if (next.kind === 'party') return 'party-tab';
    if (next.kind === 'dossier') return 'dossier-heading';
    if (next.kind === 'campaign') return 'list-search';
    if (previous.kind === 'dossier') return 'rail-system';
    return 'rail-campaign';
}
