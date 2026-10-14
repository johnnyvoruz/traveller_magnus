/**
 * One plain sentence for each dossier code that rules/ or assets/ explains.
 * A code with no line there is absent from this file, so the screen stays quiet.
 * Citations live in findings/dossier_codes.md.
 */

const IMPORTANCE = 'Importance ranks the world from its starport, tech level, bases and trade codes.';
const EX = 'The economic extension combines resources, labor, infrastructure and efficiency.';
const WTN = 'The world trade number estimates passenger and freight traffic from the tech level, the population and the starport.';
const RU = 'Resource units equal resources multiplied by labor, infrastructure and efficiency.';
const PBG = 'The three digits are the population multiplier, the belt count and the gas giant count.';
const AGE = 'System age is counted in billions of years.';
const CULTURE = 'The first four digits are heterogeneity, acceptance, strangeness and symbols.';
const UWP = 'A world profile is one line of hexadecimal code for the world\'s main facts.';
const PORT = 'This digit is the starport quality.';
const SIZE = 'Size measures the world\'s diameter in thousands of kilometers.';
const ATM = 'The atmosphere code measures the type of atmosphere present.';
const HYD = 'The hydrographic code measures how much of the surface is liquid, in steps of 10%.';
const POP = 'The population code measures the world\'s intelligent population, as the number of zeroes after a one.';
const GOV = 'The government code is the kind of ruling system.';
const LAW = 'The law level is how strictly the world limits what visitors may do.';
const TL = 'The tech level is the average technology available for production and repair.';

const STARPORT: Record<string, string> = {
    A: 'Class A is an excellent starport.',
    B: 'Class B is a good starport.',
    C: 'Class C is a routine starport.',
    D: 'Class D is a poor starport.',
    E: 'Class E is a frontier starport.',
    X: 'Class X means there is no starport.',
};

const TRADE: Record<string, string> = {
    Ag: 'Dedicated to farming and food production.',
    As: 'Usually a mining colony, and sometimes an orbital factory.',
    Ba: 'Uncolonized and empty.',
    De: 'Dry and barely habitable.',
    Fl: 'The surface liquid is not water, so it does not suit Earth-derived life.',
    Ga: 'Earth-like.',
    Hi: 'The population is in the billions.',
    Ht: 'Among the most technologically advanced worlds in Charted Space.',
    Ic: 'Most of the surface liquid is frozen in polar ice caps.',
    In: 'Dominated by factories and cities.',
    Lo: 'The population is only a few thousand or less.',
    Lt: 'Pre-industrial, and it cannot produce advanced goods.',
    Na: 'Too dry or barren to feed its population by conventional farming.',
    Ni: 'The population is too low to maintain an extensive industrial base.',
    Pa: 'This code means pre-agricultural.',
    Po: 'A marginal colony, short of resources, viable land or population.',
    Ri: 'A stable government and a viable biosphere make this an economic powerhouse.',
    Sa: 'This world is a satellite.',
    Lk: 'This world is a locked satellite, tidally locked to its parent planet.',
    St: 'Sterile means a bio score of 0.',
    Zo: 'Zoo means a bio score of 7 or more.',
    Va: 'No atmosphere.',
    Wa: 'Almost entirely water across the surface.',
};

const BASE: Record<string, string> = {
    C: 'A corsair base refuels and maintains corsair ships.',
    D: 'A depot is a naval base large enough to support a sector fleet.',
    M: 'A military base supports ground vehicles and troops.',
    N: 'A naval base supplies, refuels or repairs naval ships.',
    S: 'A scout base offers refined fuel and supplies to scout ships.',
    W: 'A way station services the x-boat network and scout ships.',
};

const ZONE: Record<string, string> = {
    A: 'An amber world is dangerous, and visitors are warned to be on their guard.',
    R: 'A red world is interdicted, and travel to it is forbidden.',
    G: 'With no travel code, the world is unclassified or a green zone.',
};

