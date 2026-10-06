/**
 * The view tells the panel host what it is showing (findings/panes_swap_design.md §2).
 * The host does not fetch the chart. A view clears the frame on unmount.
 */
import type { SectorHex, TreeEnvelope } from '@voyage/shared';
import type { AllegianceName } from '../dossier/model.ts';

export type DossierFrame = {
    slug: string;
    hex: string;
    sectorName: string;
    subsectorName: string;
    entry: SectorHex | null;
    tree: TreeEnvelope | null;
    bodyKey: string | null;
    error: boolean;
    pending: boolean;
    missing: boolean;
    allegiances: AllegianceName[];
    /** True only beside the orbit view, so Day and night keeps the running clock there. */
    orbit: boolean;
};

export type ViewFrame = {
    kind: 'map' | 'orbit' | 'none';
    dossier: DossierFrame;
    truthVersion: string;
    /** Null keeps the token. The orbit view uses the chrome inset. */
    panelTop: string | null;
    setWidth: (px: number) => void;
    retry: () => void;
    focusCampaign: () => void;
    focusSystem: () => void;
};

let current: ViewFrame | null = null;
const listeners = new Set<() => void>();

export function frame(): ViewFrame | null {
    return current;
}

export function setFrame(next: ViewFrame | null): void {
    current = next;
    for (const hear of listeners) hear();
}

export function onFrame(hear: () => void): () => void {
    listeners.add(hear);
    return () => { listeners.delete(hear); };
}

let escapeAsk: (() => boolean) | null = null;

export function setPaneEscape(ask: (() => boolean) | null): void {
    escapeAsk = ask;
}

/** One pane Escape, handled by the host. False when the pane has nothing to close. */
export function askPaneEscape(): boolean {
    return escapeAsk ? escapeAsk() : false;
}
