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
};

const NAMES = ['paper', 'text', 'muted', 'sea', 'shallow', 'ice', 'land', 'high', 'grid', 'coast'] as const;

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
};

/** The print tokens as the page has resolved them. */
export function printSurfaceInk(el: Element): SurfaceInk {
    const css = getComputedStyle(el);
    const read = (name: string): string => css.getPropertyValue(name).trim();
    const ink = {} as SurfaceInk;
    for (const name of NAMES) ink[name] = read(TOKEN[name]);
    return ink;
}

/** The page behind a full-colour surface. */
export function screenGround(el: Element): string {
    return getComputedStyle(el).getPropertyValue('--bg-0').trim();
}

/** Words on that page. The print text is ink for white paper, so the colour sheet uses this. */
export function screenText(el: Element): string {
    return getComputedStyle(el).getPropertyValue('--text-0').trim();
}

/** The text face, for the caption and the key. */
export function surfaceFont(el: Element): string {
    return getComputedStyle(el).getPropertyValue('--font-text').trim() || 'sans-serif';
}
