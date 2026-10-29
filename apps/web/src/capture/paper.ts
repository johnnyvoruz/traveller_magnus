/**
 * A saved image's paper (streams/D.md DP1): the four papers, their pixels at 300 dpi, the file name
 * and the caption. Pure: no browser here, so tests run it in node. The chart, the system map and
 * the world surface map all save through these.
 */

export type Paper = 'A4' | 'Letter' | 'A3' | 'Tabloid';
export type Orientation = 'portrait' | 'landscape';
/** Ink on white from the print tokens, or the chart as the screen shows it. */
export type Look = 'paper' | 'screen';

export const PAPERS: readonly Paper[] = ['A4', 'Letter', 'A3', 'Tabloid'];
export const PRINT_DPI = 300;
const CSS_DPI = 96;
/** CSS pixels are drawn at this device pixel ratio: 300 dots per inch over the browser's 96. */
export const PRINT_DPR = PRINT_DPI / CSS_DPI;
/** The area fills this much of the room on its tighter side (the legacy captureSubsector's 0.92). */
export const FILL = 0.92;
/** The last paper chosen on this device (platform storage). */
export const PAPER_KEY = 'voyage_save_image_paper';

/** Portrait sizes in inches. The ISO papers are set in millimetres, 25.4 to the inch. */
const INCHES: Record<Paper, readonly [number, number]> = {
    A4: [210 / 25.4, 297 / 25.4],
    Letter: [8.5, 11],
    A3: [297 / 25.4, 420 / 25.4],
    Tabloid: [11, 17],
};

export type PaperPixels = {
    /** CSS pixels: what a renderer's resize(width, height, dpr) takes. Not whole numbers. */
    width: number;
    height: number;
    dpr: number;
    /** The image's pixels. A4 portrait is 2480 by 3508. */
    deviceWidth: number;
    deviceHeight: number;
};

export function isPaper(value: unknown): value is Paper {
    return typeof value === 'string' && (PAPERS as readonly string[]).includes(value);
}

/**
 * The device pixels are the truth (inches times 300, rounded); the CSS size is those over the ratio,
 * so a renderer that rounds width times dpr lands on the same pixels.
 */
export function paperPixels(paper: Paper, orientation: Orientation): PaperPixels {
    const [w, h] = INCHES[paper];
    const [pw, ph] = orientation === 'portrait' ? [w, h] : [h, w];
    const deviceWidth = Math.round(pw * PRINT_DPI);
    const deviceHeight = Math.round(ph * PRINT_DPI);
    return { width: deviceWidth / PRINT_DPR, height: deviceHeight / PRINT_DPR, dpr: PRINT_DPR, deviceWidth, deviceHeight };
}

/** Landscape for an area wider than it is tall; a subsector and a sector are portrait. */
export function orientationFor(width: number, height: number): Orientation {
    return width > height ? 'landscape' : 'portrait';
}

/** "2480 × 3508 px", for the sheet. */
export function sizeWords(px: PaperPixels): string {
    return px.deviceWidth + ' × ' + px.deviceHeight + ' px';
}

/**
 * What the image is of. `name` is the subsector's, the system's or the world's name; `sector` the
 * sector's; `hex` the system's local hex where there is one.
 */
export type CaptureArea =
    | { kind: 'screen'; sector: string }
    | { kind: 'subsector'; name: string; sector: string }
    | { kind: 'sector'; sector: string }
    | { kind: 'system'; name: string; sector: string; hex: string }
    | { kind: 'world'; name: string; sector: string; hex: string; uwp?: string };

/** The area in words: "Regina subsector, Spinward Marches". */
export function areaWords(area: CaptureArea): string {
    switch (area.kind) {
        case 'screen': return area.sector ? area.sector + ' chart' : 'Chart';
        case 'subsector': return (/^Subsector /.test(area.name) ? area.name : area.name + ' subsector') + ', ' + area.sector;
        case 'sector': return area.sector + ' sector';
        case 'system': return area.name + ' system, ' + area.sector + ' ' + area.hex;
        case 'world': return (area.uwp ? area.name + ' ' + area.uwp : area.name) + ' surface, ' + area.sector + ' ' + area.hex;
    }
}

/** ASCII only, no slashes and nothing a file system refuses; accented letters lose their marks. */
export function asciiName(text: string): string {
    const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const kept = plain.replace(/[^\x20-\x7e]/g, '').replace(/[\\/:*?"<>|]/g, '-');
    return kept.replace(/\s+/g, ' ').trim() || 'Chart';
}

/** "Regina subsector, Spinward Marches (A4, 300 dpi).png" */
export function captureName(area: CaptureArea, paper: Paper): string {
    return asciiName(areaWords(area)) + ' (' + paper + ', ' + PRINT_DPI + ' dpi).png';
}

/** "chart v10" from "10" or "v10"; empty with no version. */
export function chartVersionWords(version: string | null): string {
    if (!version) return '';
    return 'chart ' + (/^v/i.test(version) ? version : 'v' + version);
}

/**
 * The foot of the image, one line: the area, the campaign's date when a campaign is open, then
 * "traveller.voyage · chart v10".
 */
export function captionText(area: CaptureArea, date: string | null, version: string | null): string {
    const parts = [areaWords(area)];
    if (date) parts.push(date);
    parts.push('traveller.voyage');
    const chart = chartVersionWords(version);
    if (chart) parts.push(chart);
    return parts.join(' · ');
}

/** Caption type in CSS pixels; at 300 dpi this is about 8 points on the paper. */
export const CAPTION_PX = 11;

/** Where the caption's middle goes: the middle of the lower margin the fill leaves. */
export function captionY(height: number, fill: number = FILL): number {
    return height - (height * (1 - fill)) / 4;
}
