/**
 * The plain data the hybrid map is drawn from, read once from a released body. Everything
 * the generator needs is here and nothing else; the cache key carries a digest of it, so a
 * change to the world's data repaints the map and a change elsewhere does not.
 *
 * One temperature source: the engine's meanTempK, lowTempK and highTempK. Trade codes only
 * flavour the result (De, Po, Ag, Ga, Ic, Va, Na, Pe), they never set a temperature.
 */
import { enhancedSeedKey } from '../identity.ts';
import { phaseOf, UNKNOWN_LIQUID } from './liquids.ts';

type Body = Readonly<Record<string, unknown>> | null | undefined;

/** Bumped whenever a change would redraw an unedited map. Part of the cache key and of saved hex data. */
export const HYBRID_SURFACE_VERSION = 'hybrid-surface-1';

export type HybridWorld = {
    /** Name-independent: enhancedSeedKey(hexKey, dossierKey). */
    readonly seed: string;
    /** Grid side n: the size digit, at least 1. */
    readonly size: number;
    readonly diamKm: number;
    readonly atm: number;
    readonly hydro: number;
    readonly hydroPercent: number;
    readonly pop: number;
    readonly port: string;
    readonly trade: readonly string[];
    readonly meanK: number;
    readonly lowK: number;
    readonly highK: number;
    /** Where the temperatures came from: 'engine', or 'band' when only the climate word was given. */
    readonly tempSource: 'engine' | 'band';
    readonly tilt: number;
    readonly yearHours: number;
    readonly pressure: number;
    /** The sea's liquid, 'Unknown Exotic Liquid', or null for a dry world. */
    readonly liquid: string | null;
    /** True when the data named no liquid (or an unresolved one) and water was assumed. */
    readonly liquidAssumed: boolean;
    readonly meltK: number | null;
    readonly boilK: number | null;
    /** A planet that keeps one face to its star. */
    readonly locked: boolean;
    readonly seismic: number;
    readonly resource: number;
    readonly bases: readonly ('naval' | 'scout' | 'military')[];
    /** T5 data only: noble estates (from nobleCodes) and a penal colony (Pe). */
    readonly estates: number;
    readonly penal: boolean;
    readonly continental: number;
    readonly coastline: number;
};

const digit = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^[0-9A-Za-z]$/.test(value.trim())) {
        const v = parseInt(value.trim(), 36);
        return Number.isFinite(v) ? v : null;
    }
    return null;
};
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function uwpDigit(body: Record<string, unknown>, index: number): number | null {
    return typeof body.uwp === 'string' && body.uwp.length > index ? digit(body.uwp[index]) : null;
}

function firstDigit(body: Record<string, unknown>, keys: readonly string[], uwpIndex: number): number | null {
    for (const key of keys) {
        const v = digit(body[key]);
        if (v !== null) return v;
    }
    return uwpDigit(body, uwpIndex);
}

function tradeCodes(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean);
    return [];
}

/** Climate words, for a body that has no engine temperatures. A fallback only. */
const BAND_K: Readonly<Record<string, number>> = { Frozen: 200, Cold: 255, Temperate: 288, Hot: 318, Boiling: 360 };

function statusOf(field: unknown): string | null {
    if (!field || typeof field !== 'object') return null;
    const status = (field as { status?: unknown }).status;
    return typeof status === 'string' ? status : null;
}

/** The sea's liquid. Water and Ice are one liquid; an unresolved or unnamed sea is water, and says so. */
function seaLiquid(body: Record<string, unknown>, hydroPercent: number): { liquid: string | null; assumed: boolean } {
    if (!(hydroPercent > 0)) return { liquid: null, assumed: false };
    if (statusOf(body.liquidStatus) === 'none') return { liquid: null, assumed: false };
    const named = typeof body.liquidType === 'string' ? body.liquidType.trim() : '';
    if (named === 'Water' || named === 'Ice') return { liquid: 'Water', assumed: false };
    if (named === UNKNOWN_LIQUID) return { liquid: UNKNOWN_LIQUID, assumed: false };
    if (named && phaseOf(named)) return { liquid: named, assumed: false };
    return { liquid: 'Water', assumed: true };
}

