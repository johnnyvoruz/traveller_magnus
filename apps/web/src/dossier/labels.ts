/**
 * Display names copied character for character from
 * packages/engines/src/universal_math.js lines 26-101, plus formatDisplayNumber,
 * formatTradeCodes and formatUwpDigit (lines 11-21 and 103-121). The viewer
 * does not import the engines. A code the tables do not hold is the code alone.
 */

const EHEX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function toEHex(val: unknown): string {
    if (val === undefined || val === null) return '0';
    if (typeof val === 'string' && (val === 'S' || val === 'R' || val === 'GG')) return val;
    const v = Math.floor(Number(val));
    if (isNaN(v) || v < 0) return '0';
    if (v < 10) return v.toString();
    return EHEX_CHARS[v - 10] || 'Z';
}

function fromEHex(char: unknown): number {
    if (char === undefined || char === null || char === '') return 0;
    const c = String(char).trim().toUpperCase();
    if (c === 'R') return 0.1;
    if (c === 'S') return 0.5;
    const ch = c.charAt(0);
    if (ch >= '0' && ch <= '9') return parseInt(ch, 10);
    const idx = EHEX_CHARS.indexOf(ch);
    return idx >= 0 ? idx + 10 : 0;
}

const displayFormats = new Map<number, Intl.NumberFormat>();

export function formatDisplayNumber(value: unknown, decimals = 2, unit = ''): string {
    if (value == null || value === '') return '—';
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    if (!displayFormats.has(decimals)) displayFormats.set(decimals,
        new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }));
    const minimum = Math.pow(10, -decimals);
    const formatted = numeric !== 0 && Math.abs(numeric) < minimum
        ? `${numeric < 0 ? '> −' : '<'}${displayFormats.get(decimals)!.format(minimum)}`
        : displayFormats.get(decimals)!.format(numeric);
    return formatted + (unit ? ` ${unit}` : '');
}

const TRADE_CODE_NAMES: Record<string, string> = {
    Ag: 'Agricultural', As: 'Asteroid Belt', Ba: 'Barren', De: 'Desert',
    Fl: 'Fluid Oceans', Ga: 'Garden', Hi: 'High Population', Ht: 'High Technology',
    Ic: 'Ice-Capped', In: 'Industrial', Lo: 'Low Population', Lt: 'Low Technology',
    Na: 'Non-Agricultural', Ni: 'Non-Industrial', Pa: 'Pre-Agricultural', Po: 'Poor',
    Ri: 'Rich', Sa: 'Satellite', Lk: 'Locked Satellite', St: 'Sterile',
    Va: 'Vacuum', Wa: 'Water World', Zo: 'Zoo'
};
const STARPORT_NAMES: Record<string, string> = {
    A: 'Excellent Starport', B: 'Good Starport', C: 'Routine Starport',
    D: 'Poor Starport', E: 'Frontier Starport or Emergency Beacon', X: 'No starport'
};
const SIZE_NAMES: Record<string, string> = {
    0: '≤800 km, neg. gravity', 1: '1,600 km, 0.05 G',
    2: '3,200 km, 0.15 G (Triton, Luna, Europa)', 3: '4,800 km, 0.25 G (Mercury, Ganymede)',
    4: '6,400 km, 0.35 G (Mars)', 5: '8,000 km, 0.45 G', 6: '9,600 km, 0.70 G',
    7: '11,200 km, 0.9 G', 8: '12,800 km, 1.0 G (Terra)', 9: '14,400 km, 1.25 G',
    A: '≥16,000 km, ≥1.4 G', B: 'Helian sizes', C: 'Helian sizes', D: 'Helian sizes',
    E: 'Helian sizes', G: 'Jovian sizes', X: 'Planetary-Mass Artifact', Y: 'Asteroid Belt'
};
const ATMOSPHERE_NAMES: Record<string, string> = {
    0: 'Vacuum', 1: 'Trace', 2: 'Very Thin Tainted', 3: 'Very Thin Breathable',
    4: 'Thin Tainted', 5: 'Thin Breathable', 6: 'Standard Breathable',
    7: 'Standard Tainted', 8: 'Dense Breathable', 9: 'Dense Tainted',
    A: 'Exotic', B: 'Corrosive', C: 'Insidious', D: 'Super-High Density',
    G: 'Gas Giant Envelope'
};
const HYDRO_NAMES: Record<string, string> = {
    0: '≤5% (Trace)', 1: '≤15% (Dry / tiny ice caps)', 2: '≤25% (Small seas / ice caps)',
    3: '≤35% (Small oceans / large ice caps)', 4: '≤45% (Wet)', 5: '≤55% (Large oceans)',
    6: '≤65%', 7: '≤75% (Terra)', 8: '≤85% (Water world)', 9: '≤95% (No continents)',
    A: '≤100% (Total coverage)', B: 'Superdense (incredibly deep world oceans)'
};
const POPULATION_NAMES: Record<string, string> = {
    0: 'Uninhabited', 1: 'Few', 2: 'Hundreds', 3: 'Thousands', 4: 'Tens of thousands',
    5: 'Hundreds of thousands', 6: 'Millions', 7: 'Tens of millions',
    8: 'Hundreds of millions', 9: 'Billions', A: 'Tens of billions',
    B: 'Hundreds of billions', C: 'Trillions'
};
const GOVERNMENT_NAMES: Record<string, string> = {
    0: 'None (tends toward family/clan/tribal)', 1: 'Company or corporation',
    2: 'Participatory democracy', 3: 'Self-perpetuating oligarchy',
    4: 'Representative democracy', 5: 'Feudal technocracy',
    6: 'Captive government (colony or conquered territory)', 7: 'Balkanized',
    8: 'Civil service bureaucracy', 9: 'Impersonal bureaucracy',
    A: 'Charismatic dictator', B: 'Non-charismatic dictator',
    C: 'Charismatic oligarchy', D: 'Theocracy', E: 'Supreme authority',
    F: 'Hive-mind collective'
};

