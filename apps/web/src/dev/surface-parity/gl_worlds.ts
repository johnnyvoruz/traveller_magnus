/**
 * Presentation fixtures for the legacy-against-legacy GL page.
 * Fields are ones PlanetProfile.of already reads. The id string follows
 * _surfaceId in js/system_viewer.js:3655-3657.
 */

export type GlBody = {
    hexId: string;
    name: string;
    type: string;
    uwp: string;
    diamKm: number;
    au: number;
    pd: string;
    size?: number;
    atm?: number;
    hydro?: number;
    tempBand?: string;
    meanTempK?: number;
    pop?: number;
    liquidType?: string;
    composition?: string;
    ggType?: string;
};

export type GlRing = {
    inner: number;
    outer: number;
    fill: number;
    phase: number;
    detail: number;
};

export type GlRequest = {
    key: string;
    radius: number;
    spin: number;
    cloudSpin: number;
    tilt: number;
    light: [number, number];
    sun: [number, number, number];
    sweep: number;
    samples: number;
    casters: number[][];
    lightMode: boolean;
    scale: number;
    ring: GlRing | null;
    frozenTime: number;
};

export type GlCase = {
    id: string;
    expectedKind: string;
    body: GlBody;
    surfaceId: string;
    request: GlRequest;
};

export const FROZEN_TIME = 12.5;
export const STATS_BYTES = 128 * 64 * 4;

export const GL_RING: GlRing = { inner: 1.22, outer: 1.9, fill: 0.8, phase: 0.75, detail: 1 };

/** js/system_viewer.js:3655-3657. hexId stands in for the viewer's _hexId. */
export function legacySurfaceId(body: GlBody, kind: string): string {
    return `${body.hexId || ''}|${body.name || ''}|${body.type || ''}|${body.uwp || ''}|${body.diamKm || ''}|${body.au ?? ''}|${body.pd ?? ''}|${kind}`;
}

export function glRequest(ring: GlRing | null = null): GlRequest {
    return {
        key: 'disc',
        radius: 80,
        spin: 0.7,
        cloudSpin: 1.1,
        tilt: 27,
        light: [0.6, 0.8],
        sun: [1, 0.96, 0.9],
        sweep: 0,
        samples: 1,
        casters: [],
        lightMode: false,
        scale: 1,
        ring,
        frozenTime: FROZEN_TIME,
    };
}

const ocean: GlBody = {
    hexId: '1910',
    name: 'Ocean',
    type: 'Terrestrial Planet',
    uwp: 'A789999-A',
    diamKm: 12800,
    au: 1,
    pd: '',
    size: 7,
    atm: 8,
    hydro: 9,
    tempBand: 'Temperate',
    meanTempK: 300,
    pop: 9,
    liquidType: 'Water',
    composition: 'Mostly Rock',
};

const dry: GlBody = {
    hexId: '1911',
    name: 'Dry',
    type: 'Terrestrial Planet',
    uwp: 'C850000-0',
    diamKm: 9600,
    au: 0.7,
    pd: '',
    size: 8,
    atm: 5,
    hydro: 0,
    tempBand: 'Temperate',
    meanTempK: 300,
    pop: 0,
    composition: 'Mostly Rock',
};

const ice: GlBody = {
    hexId: '1912',
    name: 'Ice',
    type: 'Terrestrial Planet',
    uwp: 'D424000-0',
    diamKm: 6400,
    au: 4,
    pd: '',
    size: 4,
    atm: 2,
    hydro: 4,
    tempBand: 'Frozen',
    meanTempK: 180,
    pop: 0,
    composition: 'Mostly Ice',
};

const gas: GlBody = {
    hexId: '1913',
    name: 'Gas',
    type: 'Gas Giant',
    uwp: '',
    diamKm: 80000,
    au: 5,
    pd: '',
    ggType: 'GS',
    meanTempK: 130,
};

const ringed: GlBody = {
    hexId: '1914',
    name: 'Ringed',
    type: 'Terrestrial Planet',
    uwp: 'A565899-A',
    diamKm: 11200,
    au: 1.2,
    pd: '',
    size: 5,
    atm: 6,
    hydro: 5,
    tempBand: 'Temperate',
    meanTempK: 300,
    pop: 8,
    liquidType: 'Water',
    composition: 'Mostly Rock',
};

function world(id: string, expectedKind: string, body: GlBody, ring: GlRing | null): GlCase {
    return {
        id,
        expectedKind,
        body,
        surfaceId: legacySurfaceId(body, expectedKind),
        request: glRequest(ring),
    };
}

export const GL_CASES: GlCase[] = [
    world('Ocean', 'ocean', ocean, null),
    world('Dry', 'desert', dry, null),
    world('Ice', 'ice', ice, null),
    world('Gas', 'gas', gas, null),
    world('Ringed', 'temperate', ringed, GL_RING),
];

export const OCEAN_ALT_ID = legacySurfaceId(ocean, 'ocean') + '|alt';

export const NEGATIVE_CASE: GlCase = {
    id: 'Ocean alt',
    expectedKind: 'ocean',
    body: ocean,
    surfaceId: OCEAN_ALT_ID,
    request: glRequest(null),
};