const EDITION: Record<string, string> = {
    MgT2E: 'Mongoose 2nd Edition.',
    CT: 'Classic Traveller.',
    T5: 'Traveller 5.',
};

const LABEL: Record<string, string> = {
    Importance: IMPORTANCE,
    'World trade number': WTN,
    'Resource units': RU,
    PBG: PBG,
    'Age (Gyr)': AGE,
    'Cultural profile': CULTURE,
};

const RIBBON: Record<string, string> = {
    Port: PORT,
    Size: SIZE,
    Atm: ATM,
    Hyd: HYD,
    Pop: POP,
    Gov: GOV,
    Law: LAW,
    TL: TL,
};

/** Every sentence this file will show, keyed for a test. */
export const CODE_SENTENCES: Record<string, string> = {
    importance: IMPORTANCE,
    ex: EX,
    wtn: WTN,
    ru: RU,
    pbg: PBG,
    age: AGE,
    culture: CULTURE,
    uwp: UWP,
    ...Object.fromEntries(Object.entries(STARPORT).map(([key, text]) => ['port.' + key, text])),
    ...Object.fromEntries(Object.entries(TRADE).map(([key, text]) => ['trade.' + key, text])),
    ...Object.fromEntries(Object.entries(BASE).map(([key, text]) => ['base.' + key, text])),
    ...Object.fromEntries(Object.entries(ZONE).map(([key, text]) => ['zone.' + key, text])),
    ...Object.fromEntries(Object.entries(EDITION).map(([key, text]) => ['edition.' + key, text])),
    ...Object.fromEntries(Object.entries(RIBBON).map(([key, text]) => ['ribbon.' + key, text])),
};

export function labelWords(label: string): string | null {
    return LABEL[label] ?? null;
}

export function tradeWords(code: string): string | null {
    return TRADE[code] ?? null;
}

export function zoneWords(code: string): string | null {
    return ZONE[code] ?? null;
}

export function editionWords(value: string): string | null {
    return EDITION[value.trim()] ?? null;
}

export function uwpWords(): string {
    return UWP;
}

export type NotedPart = { letter: string; words: string | null };

/** One entry per character, so an unexplained letter stays on screen with no sentence. */
export function baseParts(value: string): NotedPart[] {
    return [...value].map((letter) => ({ letter, words: BASE[letter] ?? null }));
}

export function hasBaseWords(value: string): boolean {
    return [...value].some((letter) => BASE[letter] != null);
}

export type HeadlinePart = { label: string; words: string | null };

/** The socioeconomics headline, split on the middle dot the model joins with. */
export function headlineParts(headline: string): HeadlinePart[] {
    return headline.split(' \u00B7 ').map((label) => ({ label, words: headlineWords(label) }));
}

function headlineWords(label: string): string | null {
    if (label.startsWith('Importance ')) return IMPORTANCE;
    if (label.startsWith('WTN ')) return WTN;
    if (/^[0-9A-Z]{3}[+-][0-9A-Z]$/.test(label)) return EX;
    return null;
}

/** The ribbon caption, plus the starport class when that digit is in the table. */
export function ribbonCellWords(label: string, digit: string): string | null {
    const place = RIBBON[label];
    if (!place) return null;
    const quality = label === 'Port' ? STARPORT[digit.trim().toUpperCase()] : undefined;
    return quality ? place + ' ' + quality : place;
}

/** Spectral type and luminosity class, plus a class name only where a line names it. */
export function stellarWords(line: string): string | null {
    const hasClass = /\b(Ia|Ib|III|II|IV|VI|V|D)\b/.test(line);
    const hasType = /\b[OBAFGKM]\d?\b/.test(line);
    if (!hasClass && !hasType) return null;
    const bits = ['Spectral type and luminosity class.'];
    if (/\bV\b/.test(line)) bits.push('Class V is main sequence.');
    if (/\bD\b/.test(line)) bits.push('Class D is a white dwarf.');
    return bits.join(' ');
}
