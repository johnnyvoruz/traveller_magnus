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

function regionStandIn(el) {
    return {
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null;
        },
        textContent: el.text,
        querySelectorAll(sel) {
            if (sel !== 'Region') throw new Error(`regions stand-in: unsupported selector ${sel}`);
            return el.children.filter((child) => child.name === 'Region').map((child) => regionStandIn(child));
        },
    };
}

/** The <Regions> element, or null when the sector metadata has none. */
export function regionsElementOf(xmlText) {
    const sector = parseXmlElements(xmlText).children.find((child) => child.name === 'Sector');
    const regions = sector && sector.children.find((child) => child.name === 'Regions');
    if (!regions) return null;
    return regionStandIn(regions);
}

function tagName(sel) {
    if (!/^[A-Za-z_][\w:.-]*$/.test(sel)) throw new Error(`metadata stand-in: unsupported selector ${sel}`);
    return sel;
}

function metadataElement(el) {
    return {
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null;
        },
        textContent: el.text,
        querySelector(sel) {
            return metadataQuery(el, tagName(sel))[0] || null;
        },
        querySelectorAll(sel) {
            return metadataQuery(el, tagName(sel));
        },
    };
}

function metadataQuery(el, name) {
    const out = [];
    const walk = (node) => {
        for (const child of node.children) {
            if (child.name === name) out.push(metadataElement(child));
            walk(child);
        }
    };
    walk(el);
    return out;
}

/** DOMParser stand-in for parseAndAddOtuRoutes. Node has no DOMParser. */
export class MetadataDOMParser {
    parseFromString(xml) {
        return metadataElement(parseXmlElements(xml));
    }
}
