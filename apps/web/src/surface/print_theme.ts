/**
 * Ink for a surface saved on paper (CS11). The colours are the --print-surface-* tokens.
 * No colour is written here.
 */
export type SurfaceInk = {
    paper: string;
    text: string;
    muted: string;
    sea: string;
    shallow: string;
    ice: string;
    land: string;
    high: string;
    grid: string;
    coast: string;
    /** Pale water and the vanilla ramp (CP9). Not marks: they stay light on the page. */
    wash: string;
    washShallow: string;
    washLand: string;
    washIce: string;
};

const NAMES = ['paper', 'text', 'muted', 'sea', 'shallow', 'ice', 'land', 'high', 'grid', 'coast', 'wash', 'washShallow', 'washLand', 'washIce'] as const;

const TOKEN: Record<(typeof NAMES)[number], string> = {
    paper: '--print-paper',
    text: '--print-surface-text',
    muted: '--print-surface-muted',
    sea: '--print-surface-sea',
    shallow: '--print-surface-shallow',
    ice: '--print-surface-ice',
    land: '--print-surface-land',
    high: '--print-surface-high',
    grid: '--print-surface-grid',
    coast: '--print-surface-coast',
    wash: '--print-surface-wash',
    washShallow: '--print-surface-wash-shallow',
    washLand: '--print-surface-wash-land',
    washIce: '--print-surface-wash-ice',
};

/** The print tokens as the page has resolved them. */
export function printSurfaceInk(el: Element): SurfaceInk {
    const css = getComputedStyle(el);
    const read = (name: string): string => css.getPropertyValue(name).trim();
    const ink = {} as SurfaceInk;
    for (const name of NAMES) ink[name] = read(TOKEN[name]);
    return ink;
}

/** The screen's own ground. A saved image does not use it: both looks are drawn on the paper token. */
export function screenGround(el: Element): string {
    return getComputedStyle(el).getPropertyValue('--bg-0').trim();
}

/** Words on the screen. A saved image uses the print text tokens, which can be read on white. */
export function screenText(el: Element): string {
    return getComputedStyle(el).getPropertyValue('--text-0').trim();
}

/** The text face, for the caption and the key. */
export function surfaceFont(el: Element): string {
    return getComputedStyle(el).getPropertyValue('--font-text').trim() || 'sans-serif';
}
