/** Dependency-free tokenizer. TravellerMap sector metadata is a shallow element tree. */

export type XmlEl = { name: string; attrs: Record<string, string>; children: XmlEl[]; text: string };

export function parseXmlElements(xml: string): XmlEl {
    const root: XmlEl = { name: '#root', attrs: {}, children: [], text: '' };
    const stack: XmlEl[] = [root];
    let i = 0;
    while (i < xml.length) {
        if (xml[i] !== '<') {
            const j = xml.indexOf('<', i);
            stack[stack.length - 1].text += xml.slice(i, j === -1 ? xml.length : j);
            if (j === -1) break;
            i = j;
            continue;
        }
        if (xml.startsWith('<?', i)) { i = xml.indexOf('?>', i) + 2; continue; }
        if (xml.startsWith('<!--', i)) { i = xml.indexOf('-->', i) + 3; continue; }
        if (xml.startsWith('<![CDATA[', i)) {
            const j = xml.indexOf(']]>', i);
            stack[stack.length - 1].text += xml.slice(i + 9, j);
            i = j + 3;
            continue;
        }
        if (xml.startsWith('</', i)) { stack.pop(); i = xml.indexOf('>', i) + 1; continue; }
        const j = xml.indexOf('>', i);
        let raw = xml.slice(i + 1, j);
        const self = raw.endsWith('/');
        if (self) raw = raw.slice(0, -1);
        const name = raw.split(/\s/, 1)[0];
        const attrs: Record<string, string> = {};
        const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
        let m: RegExpExecArray | null;
        while ((m = attrRe.exec(raw))) attrs[m[1]] = m[2];
        const el: XmlEl = { name, attrs, children: [], text: '' };
        stack[stack.length - 1].children.push(el);
        if (!self) stack.push(el);
        i = j + 1;
    }
    return root;
}

function kids(el: XmlEl | undefined, name: string): XmlEl[] {
    return el ? el.children.filter(c => c.name === name) : [];
}
function child(el: XmlEl, name: string): XmlEl | undefined {
    return el.children.find(c => c.name === name);
}

export type MetadataXml = {
    name: string;
    x: number | null;
    y: number | null;
    milieu: string;
    names: Record<string, string>;
    allegiances: { code: string; base?: string; name: string }[];
    borders: Record<string, string>[];
    regions: Record<string, string>[];
    routes: Record<string, string>[];
    sectorLang: Record<string, string>;
    stylesheet: string;
};

/** { routes, borders, regions, names, allegiances } plus the sector name, coordinates and milieu. */
export function parseMetadataXml(text: string): MetadataXml {
    const sector = parseXmlElements(text).children.find(c => c.name === 'Sector');
    if (!sector) throw new Error('metadata xml: no Sector element');
    let name = '';
    const sectorLang: Record<string, string> = {};
    for (const n of kids(sector, 'Name')) {
        const value = n.text.trim();
        if (!n.attrs.Lang && !name) name = value;
        else if (n.attrs.Lang) sectorLang[n.attrs.Lang] = value;
    }
    const names: Record<string, string> = {};
    for (const s of kids(child(sector, 'Subsectors'), 'Subsector')) names[s.attrs.Index] = s.text.trim();
    const xText = child(sector, 'X')?.text.trim() ?? '';
    const yText = child(sector, 'Y')?.text.trim() ?? '';
    const allegiances = kids(child(sector, 'Allegiances'), 'Allegiance').map(a => ({
        code: a.attrs.Code,
        ...(a.attrs.Base !== undefined ? { base: a.attrs.Base } : {}),
        name: a.text.trim(),
    }));
    const borders = kids(child(sector, 'Borders'), 'Border').map(b => ({ ...b.attrs, path: b.text.trim() }));
    const regions = kids(child(sector, 'Regions'), 'Region').map(r => ({ ...r.attrs, path: r.text.trim() }));
    const routes = kids(child(sector, 'Routes'), 'Route').map(r => ({ ...r.attrs }));
    return {
        name, x: xText === '' ? null : Number(xText), y: yText === '' ? null : Number(yText),
        milieu: child(sector, 'DataFile')?.attrs.Milieu || '',
        names, allegiances, borders, regions, routes, sectorLang,
        stylesheet: child(sector, 'Stylesheet')?.text ?? '',
    };
}
