// Port of js/otu_metadata_parser.js route colours (33-77) and the colour choice
// at line 235. The next unused palette colour (88-94) is session state and is
// not ported: an allegiance that resolves to nothing returns ''.

const OTU_DEFAULT_ROUTE_COLORS: Record<string, string> = {
    'Im': '#048104',
    'SoCf': '#048104',
    'ZhCo': 'lightblue',
    'As': 'yellow',
    'AsXX': 'yellow',
    'HvFd': 'gray',
    'Kk': 'gray',
    'KkTw': 'gray',
    'JuPr': 'lightgreen',
    'JAOz': 'lightblue',
    'JAsi': 'lightblue',
    'JCoK': 'lightblue',
    'JHhk': 'lightblue',
    'JLum': 'lightblue',
    'JMen': 'lightblue',
    'JPSt': 'lightblue',
    'JRar': 'lightblue',
    'JUkh': 'lightblue',
    'JVug': 'lightblue',
    'JuHl': 'lightblue',
    'JuRu': 'lightblue',
    'Core Route': 'purple',
};

/** `route.CODE { color }` rules, including comma-separated selectors. */
export function routeStylesheetRules(stylesheet: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!stylesheet) return map;
    const rules = stylesheet.split('}');
    for (let i = 0; i < rules.length; i++) {
        const parts = rules[i].split('{');
        if (parts.length < 2) continue;
        const colorMatch = parts[1].match(/color:\s*([^;}\s]+)/i);
        if (!colorMatch) continue;
        const color = colorMatch[1];
        const selRe = /route\.((?:\\[\s\S]|[^\s,{])+)/g;
        let match: RegExpExecArray | null;
        while ((match = selRe.exec(parts[0]))) {
            const code = match[1].replace(/\\ /g, ' ').replace(/\\/g, '');
            map.set(code, color);
        }
    }
    return map;
}

/** Own Color, else the stylesheet rule for Allegiance, else the built-in table, else ''. */
export function routeColour(route: Record<string, string>, stylesheetRules: Map<string, string>): string {
    const alleg = (route.Allegiance || '').trim();
    if (!alleg) return '';
    const ownColor = (route.Color || '').trim();
    return ownColor || stylesheetRules.get(alleg) || OTU_DEFAULT_ROUTE_COLORS[alleg] || '';
}
