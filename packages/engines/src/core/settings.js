export const settings = {
    generationPopMax: 20, generationPopMod: 0, generationTlMax: 20, generationTlMod: 0,
    generationUseRealisticStellar: false, generationUseTlFloor: false,
    generationRttSettlement: 2, generationRttTL: 15, generationStarportMax: 'A', generationStarportMod: 0,
    generationNoTravelZones: false,
    generationPopCheckFrequency: 100
};

export function configure(partial) {
    if (!partial) return;
    for (const key of Object.keys(partial)) settings[key] = partial[key];
}

export const genState = { currentSystemHasPop: false };
