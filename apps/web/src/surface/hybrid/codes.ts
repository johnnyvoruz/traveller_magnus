/**
 * Every code the hybrid surface map writes into a hex, in one table. The icon manifest
 * (public/surface-icons/<set>/manifest.json) keys on these codes, the painter takes its
 * colours from here, and the legend its names. Add a code here and give it an icon or let
 * the built-in glyph stand in (surface/hybrid/icons.ts).
 */
export type RGB = readonly [number, number, number];

/** What a code stands for: a terrain that fills the hex, an accent on its terrain, or a feature people put there. */
export type CodeKind = 'sea' | 'ice' | 'land' | 'accent' | 'feature';

export type CodeRow = {
    readonly code: string;
    readonly name: string;
    readonly kind: CodeKind;
    /** Painted colour. Seas take theirs from the liquid instead; their row holds water's. */
    readonly rgb: RGB;
};

/** Terrain codes, design §5 (terrain table). One per hex. */
export const TERRAIN_CODES = [
    'OC', 'SH', 'SI', 'IF', 'IC', 'FR', 'TU', 'TA', 'FO', 'JU', 'SW', 'GR', 'DE', 'BK', 'EV', 'XR', 'RG', 'RK', 'LV',
] as const;
export type TerrainCode = typeof TERRAIN_CODES[number];

/** Accents over the terrain. A hex may carry several. */
export const ACCENT_CODES = ['MT', 'VO', 'CR'] as const;
export type AccentCode = typeof ACCENT_CODES[number];

/** Features the people layer places (design §7). estate and penal are placed only from T5 data. */
export const FEATURE_CODES = [
    'starport', 'city', 'arcology', 'town', 'outpost', 'rural', 'farm', 'resource',
    'naval', 'scout', 'military', 'estate', 'penal', 'dome',
] as const;
export type FeatureCode = typeof FEATURE_CODES[number];

export type SurfaceCode = TerrainCode | AccentCode | FeatureCode;

/** All codes, in legend order. The icon manifest is checked against this list. */
export const SURFACE_CODES: readonly SurfaceCode[] = [...TERRAIN_CODES, ...ACCENT_CODES, ...FEATURE_CODES];

const ROWS: readonly CodeRow[] = [
    { code: 'OC', name: 'Ocean', kind: 'sea', rgb: [10, 34, 86] },
    { code: 'SH', name: 'Shallows', kind: 'sea', rgb: [52, 142, 164] },
    { code: 'SI', name: 'Sea ice', kind: 'ice', rgb: [236, 240, 246] },
    { code: 'IF', name: 'Ice field', kind: 'ice', rgb: [214, 224, 236] },
    { code: 'IC', name: 'Ice cap', kind: 'ice', rgb: [244, 247, 252] },
    { code: 'FR', name: 'Frost', kind: 'ice', rgb: [196, 204, 212] },
    { code: 'TU', name: 'Tundra', kind: 'land', rgb: [150, 156, 128] },
    { code: 'TA', name: 'Taiga', kind: 'land', rgb: [78, 100, 80] },
    { code: 'FO', name: 'Forest', kind: 'land', rgb: [70, 110, 62] },
    { code: 'JU', name: 'Jungle', kind: 'land', rgb: [46, 102, 52] },
    { code: 'SW', name: 'Swamp', kind: 'land', rgb: [92, 112, 70] },
    { code: 'GR', name: 'Grass and steppe', kind: 'land', rgb: [150, 150, 92] },
    { code: 'DE', name: 'Desert', kind: 'land', rgb: [202, 165, 88] },
    { code: 'BK', name: 'Baked lands', kind: 'land', rgb: [196, 92, 48] },
    { code: 'EV', name: 'Evaporite flat', kind: 'land', rgb: [226, 216, 196] },
    { code: 'XR', name: 'Exotic terrain', kind: 'land', rgb: [128, 92, 70] },
    { code: 'RG', name: 'Regolith', kind: 'land', rgb: [122, 118, 114] },
    { code: 'RK', name: 'Bare rock', kind: 'land', rgb: [138, 118, 92] },
    { code: 'LV', name: 'Lava', kind: 'land', rgb: [200, 66, 12] },
    { code: 'MT', name: 'Mountains', kind: 'accent', rgb: [134, 128, 122] },
    { code: 'VO', name: 'Volcano', kind: 'accent', rgb: [232, 80, 28] },
    { code: 'CR', name: 'Crater', kind: 'accent', rgb: [110, 104, 98] },
    { code: 'starport', name: 'Starport', kind: 'feature', rgb: [255, 255, 255] },
    { code: 'city', name: 'City', kind: 'feature', rgb: [192, 24, 43] },
    { code: 'arcology', name: 'Arcology', kind: 'feature', rgb: [122, 31, 162] },
    { code: 'town', name: 'Town', kind: 'feature', rgb: [192, 24, 43] },
    { code: 'outpost', name: 'Outpost', kind: 'feature', rgb: [224, 123, 0] },
    { code: 'rural', name: 'Rural', kind: 'feature', rgb: [192, 24, 43] },
    { code: 'farm', name: 'Farmland', kind: 'feature', rgb: [120, 90, 20] },
    { code: 'resource', name: 'Resource', kind: 'feature', rgb: [232, 184, 0] },
    { code: 'naval', name: 'Naval base', kind: 'feature', rgb: [40, 70, 160] },
    { code: 'scout', name: 'Scout base', kind: 'feature', rgb: [30, 140, 90] },
    { code: 'military', name: 'Military base', kind: 'feature', rgb: [90, 90, 90] },
    { code: 'estate', name: 'Noble estate', kind: 'feature', rgb: [190, 150, 40] },
    { code: 'penal', name: 'Penal colony', kind: 'feature', rgb: [70, 70, 70] },
    { code: 'dome', name: 'Domed (unbreathable air)', kind: 'feature', rgb: [48, 192, 255] },
];

export const CODE_TABLE: Readonly<Record<SurfaceCode, CodeRow>> = Object.freeze(
    Object.fromEntries(ROWS.map((row) => [row.code, row])) as Record<SurfaceCode, CodeRow>,
);

export function codeRow(code: string): CodeRow | null {
    return (CODE_TABLE as Record<string, CodeRow>)[code] ?? null;
}

export function terrainRgb(code: string): RGB {
    return codeRow(code)?.rgb ?? CODE_TABLE.RK.rgb;
}

export function isSurfaceCode(code: string): code is SurfaceCode {
    return codeRow(code) !== null;
}
