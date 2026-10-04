/**
 * Drawing seeds and cache identity. The vanilla seed strings are the legacy
 * concatenations. The cache key is a separate string and is never appended
 * to those seeds.
 */
import { tempBandFromKelvin } from './profile.ts';
import type { SurfaceMode } from './contracts.ts';

type Body = Record<string, any>;

export type WorldMapData = {
    name: string;
    atmosphere: unknown;
    hydrographics: unknown;
    temperature: string;
    temperatureK: number;
    size: unknown;
    uwp: string;
};

export type DiamondMapSpec = { worldData: WorldMapData; seed: string };

export type MapSeedStrings = { ph: string; cn: string; oc: string };

/**
 * Recorded slider defaults (js/planet_renderer.js:1086-1087).
 * They are not part of the ph / cn / oc seed strings.
 */
export const CONTINENTAL_DEFINITION = 0.55;
export const COASTLINE_COMPLEXITY = 0.45;

/**
 * Recorded deviation. The vanilla master seed is this fixed string.
 * The new app has no old device master seed.
 */
export const VANILLA_MASTER_SEED = 'TravellerMagnus';

/** js/planet_renderer.js:1078-1081. */
export function imageSeed(hexId: string, body: { name?: unknown } | null | undefined, fallback?: string): string {
    const name = (body && typeof body.name === 'string') ? body.name.trim() : '';
    return `${hexId || '0000'}-${name || fallback || 'w0'}`;
}

/**
 * The three flat-map seed strings. js/planet_renderer.js:1176-1182 hashes
 * masterSeed + '-' + (imageSeed || '0000') + '-ph'|'-cn'|'-oc'.
 * This returns those strings. It does not hash them.
 */
export function mapSeedStrings(masterSeed: string, image: string): MapSeedStrings {
    const slot = image || '0000';
    const base = masterSeed + '-' + slot;
    return { ph: base + '-ph', cn: base + '-cn', oc: base + '-oc' };
}

/** js/hex_editor.js:2295-2321. */
export function worldMapData(body: Body): WorldMapData {
    const uwp = typeof body.uwp === 'string' ? body.uwp : '';
    const fromUwp = (index: number): number | null => {
        const n = parseInt(uwp[index], 16);
        return Number.isFinite(n) ? n : null;
    };
    const size = body.size ?? fromUwp(1) ?? 0;
    const atmosphere = body.atmCode ?? body.atm ?? body.atmosphere ?? fromUwp(2) ?? 0;
    let hydro = body.hydroCode ?? body.hydro ?? body.hydrographics ?? body.hydrosphere;
    if (hydro == null || hydro === '') {
        hydro = (typeof body.hydroPercent === 'number') ? body.hydroPercent / 10 : (fromUwp(3) ?? 0);
    }
    const temperatureK = Number(body.meanTempK || body.avgSurfaceTemp || body.temperatureK || 0) || 0;
    // The legacy page called the renderer only when its band function was loaded.
    // The port of js/planet_renderer.js:1045-1052 is always loaded here.
    let temperature = body.tempBand || '';
    if (!temperature && temperatureK > 0) temperature = tempBandFromKelvin(temperatureK);
    return {
        name: (body.name && String(body.name).trim()) || '',
        atmosphere,
        hydrographics: hydro,
        temperature,
        temperatureK,
        size,
        uwp,
    };
}

/** js/hex_editor.js:2323-2327. */
function worldMapSizeCode(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return parseInt(value, 16) || 0;
    return 0;
}

/** js/hex_editor.js:2329. */
const WORLD_MAP_SKIP = new Set(['Gas Giant', 'Planetoid Belt', 'Empty', 'Star', 'Asteroid Belt']);

/** js/hex_editor.js:2331-2334. */
export function canMapWorld(body: Body | null | undefined): boolean {
    if (!body || WORLD_MAP_SKIP.has(body.type)) return false;
    if (body.sType != null && body.size == null && !body.uwp) return false;
    return worldMapSizeCode(worldMapData(body).size) > 0;
}

/** js/hex_editor.js:2339-2347. The page-renderer presence check is met by this port. */
export function diamondMapSpec(body: Body | null | undefined, hexId: string): DiamondMapSpec | null {
    if (!body || !canMapWorld(body)) return null;
    const worldData = worldMapData(body);
    const named = worldData.name;
    const fallback = [body.type || 'body', body.orbitId, body.au, body.pd, body.uwp, body.size]
        .filter(v => v != null && v !== '').join('-');
    const seed = imageSeed(hexId, named ? body : worldData, fallback || undefined);
    return { worldData, seed };
}

export const legacyMapInputs = { worldMapData, canMapWorld, diamondMapSpec };

/**
 * js/system_viewer.js:3655-3657. hexId stands in for the closed-over page hex.
 * || and ?? are kept as the legacy line writes them. There is no master seed.
 */
export function legacyDiscId(hexId: string, body: Body, kind: unknown): string {
    return `${hexId || ''}|${body.name || ''}|${body.type || ''}|${body.uwp || ''}|${body.diamKm || body.diam || ''}|${body.au ?? ''}|${body.pd ?? ''}|${kind}`;
}

/**
 * Recorded deviation. The full released hex key is passed as the legacy hex id,
 * and the vanilla master seed is TravellerMagnus. The full key differs from the
 * old hex id. This is not old-site identity.
 */
export function productionMapSeeds(hexKey: string, body: Body | null | undefined): ({ imageSeed: string } & MapSeedStrings) | null {
    const spec = diamondMapSpec(body, hexKey);
    if (!spec) return null;
    return { imageSeed: spec.seed, ...mapSeedStrings(VANILLA_MASTER_SEED, spec.seed) };
}

/** Same recorded deviation for the disc id: the full hex key, and no master seed. */
export function productionDiscId(hexKey: string, body: Body, kind: unknown): string {
    return legacyDiscId(hexKey, body, kind);
}

/**
 * Enhanced drawing seed. Independent of body names.
 * Length-prefixed so the hex key and the dossier key cannot be split two ways:
 * "<hexLen>:<hexKey>|<dossierLen>:<dossierKey>".
 */
export function enhancedSeedKey(hexKey: string, dossierKey: string): string {
    return hexKey.length + ':' + hexKey + '|' + dossierKey.length + ':' + dossierKey;
}

export type SurfaceCacheIdentity = {
    hexKey: string;
    dossierKey: string;
    revision: string;
    mode: SurfaceMode;
    algorithm: string;
    palette: string;
    options: string;
    resolution: string;
};

/**
 * Cache identity. Field order: hex key, dossier key, source revision, mode,
 * algorithm version, palette version, drawing options, resolution.
 * Body names and zoom are not fields. Do not append this to a vanilla seed.
 */
export function surfaceCacheKey(identity: SurfaceCacheIdentity): string {
    const fields = [
        identity.hexKey,
        identity.dossierKey,
        identity.revision,
        identity.mode,
        identity.algorithm,
        identity.palette,
        identity.options,
        identity.resolution,
    ];
    return fields.map((field) => field.length + ':' + field).join('|');
}
