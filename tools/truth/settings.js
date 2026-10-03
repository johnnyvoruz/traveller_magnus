// Every generation key an engine reads. Values 1-10 copy utilities/build_universe_snapshot/pack.js.
// Values 11-12 decided 2026-10-02: rules as written. Travel zones are rolled (false) and population is
// always generated (100). These equal a fresh browser's defaults (ui_menus.js:4533, :4627), so truth v1
// reproduces what the legacy app has always produced.
export const TRUTH_SETTINGS = Object.freeze({
    generationPopMax: 20, generationPopMod: 0, generationTlMax: 20, generationTlMod: 0,
    generationUseRealisticStellar: false, generationUseTlFloor: false,
    generationRttSettlement: 2, generationRttTL: 15, generationStarportMax: 'A', generationStarportMod: 0,
    generationNoTravelZones: false,
    generationPopCheckFrequency: 100
});
export const TRUTH_SEED = 'TravellerMagnus';
export const TRUTH_MILIEU = 'M1105';
