/**
 * Temperatures people can feel (campaign_manager_plan.md §7.5, as decided by Johnny on
 * 2026-10-03, Q6): both scales, Celsius first, `18°C (64°F)`. Values are stored and computed
 * in kelvin or Celsius and converted to Fahrenheit only here, from the unrounded Celsius
 * figure; each figure is rounded to whole degrees on its own. Negative values carry a true
 * minus sign. Kelvin is not shown on a card; kelvinNote is for a tooltip.
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

/** `Mean 288 K`: the kelvin figure, for a tooltip only. */
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
