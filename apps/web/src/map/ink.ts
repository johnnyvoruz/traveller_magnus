/**
 * Ink on paper (DP1d): the colour arithmetic a theme needs to keep a screen colour readable on white.
 * WCAG 2.1 relative luminance and contrast ratio, as tests/web/contrast.test.js computes them, and a
 * darkening that lowers a colour's lightness until it reads against the paper at the asked ratio. Pure.
 * No colour of its own: the only literals are the CSS Color keywords the chart tokens use, as the
 * specification defines them, so a token written as a keyword can be measured.
 */

export type Rgb = { r: number; g: number; b: number };

/** The CSS Color keywords the chart tokens are written in, as the specification defines them (sRGB bytes). */
const KEYWORDS: Readonly<Record<string, Rgb>> = {
    white: { r: 255, g: 255, b: 255 },
    black: { r: 0, g: 0, b: 0 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
    yellow: { r: 255, g: 255, b: 0 },
    purple: { r: 128, g: 0, b: 128 },
    lightblue: { r: 173, g: 216, b: 230 },
    lightgreen: { r: 144, g: 238, b: 144 },
};

/** "#rgb", "#rrggbb" (an alpha byte is ignored), "rgb(r, g, b)" or a keyword the tokens use; null for anything else. */
export function parseInk(value: string): Rgb | null {
    const text = value.trim().toLowerCase();
    if (/^#[0-9a-f]{3,4}$/.test(text)) {
        const d = text.slice(1);
        return { r: parseInt(d[0] + d[0], 16), g: parseInt(d[1] + d[1], 16), b: parseInt(d[2] + d[2], 16) };
    }
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(text)) {
        return { r: parseInt(text.slice(1, 3), 16), g: parseInt(text.slice(3, 5), 16), b: parseInt(text.slice(5, 7), 16) };
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(text);
    if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    return KEYWORDS[text] ?? null;
}

function channel(byte: number): number {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance, 0 for black and 1 for white. */
export function luminance(ink: Rgb): number {
    return 0.2126 * channel(ink.r) + 0.7152 * channel(ink.g) + 0.0722 * channel(ink.b);
}

/** WCAG 2.1 contrast ratio between two inks, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hex2(byte: number): string {
    return Math.round(Math.max(0, Math.min(255, byte))).toString(16).padStart(2, '0');
}

/** "#rrggbb". */
export function inkText(ink: Rgb): string {
    return '#' + hex2(ink.r) + hex2(ink.g) + hex2(ink.b);
}

/**
 * The colour as given when it already reads against `paper` at `ratio`, else the same hue scaled
 * darker, step by step, until it does: its channels shrink together, so a yellow stays a yellow and a
 * pale blue a blue. A colour that cannot be read (not a colour) is returned as given.
 */
export function readableOn(value: string, paper: string, ratio: number): string {
    const ink = parseInk(value);
    const bg = parseInk(paper);
    if (!ink || !bg) return value;
    if (contrast(ink, bg) >= ratio) return value;
    let scale = 1;
    let now = ink;
    for (let step = 0; step < 100; step += 1) {
        scale -= 0.01;
        now = { r: ink.r * scale, g: ink.g * scale, b: ink.b * scale };
        if (contrast(now, bg) >= ratio) break;
    }
    return inkText(now);
}
