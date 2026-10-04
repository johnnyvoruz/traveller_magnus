/**
 * Sample view models for the design-system page only. The values are what the dossier showed
 * for Spinward Marches 1910 (Regina) on truth v2, copied as display text; nothing here is
 * computed and nothing here is a rules source. Rows marked "sample" exist to show a state.
 */
import type { BodyGlyphData, BodyModel, FactTile, OverviewModel, Ribbon, StatRow, StellarLine, TreeRow } from '../dossier/model.ts';

export const ribbon: Ribbon = {
    kind: 'cells',
    dash: '-',
    cells: [
        { digit: 'A', label: 'Port' }, { digit: '7', label: 'Size' }, { digit: '8', label: 'Atm' },
        { digit: '8', label: 'Hyd' }, { digit: '8', label: 'Pop' }, { digit: '9', label: 'Gov' },
        { digit: '9', label: 'Law' }, { digit: 'C', label: 'TL' },
    ],
};

export const ribbonPlain: Ribbon = { kind: 'plain', text: 'A788899-?' };

export const identityRows: StatRow[] = [
    { label: 'Starport', text: 'A — Excellent Starport', code: 'A', name: 'Excellent Starport' },
    { label: 'Size', text: '7 — 11,200 km, 0.9 G', code: '7', name: '11,200 km, 0.9 G' },
    { label: 'Law level', text: '9', code: '9', name: 'Extreme restrictions: extensive monitoring and limitations, free speech curtailed' },
    { label: 'Tech level', text: 'C — TL 12', code: 'C', name: 'TL 12' },
    {
        label: 'Trade codes',
        text: 'Fluid Oceans (Fl), High Technology (Ht), Satellite (Sa)',
        chips: [{ code: 'Fl', name: 'Fluid Oceans' }, { code: 'Ht', name: 'High Technology' }, { code: 'Sa', name: 'Satellite' }],
    },
    { label: 'Travel zone', text: 'G', code: 'G', name: 'Green', zone: 'green' },
    { label: 'Allegiance', text: 'ImDd', code: 'ImDd' },
    { label: 'Bases', text: 'NS' },
    { label: 'PBG', text: '703' },
    { label: 'Age (Gyr)', text: '3.95' },
];

export const zoneRows: StatRow[] = [
    { label: 'Travel zone', text: 'G', code: 'G', name: 'Green', zone: 'green' },
    { label: 'Travel zone, amber (sample)', text: 'A', code: 'A', name: 'Amber', zone: 'amber' },
    { label: 'Travel zone, red (sample)', text: 'R', code: 'R', name: 'Red', zone: 'red' },
];

export const socioRows: StatRow[] = [
    { label: 'Importance', text: '4' },
    { label: 'Economic profile', text: '+4, D7E+5, 6370, Cr233280, A, 22, 181.96' },
    { label: 'World trade number', text: '10' },
    { label: 'GWP per capita', text: '233,280' },
    { label: 'Total population', text: '700,000,000' },
    { label: 'Urbanization', text: '97%' },
];

export const socioHeadline = 'Importance 4 · D7E+5 · WTN 10 · Cr233280';
export const socioEmpty = 'Mongoose socioeconomics have not been built for this world.';

const star = (letter: string): BodyGlyphData => ({ kind: 'star', star: letter });
const disc = (kind: BodyGlyphData['kind']): BodyGlyphData => ({ kind, star: '' });

export const stellarLines: StellarLine[] = [
    { text: 'F7 V', glyph: star('F') },
    { text: 'BD 0 V — Close', glyph: star('BD') },
    { text: 'M3 V — Near', glyph: star('M') },
];

export const treeRows: TreeRow[] = [
    { key: 's0', name: 'F7 V', facts: ['Primary'], tag: '', uwp: '', moon: false, glyph: star('F') },
    { key: 's1', name: 'BD V', facts: ['BD 0 V · Close'], tag: '', uwp: '', moon: false, glyph: star('BD') },
    { key: 's2', name: 'M3 V', facts: ['Near'], tag: '', uwp: '', moon: false, glyph: star('M') },
    { key: 'w0', name: 'Regina A-I', facts: ['Terrestrial Planet', 'Orbit 1.22', '0.47 AU', '6,149 km'], tag: '', uwp: 'G4A316E-C', moon: false, glyph: disc('world') },
    { key: 'w2', name: 'Regina A-II', facts: ['Gas Giant GL', 'Orbit 1.82', '0.65 AU', '192,000 km'], tag: '', uwp: '', moon: false, glyph: disc('gasGiant') },
    { key: 'w2m0', name: 'Regina A-II-a', facts: ['Satellite', '19 PD', '2,771 km'], tag: '', uwp: 'F200319-C', moon: true, glyph: disc('moon') },
    { key: 'w2m1', name: 'Regina A-II-b', facts: ['Satellite', '21 PD', '441 km'], tag: '', uwp: 'YS00169-B', moon: true, glyph: disc('moon') },
    { key: 'w3', name: 'Belt (sample)', facts: ['Planetoid Belt', 'Orbit 2.4'], tag: '', uwp: '', moon: false, glyph: disc('belt') },
    { key: 'w4', name: 'Regina A-IV', facts: ['Gas Giant GL', 'Orbit 5.21', '3.31 AU', '128,000 km'], tag: '', uwp: '', moon: false, glyph: disc('gasGiant') },
    { key: 'w4m1', name: 'Regina', facts: ['Mainworld satellite', '10.7 PD', '11,169 km'], tag: 'Mainworld', uwp: '', moon: true, glyph: disc('moon') },
];

export const facts: FactTile[] = [
    { label: 'Diameter', value: '11,169 km', note: '' },
    { label: 'Gravity', value: '0.83 G', note: '' },
    { label: 'Mean temp.', value: '190 K', note: '−84 °C' },
    { label: 'Rotation', value: 'Tidally locked', note: '' },
    { label: 'Year', value: '5.4 yr', note: '' },
];

export const overview: OverviewModel = {
    header: { title: 'Regina', hexChip: '1910', place: 'Spinward Marches - Regina' },
    ribbon,
    rows: identityRows,
    journey: null,
    noOrbit: false,
    socio: { headline: socioHeadline, rows: socioRows, empty: null },
    stellar: { lines: stellarLines },
    tree: { count: 7, rows: treeRows },
    partial: false,
    notice: '',
    mapBadge: 'Mainworld · moon of Regina A-IV',
    mainworldKey: 'w4m1',
};

export const body: BodyModel = {
    title: 'Regina',
    crumbSystem: 'Regina',
    crumbParent: { key: 'w4', name: 'A-IV' },
    place: 'Mainworld satellite · moon of Regina A-IV · 1910',
    ribbon,
    mapBadge: 'Mainworld',
    facts,
    journey: null,
    mainSections: [{ heading: 'World profile', rows: identityRows.slice(0, 6) }],
    sideSections: [{ heading: 'Orbit', rows: [{ label: 'Satellite orbit (PD)', text: '10.7' }, { label: 'Tidally locked', text: 'Yes' }] }],
    moons: [],
    worlds: [],
    glyph: { kind: 'moon', star: '' },
    index: 14,
    total: 30,
    prev: 'w4m0',
    next: 'w4m2',
};

export const omniResults = [
    { kind: 'system', name: 'Regina', detail: 'Spinward Marches 1910 · A788899-C' },
    { kind: 'system', name: 'Reginald', detail: 'Phlask 2206 · A576231-A' },
    { kind: 'sector', name: 'Reft', detail: 'Sector' },
    { kind: 'command', name: 'Home view', detail: 'Command' },
];
