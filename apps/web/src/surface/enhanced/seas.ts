/**
 * Enhanced sea cover and sea ice. Presentation only. No drawing.
 * Vanilla profiles still infer a liquid from temperature; this module does not.
 */
import { liquidByName, type Liquid } from './liquids.ts';

type Body = Record<string, unknown> | null | undefined;

export type Substance = Liquid & {
    /** liquidType was 'Ice': the data already calls the water frozen. */
    readonly frozenByData: boolean;
};

export type SeaIce =
    | { readonly kind: 'none'; readonly why: string }
    | { readonly kind: 'all'; readonly why: string }
    | { readonly kind: 'caps'; readonly fromLatDeg: number; readonly why: string }
    | { readonly kind: 'locked'; readonly why: string };

const digit = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^[0-9A-Fa-f]$/.test(value.trim())) return parseInt(value.trim(), 16);
    return null;
};

/** Hydro digit: hydroCode, else hydro, else the UWP hydrographics character. Same fields as profile.ts hydroDigit. */
function hydroDigit(body: Record<string, unknown>): number | null {
    const fromCode = digit(body.hydroCode);
    if (fromCode != null) return fromCode;
    const fromHydro = digit(body.hydro);
    if (fromHydro != null) return fromHydro;
    return typeof body.uwp === 'string' ? digit(body.uwp[3]) : null;
}

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * orbit/daynight.ts turningOf: lockedToStar is !moon && (tidallyLocked === true
 * || isTwilightZone === true). A moon faces its planet, so body.isMoon === true
 * is the moon flag that function receives from its caller.
 */
function lockedToStar(body: Record<string, unknown>): boolean {
    const moon = body.isMoon === true;
    return !moon && (body.tidallyLocked === true || body.isTwilightZone === true);
}

/** A in T = mean + A * (1/3 - sin(lat)^2). Limited so the ends stay inside low and high. */
function amplitude(mean: number, low: number, high: number): number {
    return Math.max(0, Math.min(1.5 * (mean - low), 3 * (high - mean)));
}

/** Share of the surface that is sea, 0..1. Null when the body has neither a percent nor a hydro digit. */
export function coverage(body: Body): number | null {
    if (!body) return null;
    const percent = body.hydroPercent;
    if (typeof percent === 'number' && Number.isFinite(percent)) return clamp01(percent / 100);
    const hydro = hydroDigit(body);
    if (hydro == null) return null;
    return clamp01(hydro / 10);
}

/**
 * The generated liquid, looked up by name. 'Ice' is frozen water: water's row
 * with frozenByData. A missing or unknown name is null. Temperature is not consulted.
 */
export function substance(body: Body): Substance | null {
    if (!body) return null;
    const named = body.liquidType;
    if (typeof named !== 'string' || named === '') return null;
    if (named === 'Ice') {
        const water = liquidByName('Water');
        return water ? { name: water.name, meltingK: water.meltingK, frozenByData: true } : null;
    }
    const row = liquidByName(named);
    return row ? { name: row.name, meltingK: row.meltingK, frozenByData: false } : null;
}

/** Kelvin at a latitude in degrees. Null when mean, high or low is missing, or when they contradict. */
export function latitudeTempK(body: Body, latDeg: number): number | null {
    if (!body) return null;
    const mean = finite(body.meanTempK);
    const high = finite(body.highTempK);
    const low = finite(body.lowTempK);
    if (mean == null || high == null || low == null) return null;
    if (!(low <= mean && mean <= high)) return null;
    const sine = Math.sin(latDeg * Math.PI / 180);
    return mean + amplitude(mean, low, high) * (1 / 3 - sine * sine);
}

function none(why: string): SeaIce {
    return { kind: 'none', why };
}

function all(why: string): SeaIce {
    return { kind: 'all', why };
}

/**
 * Where the sea is frozen. The first matching rule in the enhanced list wins:
 * none, then all, then a star-locked world, then polar caps.
 * Throws when the latitude formula has no crossing and neither end rule applies.
 */
export function seaIce(body: Body): SeaIce {
    const cover = coverage(body);
    if (cover == null) return none('no hydroPercent and no hydro digit');
    if (cover === 0) return none('coverage 0');
    const liquid = substance(body);
    if (!liquid) {
        const named = body && typeof body.liquidType === 'string' && body.liquidType !== '' ? body.liquidType : '';
        return none(named ? 'liquidType ' + named + ' is not in the exotic liquids table' : 'no liquidType');
    }
    const row = body as Record<string, unknown>;
    const mean = finite(row.meanTempK);
    const high = finite(row.highTempK);
    const low = finite(row.lowTempK);
    if (mean == null || high == null || low == null) {
        return none('temperatures missing: mean ' + String(row.meanTempK) + ', low ' + String(row.lowTempK) + ', high ' + String(row.highTempK));
    }
    if (!(low <= mean && mean <= high)) {
        return none('temperatures contradictory: low ' + low + ', mean ' + mean + ', high ' + high);
    }
    if (low >= liquid.meltingK) {
        return none('lowTempK ' + low + ' >= meltingK ' + liquid.meltingK + ' (' + liquid.name + ')');
    }
    if (liquid.frozenByData) return all('liquidType Ice, frozen water, meltingK ' + liquid.meltingK);
    if (high < liquid.meltingK) return all('highTempK ' + high + ' < meltingK ' + liquid.meltingK + ' (' + liquid.name + ')');
    if (lockedToStar(row)) {
        const flags = [
            row.tidallyLocked === true ? 'tidallyLocked' : '',
            row.isTwilightZone === true ? 'isTwilightZone' : '',
        ].filter(Boolean);
        return { kind: 'locked', why: 'locked to its star (' + flags.join(', ') + '); no latitude caps' };
    }
    const span = amplitude(mean, low, high);
    const pole = latitudeTempK(row, 90);
    const equator = latitudeTempK(row, 0);
    const sin2 = span === 0 ? Number.NaN : 1 / 3 - (liquid.meltingK - mean) / span;
    if (sin2 >= 0 && sin2 <= 1) {
        const fromLatDeg = Math.asin(Math.sqrt(sin2)) * 180 / Math.PI;
        return {
            kind: 'caps',
            fromLatDeg,
            why: 'crosses meltingK ' + liquid.meltingK + ' (' + liquid.name + ') at ' + fromLatDeg
                + '°: mean ' + mean + ', low ' + low + ', high ' + high + ', A ' + span,
        };
    }
    if (pole != null && pole > liquid.meltingK) {
        return none('pole ' + pole + ' is above meltingK ' + liquid.meltingK + ' (' + liquid.name + ')');
    }
    if (equator != null && equator < liquid.meltingK) {
        return all('equator ' + equator + ' is below meltingK ' + liquid.meltingK + ' (' + liquid.name + ')');
    }
    throw new Error(
        'sea ice rule does not decide: pole ' + String(pole) + ', equator ' + String(equator)
        + ', meltingK ' + liquid.meltingK + ' (' + liquid.name + '), A ' + span,
    );
}
