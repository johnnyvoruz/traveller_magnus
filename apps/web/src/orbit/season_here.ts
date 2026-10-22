/**
 * Season words and the climate band at a campaign date.
 * The season line is seasons.ts (decisions A1, A2, A9). This file adds the
 * temperature band from rules/mgt2e_climate_bands.json. Keys: unit, bands, word, maxC.
 * The file's unit is C and each band includes its maxC. The last maxC is null.
 * The tree's mean is Kelvin, so 0 °C is 273.15 K. No band threshold is written here.
 * The dossier does not classify, so this stays beside the season line.
 */
import table from '../../../../rules/mgt2e_climate_bands.json' with { type: 'json' };
import { seasonLine, type SeasonInput } from './seasons.ts';

const KELVIN_AT_0C = 273.15;

type BandRow = { word?: unknown; maxC?: unknown };

function rows(): BandRow[] | null {
    if (table.unit !== 'C' || !Array.isArray(table.bands)) return null;
    return table.bands;
}

/** The file's word for a mean surface temperature in °C, or null when the mean or the file is unusable. */
export function climateBand(meanC: number | null): string | null {
    if (meanC == null || !Number.isFinite(meanC)) return null;
    const bands = rows();
    if (!bands) return null;
    for (const row of bands) {
        if (typeof row.word !== 'string' || row.word.trim() === '') return null;
        if (row.maxC == null) return row.word;
        if (typeof row.maxC !== 'number' || !Number.isFinite(row.maxC)) return null;
        if (meanC <= row.maxC) return row.word;
    }
    return null;
}

export type SeasonHere = {
    /** The season line's first statement, or null when the body has no tilt to read. */
    season: string | null;
    /** The orbit-driven second line, or empty. */
    orbit: string;
    /** The climate word for the mean, or null when the tree has no mean. */
    band: string | null;
};

/**
 * `input.angle` is the orrery angle on the campaign date (`bodyAngle`).
 * `meanTempK` is the generated tree's mean surface temperature.
 */
export function seasonHere(input: SeasonInput, meanTempK: number | null): SeasonHere {
    const line = seasonLine(input);
    const meanC = meanTempK == null || !Number.isFinite(meanTempK) ? null : meanTempK - KELVIN_AT_0C;
    return {
        season: line ? line.lines[0] : null,
        orbit: line ? line.orbit : '',
        band: climateBand(meanC),
    };
}
