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

/**
 * Enhanced until a stored choice says vanilla or enhanced.
 * A blocked store keeps the session choice. With no session choice it is enhanced.
 * An empty or unrecognised stored value is not a choice.
 */
export function surfaceMode(): SurfaceMode {
    if (modeSessionOnly && sessionMode) return sessionMode;
    let raw: string | null = null;
    try {
        raw = storageGet(MODE_KEY);
    } catch {
        modeSessionOnly = true;
        return sessionMode ?? 'enhanced';
    }
    if (raw === 'vanilla' || raw === 'enhanced') {
        sessionMode = raw;
        modeSessionOnly = false;
        return raw;
    }
    sessionMode = 'enhanced';
    return 'enhanced';
}

/** Forget the in-memory choice. The next read comes from storage, or enhanced when that is empty. */
export function resetSurfaceSession(): void {
    sessionMode = null;
    modeSessionOnly = false;
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
    name: 'Surfaces: Enhanced',
    run: toggleSurfaceMode,
};

function refreshSurfaceCommand(): void {
    surfaceCommand.name = modeLabel(surfaceMode());
}

registerCommand(surfaceCommand);
refreshSurfaceCommand();

// ---- Hybrid map: painted or with the symbol overlay, and which icon set ----------------------

export type MapStyle = 'painted' | 'symbols';

const STYLE_KEY = 'voyage_surface_style';
const ICON_SET_KEY = 'voyage_surface_icons';
/** The icon set used when none is chosen: public/surface-icons/default/. */
export const DEFAULT_ICON_SET_NAME = 'default';

let sessionStyle: MapStyle | null = null;
let sessionIconSet: string | null = null;
const styleListeners = new Set<(style: MapStyle) => void>();

/** Painted until a stored choice says symbols. */
export function mapStyle(): MapStyle {
    if (sessionStyle) return sessionStyle;
    try {
        const raw = storageGet(STYLE_KEY);
        if (raw === 'painted' || raw === 'symbols') return raw;
    } catch {
        // A blocked store: painted.
    }
    return 'painted';
}

export function setMapStyle(style: MapStyle): void {
    sessionStyle = style;
    try {
        storageSet(STYLE_KEY, style);
    } catch {
        // The session keeps it.
    }
    for (const listener of [...styleListeners]) listener(style);
}

export function onMapStyle(listener: (style: MapStyle) => void): () => void {
    styleListeners.add(listener);
    return () => { styleListeners.delete(listener); };
}

/** The icon set's folder name under public/surface-icons/. 'default' unless one is stored. */
export function iconSetName(): string {
    if (sessionIconSet) return sessionIconSet;
    try {
        const raw = storageGet(ICON_SET_KEY);
        if (raw && /^[a-z0-9][a-z0-9_-]{0,40}$/.test(raw)) return raw;
    } catch {
        // A blocked store: the default set.
    }
    return DEFAULT_ICON_SET_NAME;
}

/** Choose an icon set by folder name; null goes back to the default. */
export function setIconSetName(name: string | null): void {
    const next = name && /^[a-z0-9][a-z0-9_-]{0,40}$/.test(name) ? name : DEFAULT_ICON_SET_NAME;
    sessionIconSet = next;
    try {
        storageSet(ICON_SET_KEY, next);
    } catch {
        // The session keeps it.
    }
}

// ---- Hybrid map: the day and night overlay ---------------------------------------------------

const DAY_NIGHT_KEY = 'voyage_surface_daynight';

let sessionDayNight: boolean | null = null;
const dayNightListeners = new Set<(on: boolean) => void>();

/** The day and night overlay over the hybrid map. On until a stored choice says off. */
export function dayNightOverlay(): boolean {
    if (sessionDayNight !== null) return sessionDayNight;
    try {
        const raw = storageGet(DAY_NIGHT_KEY);
        if (raw === 'off') return false;
        if (raw === 'on') return true;
    } catch {
        // A blocked store: on.
    }
    return true;
}

export function setDayNightOverlay(on: boolean): void {
    sessionDayNight = on;
    try {
        storageSet(DAY_NIGHT_KEY, on ? 'on' : 'off');
    } catch {
        // The session keeps it.
    }
    for (const listener of [...dayNightListeners]) listener(on);
}

export function onDayNightOverlay(listener: (on: boolean) => void): () => void {
    dayNightListeners.add(listener);
    return () => { dayNightListeners.delete(listener); };
}
