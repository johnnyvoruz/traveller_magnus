/**
 * MgT2EData.atmosphereExtended.exoticLiquids, name and melting point only,
 * copied from packages/engines/src/generated/rules/mgt2e_data.js
 * (generated from rules/). The viewer does not import the engines.
 * tests/web/surface_seas.test.js asserts this copy stays identical to that export.
 */
export type Liquid = {
    readonly name: string;
    /** Melting point in kelvin. The rules table calls this mp. */
    readonly meltingK: number;
};

export const EXOTIC_LIQUIDS: readonly Liquid[] = [
    { name: 'Fluorine', meltingK: 53 },
    { name: 'Oxygen', meltingK: 54 },
    { name: 'Methane', meltingK: 91 },
    { name: 'Ethane', meltingK: 90 },
    { name: 'Chlorine', meltingK: 171 },
    { name: 'Ammonia', meltingK: 195 },
    { name: 'Sulphur Dioxide', meltingK: 201 },
    { name: 'Hydrofluoric Acid', meltingK: 190 },
    { name: 'Hydrogen Cyanide', meltingK: 260 },
    { name: 'Hydrochloric Acid', meltingK: 247 },
    { name: 'Water', meltingK: 273 },
    { name: 'Formic Acid', meltingK: 281 },
    { name: 'Formamide', meltingK: 275 },
    { name: 'Carbonic Acid', meltingK: 193 },
    { name: 'Sulphuric Acid', meltingK: 388 },
];

/** The table row with this name, or null. Matching is the name string, exact. */
export function liquidByName(name: string): Liquid | null {
    const row = EXOTIC_LIQUIDS.find((item) => item.name === name);
    return row ?? null;
}
