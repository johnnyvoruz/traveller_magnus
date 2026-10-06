/**
 * Temperatures people can feel (campaign_manager_plan.md §7.5, as decided by Johnny on
 * 2026-10-03, Q6): both scales, Celsius first, `18°C (64°F)`. Values are stored and computed
 * in kelvin or Celsius and converted to Fahrenheit only here, from the unrounded Celsius
 * figure; each figure is rounded to whole degrees on its own. Negative values carry a true
 * minus sign. Worlds stay on these two scales. A star's temperature is formatKelvin
 * (`5,800 K`); kelvinNote is the kelvin figure for a world's tooltip.
 */

export const KELVIN_AT_ZERO_C = 273.15;
const MINUS = '−';

export function celsiusOf(kelvin: number): number {
    return kelvin - KELVIN_AT_ZERO_C;
}

export function fahrenheitOf(celsius: number): number {
    return celsius * 9 / 5 + 32;
}

/** A whole number with thousands separators and a true minus sign; never "−0". */
export function wholeDegrees(value: number): string {
    const rounded = Math.round(value);
    const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (rounded < 0 ? MINUS : '') + digits;
}

/** `18°C (64°F)`, or an empty string when the value is not a number. */
export function formatTemp(kelvin: unknown): string {
    if (typeof kelvin !== 'number' || !Number.isFinite(kelvin)) return '';
    const celsius = celsiusOf(kelvin);
    return wholeDegrees(celsius) + '°C (' + wholeDegrees(fahrenheitOf(celsius)) + '°F)';
}

/** §7.5 full style: `15 °C · 59 °F · 288 K`. Empty when the value is not a number. */
export function formatTempFull(kelvin: unknown): string {
    if (typeof kelvin !== 'number' || !Number.isFinite(kelvin)) return '';
    const celsius = celsiusOf(kelvin);
    return wholeDegrees(celsius) + ' °C · ' + wholeDegrees(fahrenheitOf(celsius)) + ' °F · ' + wholeDegrees(kelvin) + ' K';
}

/** A star's temperature: `5,800 K`. Empty when the value is not a number. Worlds use formatTemp. */
export function formatKelvin(kelvin: unknown): string {
    if (typeof kelvin !== 'number' || !Number.isFinite(kelvin)) return '';
    return wholeDegrees(kelvin) + ' K';
}

/** `Mean 288 K`: the kelvin figure, for a world's tooltip only. */
export function kelvinNote(label: string, kelvin: unknown): string {
    if (typeof kelvin !== 'number' || !Number.isFinite(kelvin)) return '';
    return label + ' ' + wholeDegrees(kelvin) + ' K';
}

/**
 * A full temperature (`15 °C · 59 °F · 288 K`) as its three figures, one for each line of a
 * tile or a row; null for any other text. The panels stack them instead of running them
 * together with dots.
 */
export function tempLines(text: string): string[] | null {
    const parts = text.split(' \u00B7 ');
    if (parts.length !== 3) return null;
    const [celsius, fahrenheit, kelvin] = parts as [string, string, string];
    if (!celsius.endsWith('\u00B0C') || !fahrenheit.endsWith('\u00B0F') || !kelvin.endsWith(' K')) return null;
    return [celsius, fahrenheit, kelvin];
}

/** At or beyond this share of an astronomical unit a distance is said in AU; nearer, in kilometres. */
const AU_FROM = 0.1;

/**
 * A distance in space: `384,000 km` (three significant figures), or `1.52 AU` from a tenth of
 * an AU out. `auKm` is the length of the AU the caller's own model uses (orbit/layout.ts
 * AU_KM): this file holds no astronomy. Empty when the value is not a distance.
 */
export function formatDistance(km: unknown, auKm: number): string {
    if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return '';
    const au = km / auKm;
    if (au >= AU_FROM) return (au >= 10 ? au.toFixed(1) : au.toFixed(2)) + ' AU';
    if (km < 1000) return wholeDegrees(km) + ' km';
    const scale = Math.pow(10, Math.floor(Math.log10(km)) - 2);
    return wholeDegrees(Math.round(km / scale) * scale) + ' km';
}
