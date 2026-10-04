import { storageGet, storageSet } from '../platform/browser.ts';
import { registerCommand, type Command } from '../shell/registry.ts';
import type { EnhancedFlags, SurfaceMode } from './contracts.ts';

const MODE_KEY = 'voyage_surfaces';
const FLAG_KEY = 'voyage_surface_flags';

export const SURFACE_COMMAND_ID = 'surfaces';

const DEFAULT_FLAGS: EnhancedFlags = {
    seasonalIce: false,
    paletteVariants: false,
    movingClouds: false,
    lightning: false,
};

const modeListeners = new Set<(mode: SurfaceMode) => void>();

/** Calls back whenever the mode is set. Returns the function that stops it. */
export function onSurfaceMode(listener: (mode: SurfaceMode) => void): () => void {
    modeListeners.add(listener);
    return () => { modeListeners.delete(listener); };
}

let sessionMode: SurfaceMode | null = null;
let modeSessionOnly = false;
let sessionFlags: EnhancedFlags = { ...DEFAULT_FLAGS };
let flagsSessionOnly = false;

function flagsFrom(raw: string | null): EnhancedFlags | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<EnhancedFlags> | null;
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            seasonalIce: parsed.seasonalIce === true,
            paletteVariants: parsed.paletteVariants === true,
            movingClouds: parsed.movingClouds === true,
            lightning: parsed.lightning === true,
        };
    } catch {
        return null;
    }
}

/** vanilla unless a stored or session choice says enhanced. A blocked store keeps the session choice. */
export function surfaceMode(): SurfaceMode {
    if (modeSessionOnly && sessionMode) return sessionMode;
    let raw: string | null = null;
    try {
        raw = storageGet(MODE_KEY);
    } catch {
        modeSessionOnly = true;
        return sessionMode ?? 'vanilla';
    }
    if (raw === 'vanilla' || raw === 'enhanced') {
        sessionMode = raw;
        modeSessionOnly = false;
        return raw;
    }
    if (modeSessionOnly && sessionMode) return sessionMode;
    sessionMode = 'vanilla';
    return 'vanilla';
}

export function setSurfaceMode(mode: SurfaceMode): void {
    sessionMode = mode;
    try {
        storageSet(MODE_KEY, mode);
        modeSessionOnly = storageGet(MODE_KEY) !== mode;
    } catch {
        modeSessionOnly = true;
    }
    refreshSurfaceCommand();
    for (const listener of [...modeListeners]) listener(mode);
}

export function toggleSurfaceMode(): void {
    setSurfaceMode(surfaceMode() === 'enhanced' ? 'vanilla' : 'enhanced');
}

/** All four flags off until a stored or session choice turns one on. */
export function enhancedFlags(): EnhancedFlags {
    if (flagsSessionOnly) return sessionFlags;
    let raw: string | null = null;
    try {
        raw = storageGet(FLAG_KEY);
    } catch {
        flagsSessionOnly = true;
        return sessionFlags;
    }
    const parsed = flagsFrom(raw);
    if (parsed) {
        sessionFlags = parsed;
        flagsSessionOnly = false;
        return sessionFlags;
    }
    if (flagsSessionOnly) return sessionFlags;
    sessionFlags = { ...DEFAULT_FLAGS };
    return sessionFlags;
}

export function setEnhancedFlags(next: Partial<EnhancedFlags>): void {
    const current = enhancedFlags();
    sessionFlags = {
        seasonalIce: next.seasonalIce ?? current.seasonalIce,
        paletteVariants: next.paletteVariants ?? current.paletteVariants,
        movingClouds: next.movingClouds ?? current.movingClouds,
        lightning: next.lightning ?? current.lightning,
    };
    const encoded = JSON.stringify(sessionFlags);
    try {
        storageSet(FLAG_KEY, encoded);
        flagsSessionOnly = storageGet(FLAG_KEY) !== encoded;
    } catch {
        flagsSessionOnly = true;
    }
}

function modeLabel(mode: SurfaceMode): string {
    return mode === 'enhanced' ? 'Surfaces: Enhanced' : 'Surfaces: Vanilla';
}

const surfaceCommand: Command = {
    id: SURFACE_COMMAND_ID,
    name: 'Surfaces: Vanilla',
    run: toggleSurfaceMode,
};

function refreshSurfaceCommand(): void {
    surfaceCommand.name = modeLabel(surfaceMode());
}

registerCommand(surfaceCommand);
refreshSurfaceCommand();
