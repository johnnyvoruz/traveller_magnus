/**
 * Map covers that read at card size (streams/D.md D5; Johnny, 18:40: "crop at upload"). A map
 * package's cover is often a screenshot of the map: a few systems in a wide dark chart, which at
 * 300 px reads as a few dots. When such a picture is added, it is trimmed to the box round the
 * systems (the bright pixels: worlds, names, UWPs), padded and widened to the card's 16:9. A picture
 * that is not mostly dark chart (a painting, a photo), or whose systems already fill it, is left as
 * it is. Pure: it runs under Node on a luminance array.
 */

export type TrimBox = { x: number; y: number; w: number; h: number };

/** A pixel this bright (0 to 255) is part of what is drawn: a world, a name, a line of a UWP. */
export const TRIM_BRIGHT = 110;
/** A pixel this dark is empty chart. */
export const TRIM_DARK = 70;
/** A map screenshot is at least this much empty chart; the default paintings are at most 62 %. */
export const TRIM_DARK_SHARE = 0.85;
/** Room kept round the systems, as a share of their box on each side. */
export const TRIM_PAD = 0.12;
/** A crop must take away at least this much of the picture to be worth it (it keeps at most 70 %). */
export const TRIM_KEEP_MAX = 0.7;
const ASPECT = 16 / 9;

/**
 * The box to keep, in the picture's own pixels, or null to keep the picture whole. `luma` holds one
 * value per pixel, row by row.
 */
export function chartTrim(luma: ArrayLike<number>, width: number, height: number): TrimBox | null {
    const count = width * height;
    if (!(width > 0 && height > 0) || luma.length < count) return null;
    let dark = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v = luma[y * width + x];
            if (v < TRIM_DARK) dark++;
            if (v > TRIM_BRIGHT) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0 || dark / count < TRIM_DARK_SHARE) return null;
    let w = x1 + 1 - x0;
    let h = y1 + 1 - y0;
    let cx = x0 + w / 2;
    let cy = y0 + h / 2;
    w *= 1 + 2 * TRIM_PAD;
    h *= 1 + 2 * TRIM_PAD;
    if (w / h < ASPECT) w = h * ASPECT;
    else h = w / ASPECT;
    // Never larger than the picture; then moved, not cut, to stay inside it.
    w = Math.min(w, width);
    h = Math.min(h, height);
    cx = Math.min(Math.max(cx, w / 2), width - w / 2);
    cy = Math.min(Math.max(cy, h / 2), height - h / 2);
    const box = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
    if ((box.w * box.h) / count > TRIM_KEEP_MAX) return null;
    return box;
}

/** Rec. 601 luma of RGBA pixels, one value per pixel. */
export function lumaOf(rgba: ArrayLike<number>, pixels: number): Uint8Array {
    const out = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
        const at = i * 4;
        out[i] = Math.round(0.299 * rgba[at] + 0.587 * rgba[at + 1] + 0.114 * rgba[at + 2]);
    }
    return out;
}
