import type { Pin } from './hexes';

/**
 * The twelve generation keys. The same values as tools/truth/settings.js,
 * which are a fresh map's defaults. A universe keeps the first copy it stores.
 */
export const DEFAULT_GENERATION_SETTINGS: Record<string, number | boolean | string> = {
    generationPopMax: 20,
    generationPopMod: 0,
    generationTlMax: 20,
    generationTlMod: 0,
    generationUseRealisticStellar: false,
    generationUseTlFloor: false,
    generationRttSettlement: 2,
    generationRttTL: 15,
    generationStarportMax: 'A',
    generationStarportMod: 0,
    generationNoTravelZones: false,
    generationPopCheckFrequency: 100,
};

export const DEFAULT_GENERATION_SEED = 'TravellerMagnus';

export function defaultPin(truthVersion: string | null): Pin {
    return {
        seed: DEFAULT_GENERATION_SEED,
        settings: DEFAULT_GENERATION_SETTINGS,
        truthVersion,
    };
}
