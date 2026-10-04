// planet_renderer.js 224-455. Colours stay the legacy channel numbers.

export type RGB = [number, number, number];

export type PaletteStop = { t: number; c: RGB };

export type Palette = {
    seaLevel: number;
    stops: PaletteStop[];
    polarColor: RGB;
    polarAngle: number;
    polarFade: number;
    cloudColor: RGB;
    hasSpecular: boolean;
    limbColor: RGB | null;
    limbStrength: number;
    isAirless: boolean;
};

export type PaletteWorld = {
    atmosphere?: unknown;
    hydrographics?: unknown;
    temperature?: unknown;
    temperatureK?: unknown;
    size?: unknown;
};

type ExoticVariant = {
    deep: RGB; mid: RGB; shallow: RGB; shore: RGB;
    coastal: RGB; lowland: RGB; highland: RGB; mountains: RGB; peaks: RGB;
};

/** planet_renderer.js 259-263 */
export function parseStat(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseInt(v, 16) || 0;
    return 0;
}

/** planet_renderer.js 225 */
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** planet_renderer.js 227-231. The `| 0` truncation is the legacy rounding. */
function lerpRGB(c1: RGB, c2: RGB, t: number): RGB {
    return [(lerp(c1[0], c2[0], t)) | 0,
            (lerp(c1[1], c2[1], t)) | 0,
            (lerp(c1[2], c2[2], t)) | 0];
}

/** planet_renderer.js 233-243 */
function colorFromStops(h: number, stops: PaletteStop[]): RGB {
    if (h <= stops[0].t) return stops[0].c;
    for (let i = 1; i < stops.length; i++) {
        if (h <= stops[i].t) {
            const range = stops[i].t - stops[i - 1].t;
            const blend = range > 0 ? (h - stops[i - 1].t) / range : 0;
            return lerpRGB(stops[i - 1].c, stops[i].c, blend);
        }
    }
    return stops[stops.length - 1].c;
}

/** planet_renderer.js 245-255 */
export function heightToRGB(h: number, lat: number, palette: Palette): RGB {
    const { stops, polarColor, polarAngle, polarFade } = palette;
    const absLat = Math.abs(lat);
    const base   = colorFromStops(h, stops);
    if (absLat > polarAngle - polarFade) {
        const blend = Math.min(1, Math.max(0,
            (absLat - (polarAngle - polarFade)) / polarFade));
        return lerpRGB(base, polarColor, blend);
    }
    return base;
}