/** Inputs for the hybrid map of one body, or null when it has no surface to map. */
export function hybridWorld(hexKey: string, dossierKey: string, body: Body, options?: { continental?: number; coastline?: number }): HybridWorld | null {
    if (!body) return null;
    const b = body as Record<string, unknown>;
    const size = firstDigit(b, ['size', 'sizeCode'], 1);
    if (size === null || !(size > 0) || size > 15) return null;
    const atm = firstDigit(b, ['atmCode', 'atm'], 2) ?? 0;
    const hydroDigit = firstDigit(b, ['hydroCode', 'hydro'], 3) ?? 0;
    const percent = finite(b.hydroPercent);
    const hydroPercent = Math.max(0, Math.min(100, percent ?? Math.min(10, hydroDigit) * 10));
    const pop = firstDigit(b, ['popCode', 'pop'], 4) ?? 0;
    const port = typeof b.starport === 'string' && b.starport ? b.starport.trim().charAt(0).toUpperCase()
        : typeof b.uwp === 'string' && b.uwp ? b.uwp.charAt(0).toUpperCase() : 'X';
    let mean = finite(b.meanTempK);
    let low = finite(b.lowTempK);
    let high = finite(b.highTempK);
    let tempSource: 'engine' | 'band' = 'engine';
    if (mean === null) {
        const band = typeof b.tempBand === 'string' ? BAND_K[b.tempBand] : undefined;
        mean = band ?? 288;
        tempSource = 'band';
    }
    if (low === null || low > mean) low = mean - 15;
    if (high === null || high < mean) high = mean + 15;
    const sea = seaLiquid(b, hydroPercent);
    const phase = sea.liquid ? phaseOf(sea.liquid) : null;
    const moon = b.isMoon === true || b.isSatellite === true || b.type === 'Satellite';
    const locked = !moon && (b.tidallyLocked === true || b.isTwilightZone === true);
    const baseCodes = typeof b.baseCodes === 'string' ? b.baseCodes : '';
    const bases: ('naval' | 'scout' | 'military')[] = [];
    if (b.navalBase === true || /N/.test(baseCodes)) bases.push('naval');
    if (b.scoutBase === true || /[SW]/.test(baseCodes)) bases.push('scout');
    if (b.militaryBase === true || /M/.test(baseCodes)) bases.push('military');
    const trade = tradeCodes(b.tradeCodes);
    const nobles = typeof b.nobleCodes === 'string' ? b.nobleCodes.replace(/[^A-Za-z]/g, '') : '';
    const diam = finite(b.diamKm);
    return {
        seed: enhancedSeedKey(hexKey, dossierKey),
        size: Math.max(1, Math.round(size)),
        diamKm: diam && diam > 0 ? diam : size * 1600,
        atm,
        hydro: sea.liquid ? Math.max(1, Math.min(10, hydroDigit || Math.round(hydroPercent / 10))) : 0,
        hydroPercent: sea.liquid ? hydroPercent : 0,
        pop,
        port,
        trade,
        meanK: mean,
        lowK: low,
        highK: high,
        tempSource,
        tilt: finite(b.axialTilt) ?? 0,
        yearHours: finite(b.yearHours) ?? 8766,
        pressure: finite(b.pressureBar) ?? finite(b.totalPressureBar) ?? (atm <= 1 ? 0 : 1),
        liquid: sea.liquid,
        liquidAssumed: sea.assumed,
        meltK: phase ? phase.meltK : null,
        boilK: phase ? phase.boilK : null,
        locked,
        seismic: finite(b.seismicStress) ?? 0,
        resource: digit(b.resourceRating) ?? 0,
        bases,
        estates: Math.min(3, nobles.length),
        penal: trade.includes('Pe'),
        continental: options?.continental ?? 0.55,
        coastline: options?.coastline ?? 0.45,
    };
}

/** FNV-1a over the inputs, in a fixed field order. For the cache key. */
export function worldDigest(world: HybridWorld): string {
    const text = JSON.stringify(world, Object.keys(world).sort());
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + ':' + text.length;
}
