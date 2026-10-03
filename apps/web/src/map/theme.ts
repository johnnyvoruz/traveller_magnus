/** Colours and fonts from tokens.css. No colour literal lives in this file. */

export type ChartColours = {
    world: string;
    water: string;
    zoneAmber: string;
    zoneRed: string;
    grid: string;
    selected: string;
    routeXboat: string;
    routeOther: string;
    titleText: string;
    titlePill: string;
};

/** Original allegiance codes from OTU_DEFAULT_ROUTE_COLORS. Keys of routeColours. */
export const ROUTE_COLOUR_CODES = [
    'Im', 'SoCf', 'ZhCo', 'As', 'AsXX', 'HvFd', 'Kk', 'KkTw', 'JuPr', 'JAOz',
    'JAsi', 'JCoK', 'JHhk', 'JLum', 'JMen', 'JPSt', 'JRar', 'JUkh', 'JVug',
    'JuHl', 'JuRu', 'Core Route',
];

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
    chart: ChartColours;
    routeColours: Record<string, string>;
};

/** Durations in seconds, read from the motion tokens. Callers own what they mean. */
export type MapMotion = { tBase: number; tSlow: number; tLong: number };

function token(style: CSSStyleDeclaration, name: string): string {
    return style.getPropertyValue(name).trim();
}

function routeToken(code: string): string {
    return '--chart-route-' + code.toLowerCase().replace(/ /g, '-');
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
        chart: {
            world: token(style, '--chart-world'),
            water: token(style, '--chart-water'),
            zoneAmber: token(style, '--chart-zone-amber'),
            zoneRed: token(style, '--chart-zone-red'),
            grid: token(style, '--chart-grid'),
            selected: token(style, '--chart-selected'),
            routeXboat: token(style, '--chart-route-xboat'),
            routeOther: token(style, '--chart-route-other'),
            titleText: token(style, '--chart-title-text'),
            titlePill: token(style, '--chart-title-pill'),
        },
        routeColours: routeColours(style),
    };
}

function routeColours(style: CSSStyleDeclaration): Record<string, string> {
    const colours: Record<string, string> = {};
    for (const code of ROUTE_COLOUR_CODES) colours[code] = token(style, routeToken(code));
    return colours;
}

export function readMotion(el: HTMLElement): MapMotion {
    const style = getComputedStyle(el);
    return {
        tBase: cssTime(token(style, '--t-base')),
        tSlow: cssTime(token(style, '--t-slow')),
        tLong: cssTime(token(style, '--t-long')),
    };
}
