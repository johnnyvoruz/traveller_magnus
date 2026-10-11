/**
 * Melting and boiling points of the exotic liquids table, for the hybrid map.
 * Copied from packages/engines/src/generated/rules/mgt2e_data.js (atmosphereExtended.exoticLiquids,
 * mp and bp). The viewer does not import the engines; tests/web/surface_hybrid.test.js checks this
 * copy against that export.
 */
import { EXOTIC_LIQUIDS } from '../enhanced/liquids.ts';

export const BOILING_K: Readonly<Record<string, number>> = {
    'Fluorine': 85,
    'Oxygen': 90,
    'Methane': 113,
    'Ethane': 184,
    'Chlorine': 239,
    'Ammonia': 240,
    'Sulphur Dioxide': 263,
    'Hydrofluoric Acid': 293,
    'Hydrogen Cyanide': 299,
    'Hydrochloric Acid': 321,
    'Water': 373,
    'Formic Acid': 374,
    'Formamide': 483,
    'Carbonic Acid': 607,
    'Sulphuric Acid': 718,
};

export const UNKNOWN_LIQUID = 'Unknown Exotic Liquid';

export type Phase = { readonly meltK: number; readonly boilK: number };

/** Melting and boiling points of a named liquid, or null for an unknown one. */
export function phaseOf(name: string | null): Phase | null {
    if (!name) return null;
    const row = EXOTIC_LIQUIDS.find((item) => item.name === name);
    const boil = BOILING_K[name];
    return row && typeof boil === 'number' ? { meltK: row.meltingK, boilK: boil } : null;
}
