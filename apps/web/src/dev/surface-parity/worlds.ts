import type { SurfaceMapInputs } from './types.ts';

const shared = {
    masterSeed: 'TravellerMagnus',
    continentalDefinition: 0.55,
    coastlineComplexity: 0.45,
    printMode: false,
    projection: 'diamond',
    temperature: 'Temperate',
    temperatureK: 0,
};

function world(
    id: string,
    hex: string,
    name: string,
    uwp: string,
    size: number,
    atmosphere: number,
    hydrographics: number,
    extra: Partial<SurfaceMapInputs> = {},
    climate: { temperature?: string; temperatureK?: number } = {},
): SurfaceMapInputs {
    return {
        id,
        hexId: `${hex}-${name}`,
        masterSeed: shared.masterSeed,
        continentalDefinition: shared.continentalDefinition,
        coastlineComplexity: shared.coastlineComplexity,
        printMode: shared.printMode,
        projection: shared.projection,
        ...extra,
        worldData: {
            name,
            uwp,
            size,
            atmosphere,
            hydrographics,
            temperature: climate.temperature ?? shared.temperature,
            temperatureK: climate.temperatureK ?? shared.temperatureK,
        },
    };
}

const regina = world('Regina', '1910', 'Regina', 'A788899-C', 7, 8, 8);

/** Published Spinward Marches rows, plus the classifier cases the flat map must match. */
export const PARITY_WORLDS: SurfaceMapInputs[] = [
    regina,
    world('Jewell', '1106', 'Jewell', 'A777999-C', 7, 7, 7),
    world('Efate', '1705', 'Efate', 'A646930-D', 6, 4, 6),
    world('Dry', '0101', 'Dry', 'X840000-0', 8, 4, 0),
    world('Ice', '0102', 'Ice', 'X304000-0', 3, 0, 4, {}, { temperature: 'Frozen', temperatureK: 100 }),
    world('Molten', '0103', 'Molten', 'X615000-0', 6, 1, 15, {}, { temperature: 'Hot', temperatureK: 800 }),
    world('Hydro 0', '0104', 'Rock', 'X300000-0', 3, 0, 0),
    world('Hydro A', '0105', 'HydroA', 'X77A000-0', 7, 7, 10),
    world('Exotic A', '0106', 'Exotic', 'X6A6000-0', 6, 10, 6),
    { ...regina, id: 'Regina print', printMode: true },
    { ...regina, id: 'Regina sliders 0.2/0.9', continentalDefinition: 0.2, coastlineComplexity: 0.9 },
    { ...regina, id: 'Regina sliders 0.85/0.15', continentalDefinition: 0.85, coastlineComplexity: 0.15 },
];
