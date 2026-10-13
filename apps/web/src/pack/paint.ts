/**
 * Colours for the Player Pack file. The page reads the app's tokens. A test
 * can pass its own values. This module names no colour.
 */
export type PackPaint = {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    line: string;
    signal: string;
    onSignal: string;
};

const NAMES: (keyof PackPaint)[] = ['bg', 'surface', 'text', 'muted', 'line', 'signal', 'onSignal'];

const TOKEN: Record<keyof PackPaint, string> = {
    bg: '--bg-1',
    surface: '--surface-1',
    text: '--text-1',
    muted: '--text-muted',
    line: '--line-1',
    signal: '--signal',
    onSignal: '--on-signal',
};

/** The tokens as the page has resolved them. Empty where there is no document. */
export function readPackPaint(): PackPaint {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
    const paint = {} as PackPaint;
    for (const key of NAMES) {
        const value = style ? style.getPropertyValue(TOKEN[key]).trim() : '';
        paint[key] = value;
    }
    return paint;
}
