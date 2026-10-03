/** Colours and fonts from tokens.css. No colour literal lives in this file. */

export type MapTheme = {
    bg0: string;
    line1: string;
    line2: string;
    signal: string;
    signalDim: string;
    text1: string;
    textMuted: string;
    fontDisplay: string;
    fontData: string;
    fontText: string;
};

/** Durations in seconds, read from the motion tokens. Callers own what they mean. */
export type MapMotion = { tBase: number; tSlow: number; tLong: number };

function token(style: CSSStyleDeclaration, name: string): string {
    return style.getPropertyValue(name).trim();
}

function cssTime(raw: string): number {
    const value = raw.trim();
    if (value.endsWith('ms')) return Number(value.slice(0, -2)) / 1000;
    if (value.endsWith('s')) return Number(value.slice(0, -1));
    throw new Error('theme: cannot read time "' + raw + '"');
}

export function readTheme(el: HTMLElement): MapTheme {
    const style = getComputedStyle(el);
    return {
        bg0: token(style, '--bg-0'),
        line1: token(style, '--line-1'),
        line2: token(style, '--line-2'),
        signal: token(style, '--signal'),
        signalDim: token(style, '--signal-dim'),
        text1: token(style, '--text-1'),
        textMuted: token(style, '--text-muted'),
        fontDisplay: token(style, '--font-display'),
        fontData: token(style, '--font-data'),
        fontText: token(style, '--font-text'),
    };
}

export function readMotion(el: HTMLElement): MapMotion {
    const style = getComputedStyle(el);
    return {
        tBase: cssTime(token(style, '--t-base')),
        tSlow: cssTime(token(style, '--t-slow')),
        tLong: cssTime(token(style, '--t-long')),
    };
}