function uwpDigitKey(value: unknown): string {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
        const trimmed = value.trim().toUpperCase();
        if (/^[A-Z]$/.test(trimmed) || trimmed === 'X' || trimmed === 'Y') return trimmed;
        if (/^\d+$/.test(trimmed)) return toEHex(Number(trimmed));
        return trimmed.charAt(0);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return toEHex(value);
    }
    return String(value);
}

function namedDigit(map: Record<string, string>, value: unknown): string {
    const key = uwpDigitKey(value);
    return map[key] || map[String(value)] || '';
}

function lawName(value: unknown): string {
    const n = typeof value === 'number' ? value : fromEHex(value);
    if (!Number.isFinite(n)) return '';
    if (n === 0) return 'No restrictions';
    if (n === 1) return 'Only restrictions upon WMD and other dangerous technologies';
    if (n >= 2 && n <= 4) return 'Light restrictions: heavy weapons, narcotics, alien technology';
    if (n >= 5 && n <= 7) return 'Heavy restrictions: most weapons, specialized tools and information, foreigners';
    if (n >= 8) return 'Extreme restrictions: extensive monitoring and limitations, free speech curtailed';
    return '';
}

function withName(value: unknown, name: string): string {
    if (value == null || value === '') return '';
    return name ? `${value} — ${name}` : String(value);
}

function formatTradeCode(code: unknown): string {
    const key = String(code || '').trim();
    if (!key) return '';
    const name = TRADE_CODE_NAMES[key];
    return name ? `${name} (${key})` : key;
}

export function formatTradeCodes(codes: unknown): string {
    if (codes == null || codes === '') return '';
    const list = Array.isArray(codes) ? codes : String(codes).split(/[\s,]+/).filter(Boolean);
    return list.map(formatTradeCode).join(', ');
}

export function formatUwpDigit(kind: string, value: unknown): string {
    if (value == null || value === '') return '';
    if (kind === 'starport') return withName(value, namedDigit(STARPORT_NAMES, value));
    if (kind === 'size') return withName(value, namedDigit(SIZE_NAMES, value));
    if (kind === 'atmosphere') return withName(value, namedDigit(ATMOSPHERE_NAMES, value));
    if (kind === 'hydrographics') return withName(value, namedDigit(HYDRO_NAMES, value));
    if (kind === 'population') return withName(value, namedDigit(POPULATION_NAMES, value));
    if (kind === 'government') return withName(value, namedDigit(GOVERNMENT_NAMES, value));
    if (kind === 'law') return withName(value, lawName(value));
    return String(value);
}
