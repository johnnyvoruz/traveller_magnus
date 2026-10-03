// Smallest DOM stand-in importBordersFromXml needs. Built from parseXmlElements.
import { parseXmlElements } from '@voyage/shared';

function standIn(el, doc) {
    return {
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null;
        },
        textContent: el.text,
        querySelectorAll(sel) {
            if (sel !== 'Border') throw new Error(`borders stand-in: unsupported selector ${sel}`);
            return el.children.filter((child) => child.name === 'Border').map((child) => standIn(child, doc));
        },
        ownerDocument: doc,
    };
}

/** The <Borders> element, or null when the sector metadata has none. */
export function bordersElementOf(xmlText) {
    const sector = parseXmlElements(xmlText).children.find((child) => child.name === 'Sector');
    const borders = sector && sector.children.find((child) => child.name === 'Borders');
    if (!borders) return null;
    const doc = {
        querySelector(sel) {
            if (sel === 'Stylesheet') {
                const sheet = sector.children.find((child) => child.name === 'Stylesheet');
                return sheet ? standIn(sheet, doc) : null;
            }
            const match = /^Allegiance\[Code="([^"]*)"\]$/.exec(sel);
            if (!match) throw new Error(`borders stand-in: unsupported selector ${sel}`);
            const list = sector.children.find((child) => child.name === 'Allegiances');
            const found = list && list.children.find((child) => child.name === 'Allegiance' && child.attrs.Code === match[1]);
            return found ? standIn(found, doc) : null;
        },
    };
    return standIn(borders, doc);
}