/** planet_renderer.js 265-455 */
export function buildPalette(worldData: PaletteWorld, oceanRng: number): Palette {
    const atm   = parseStat(worldData.atmosphere);
    const hydro = parseStat(worldData.hydrographics);
    const seaLevel = Math.max(0.05, Math.min(1, hydro / 10));

    const tempK    = (typeof worldData.temperatureK === 'number' ? worldData.temperatureK : 0) || 0;
    const isMolten   = (hydro === 15)
                   || (hydro === 0 && tempK > 1000);
    const isExotic   = (atm >= 10 && atm <= 12);
    const isRock     = !isMolten && (atm === 0 && hydro === 0);
    const isIce      = !isMolten && ((atm === 0 && hydro > 0)
        || (!isExotic && atm > 0 && hydro > 0
            && ((tempK > 0 && tempK < 223)
                || (tempK === 0 && String(worldData.temperature || '').toLowerCase().includes('frozen')))));
    const isExoticDry = !isMolten && (isExotic && hydro === 0);
    const isExoticWet = !isMolten && (isExotic && hydro > 0);
    const isDesert   = !isMolten && (!isRock && !isIce && !isExoticDry && !isExoticWet && hydro === 0);

    const tempStr = String(worldData.temperature || '').toLowerCase();
    let polarAngle: number;
    if (isMolten || isRock || isIce)     polarAngle = Math.PI;
    else if (tempStr.includes('frozen')) polarAngle = Math.PI * 40 / 180;
    else if (tempStr.includes('cold'))   polarAngle = Math.PI * 55 / 180;
    else if (tempStr.includes('cool'))   polarAngle = Math.PI * 68 / 180;
    else if (tempStr.includes('warm'))   polarAngle = Math.PI * 82 / 180;
    else if (tempStr.includes('hot'))    polarAngle = Math.PI * 88 / 180;
    else                                 polarAngle = Math.PI * 75 / 180;

    const polarFade  = Math.PI * 8 / 180;
    const polarColor: RGB = [212, 218, 232];

    let stops: PaletteStop[];

    if (isMolten) {
        stops = [
            { t: 0.0, c: [252, 148,  18] },
            { t: 0.2, c: [220,  72,  10] },
            { t: 0.4, c: [162,  38,   8] },
            { t: 0.6, c: [ 88,  18,   6] },
            { t: 0.8, c: [ 38,  10,   8] },
            { t: 1.0, c: [ 18,   6,   6] },
        ];
    } else if (isRock) {
        stops = [
            { t: 0.0, c: [ 22,  20,  26] },
            { t: 0.3, c: [ 72,  68,  65] },
            { t: 0.6, c: [102,  96,  92] },
            { t: 0.8, c: [130, 124, 118] },
            { t: 1.0, c: [152, 146, 138] },
        ];
    } else if (isIce) {
        stops = [
            { t: 0.0, c: [125, 152, 198] },
            { t: 0.4, c: [165, 188, 222] },
            { t: 0.7, c: [196, 212, 232] },
            { t: 1.0, c: [232, 240, 252] },
        ];
    } else if (isExoticDry) {
        stops = [
            { t: 0.0, c: [ 48,  18,   8] },
            { t: 0.2, c: [ 82,  38,  14] },
            { t: 0.4, c: [112,  58,  20] },
            { t: 0.6, c: [138,  72,  28] },
            { t: 0.8, c: [108,  52,  18] },
            { t: 1.0, c: [ 78,  36,  14] },
        ];
    } else if (isExoticWet) {
        const ls = seaLevel;
        const atmVariants: ExoticVariant[] = atm === 10 ? [
            { deep: [ 18,  68,  28], mid: [ 38, 105,  42], shallow: [ 60, 132,  52], shore: [ 82, 100,  48],
              coastal: [ 72,  80,  40], lowland: [ 88,  70,  32], highland: [108,  76,  36], mountains: [128,  88,  44], peaks: [158, 118,  62] },
            { deep: [  8,  10,  15], mid: [ 15,  18,  25], shallow: [ 25,  28,  38], shore: [ 40,  35,  32],
              coastal: [ 95,  82,  48], lowland: [115,  98,  58], highland: [132, 112,  68], mountains: [148, 128,  82], peaks: [195, 182, 148] },
            { deep: [ 20,   8,  55], mid: [ 38,  15,  88], shallow: [ 55,  28, 108], shore: [ 70,  40,  80],
              coastal: [ 88,  42,  28], lowland: [108,  58,  36], highland: [125,  72,  44], mountains: [140,  88,  55], peaks: [185, 158, 128] },
            { deep: [ 55,   8,  75], mid: [ 80,  18, 108], shallow: [100,  32, 128], shore: [ 85,  45,  85],
              coastal: [105,  48,  22], lowland: [128,  62,  28], highland: [148,  78,  35], mountains: [162,  95,  45], peaks: [200, 168, 118] },
        ] : atm === 11 ? [
            { deep: [ 20,   8,  55], mid: [ 38,  15,  88], shallow: [ 55,  28, 108], shore: [ 70,  40,  80],
              coastal: [ 88,  42,  28], lowland: [108,  58,  36], highland: [125,  72,  44], mountains: [140,  88,  55], peaks: [185, 158, 128] },
            { deep: [ 55,   8,  75], mid: [ 80,  18, 108], shallow: [100,  32, 128], shore: [ 85,  45,  85],
              coastal: [105,  48,  22], lowland: [128,  62,  28], highland: [148,  78,  35], mountains: [162,  95,  45], peaks: [200, 168, 118] },
            { deep: [ 90,  70,  10], mid: [130, 100,  18], shallow: [158, 122,  28], shore: [140, 110,  55],
              coastal: [ 42,  52,  65], lowland: [ 58,  68,  82], highland: [ 75,  85,  98], mountains: [ 95, 102, 115], peaks: [175, 182, 195] },
            { deep: [ 55,  95,   8], mid: [ 85, 135,  15], shallow: [108, 158,  25], shore: [ 95, 130,  45],
              coastal: [ 95,  38,  28], lowland: [118,  52,  35], highland: [138,  65,  42], mountains: [155,  82,  52], peaks: [195, 162, 135] },
        ] : [
            { deep: [110,  38,   8], mid: [148,  58,  15], shallow: [172,  78,  25], shore: [148,  85,  42],
              coastal: [ 40,  58,  45], lowland: [ 55,  72,  55], highland: [ 70,  85,  65], mountains: [ 88,  98,  78], peaks: [162, 172, 155] },
            { deep: [ 90,  70,  10], mid: [130, 100,  18], shallow: [158, 122,  28], shore: [140, 110,  55],
              coastal: [ 42,  52,  65], lowland: [ 58,  68,  82], highland: [ 75,  85,  98], mountains: [ 95, 102, 115], peaks: [175, 182, 195] },
            { deep: [ 55,  95,   8], mid: [ 85, 135,  15], shallow: [108, 158,  25], shore: [ 95, 130,  45],
              coastal: [ 95,  38,  28], lowland: [118,  52,  35], highland: [138,  65,  42], mountains: [155,  82,  52], peaks: [195, 162, 135] },
        ];
        const ov = atmVariants[Math.floor((oceanRng || 0) * atmVariants.length) % atmVariants.length];
        stops = [
            { t: 0.0,                  c: ov.deep      },
            { t: ls * 0.50,            c: ov.mid       },
            { t: ls * 0.90,            c: ov.shallow   },
            { t: ls,                   c: ov.shore     },
            { t: ls + (1 - ls) * 0.15, c: ov.coastal   },
            { t: ls + (1 - ls) * 0.40, c: ov.lowland   },
            { t: ls + (1 - ls) * 0.65, c: ov.highland  },
            { t: ls + (1 - ls) * 0.85, c: ov.mountains },
            { t: 1.0,                  c: ov.peaks     },
        ];
    } else if (isDesert) {
        stops = [
            { t: 0.0, c: [142, 112,  60] },
            { t: 0.2, c: [178, 146,  82] },
            { t: 0.4, c: [202, 165,  88] },
            { t: 0.6, c: [182, 138,  68] },
            { t: 0.8, c: [142, 106,  55] },
            { t: 1.0, c: [112,  82,  46] },
        ];
    } else {
        const ls = seaLevel;
        stops = [
            { t: 0.0,                  c: [ 10,  30, 100] },
            { t: ls * 0.35,            c: [ 20,  68, 152] },
            { t: ls * 0.70,            c: [ 48, 118, 188] },
            { t: ls * 0.92,            c: [ 85, 158, 212] },
            { t: ls,                   c: [194, 172, 112] },
            { t: ls + (1 - ls) * 0.06, c: [180, 156, 100] },
            { t: ls + (1 - ls) * 0.28, c: [158, 136,  88] },
            { t: ls + (1 - ls) * 0.52, c: [138, 118,  88] },
            { t: ls + (1 - ls) * 0.70, c: [124, 110,  98] },
            { t: ls + (1 - ls) * 0.84, c: [112, 108, 106] },
            { t: 1.0,                  c: [222, 228, 240] },
        ];
    }

    let cloudColor: RGB;
    if (isMolten)       cloudColor = [ 90,  65,  45];
    else if (isExotic)  cloudColor = [210, 165,  65];
    else                cloudColor = [240, 244, 250];

    const hasSpecular = !isMolten && !isRock && !isIce && !isDesert && hydro > 0;

    let limbColor: RGB | null = null, limbStrength = 0;
    if (isMolten) {
        limbColor    = [140,  90,  50];
        limbStrength = 0.45;
    } else if (isExotic) {
        limbColor    = [235, 155,  55];
        limbStrength = 0.55;
    } else if (atm > 0) {
        const hz     = Math.min(1, atm / 9);
        limbColor    = [Math.round(90 - 10 * hz), Math.round(155 - 25 * hz), 255];
        limbStrength = 0.35 + 0.30 * hz;
    }

    return { seaLevel, stops, polarColor, polarAngle, polarFade,
             cloudColor, hasSpecular, limbColor, limbStrength,
             isAirless: isRock || isIce };
}
