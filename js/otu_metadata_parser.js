/**
 * PROJECT AS ABOVE, SO BELOW
 * Module: OTU Metadata Parser
 * Description: Parses travellermap sector metadata XML and registers
 *   <Route> elements. Links with no allegiance stay on the X-boat route.
 *   Links with an Allegiance use that code's stylesheet color and their
 *   own route slot.
 *
 * Sean Protocol: Zero RPG logic here. Pure XML → hexId mapping.
 * Depends on: routes.js (addRoute), core.js (sectorSlotToNumber)
 */

(function () {
    'use strict';

    // Derive the subsector letter from a 4-digit travellermap hex code.
    // Mirrors the identical logic in importT5Tab (io_manager.js).
    function hexCodeToSubChar(hexCode) {
        const hexVal = parseInt(hexCode, 10);
        const lQ     = Math.floor(hexVal / 100);
        const lR     = hexVal % 100;
        const subX   = Math.floor((lQ - 1) / 8);
        const subY   = Math.floor((lR - 1) / 10);
        return String.fromCharCode(65 + (subY * 4 + subX));
    }

    function hexCodeToHexId(slotNum, hexCode) {
        return `${slotNum}-${hexCodeToSubChar(hexCode)}-${hexCode}`;
    }

    // Route colors from Traveller Map's default OTU stylesheet
    // (res/styles/otu.css). A sector stylesheet overrides these.
    const OTU_DEFAULT_ROUTE_COLORS = {
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
        'Core Route': 'purple'
    };

    // Read `route.CODE { color: ... }` rules, including comma-separated
    // selectors and escaped spaces (route.Core\ Route).
    function routeColorsFromStylesheet(text) {
        const map = new Map();
        if (!text) return map;
        const rules = text.split('}');
        for (let i = 0; i < rules.length; i++) {
            const parts = rules[i].split('{');
            if (parts.length < 2) continue;
            const colorMatch = parts[1].match(/color:\s*([^;}\s]+)/i);
            if (!colorMatch) continue;
            const color = colorMatch[1];
            const selRe = /route\.((?:\\[\s\S]|[^\s,{])+)/g;
            let match;
            while ((match = selRe.exec(parts[0]))) {
                const code = match[1].replace(/\\ /g, ' ').replace(/\\/g, '');
                map.set(code, color);
            }
        }
        return map;
    }

    function nextRouteSlotId() {
        const ids = [
            ...(window.routeDefinitions || []).map(d => d.id),
            ...(window.sectorRoutes || []).map(r => r.routeId)
        ].map(Number).filter(n => Number.isFinite(n));
        return ids.length > 0 ? Math.max(...ids) + 1 : 1;
    }

    function nextRouteColor() {
        const used = new Set((window.routeDefinitions || []).map(d => (d.color || '').toLowerCase()));
        const palette = (typeof getRouteColorPalette === 'function')
            ? getRouteColorPalette()
            : ['#016a01', '#ff0000', '#ffff00', '#ff8800', '#00ddff'];
        return palette.find(c => !used.has(c.toLowerCase()))
            || ('#' + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0'));
    }

    // One Route Manager slot per allegiance code, reused across sectors.
    function claimOtuRouteSlot(code, color, label, style) {
        const groupId = 'otu-route:' + code;
        if (!window.routeDefinitions) {
            window.routeDefinitions = (typeof getDefaultRouteDefinitions === 'function')
                ? getDefaultRouteDefinitions()
                : [];
        }
        let def = window.routeDefinitions.find(d => d.groupId === groupId);
        if (!def) {
            def = {
                id: nextRouteSlotId(),
                name: label || code,
                color: color || nextRouteColor(),
                shortcut: null,
                visible: true,
                automationRef: null,
                groupId,
                style: style || ''
            };
            window.routeDefinitions.push(def);
            return def;
        }
        if (label) def.name = label;
        if (color) def.color = color;
        if (style) def.style = style;
        return def;
    }

    /**
     * Parse metadata XML for one sector and add its <Route> and <Borders> elements.
     *
     * Cross-sector routes carry EndOffsetX / EndOffsetY attributes that shift
     * the end hex into an adjacent sector grid position.  coordLookup resolves
     * those offsets to a slot number; routes whose target sector is absent from
     * the lookup are skipped with a console warning.
     *
     * The renderer (drawRouteSegment) already handles routes whose endpoint
     * hexes are not yet populated — it silently skips them — so routes to
     * unloaded but known sectors are safe to store.
     *
     * @param {string} sectorName  - Human-readable name, used only for logs.
     * @param {string} xmlText     - Raw metadata XML from travellermap.
     * @param {number} slotNum     - Numeric slot assigned to this sector.
     * @param {number} sectorX     - Grid X position of this sector.
     * @param {number} sectorY     - Grid Y position of this sector.
     * @param {Map}    coordLookup - Map<"x,y" → slotNum> for all known sectors.
     * @param {object} [options]   - { importRoutes: bool, importBorders: bool, importRegions: bool } — defaults to all true.
     */
    function parseAndAddOtuRoutes(sectorName, xmlText, slotNum, sectorX, sectorY, coordLookup, options) {
        if (!xmlText) return;

        const importRoutes  = !options || options.importRoutes  !== false;
        const importBorders = !options || options.importBorders !== false;
        const importRegions = !options || options.importRegions !== false;

        // Strip <DataFile .../> before parsing — its Author attribute sometimes
        // contains unescaped double quotes (e.g. Jason "Flynn" Kemp) which
        // cause a hard parse error before the parser reaches <Borders>/<Routes>.
        const cleanXml = xmlText.replace(/\s*<DataFile\b[^>]*\/>/g, '');
        let doc;
        try {
            doc = new DOMParser().parseFromString(cleanXml, 'application/xml');
        } catch (e) {
            console.warn(`[OTU Metadata] XML parse failed for "${sectorName}": ${e.message}`);
            return;
        }

        if (doc.querySelector('parsererror')) {
            console.warn(`[OTU Metadata] Malformed XML for "${sectorName}" — skipped.`);
            return;
        }

        // Subsector names live in the same metadata file as routes/borders.
        // Always apply them when XML is in hand — they are not optional layers.
        importSubsectorNamesFromXml(doc, slotNum);

        if (importRoutes) {
            const routeEls = doc.querySelectorAll('Route');
            let added = 0, skipped = 0;
            const sheetEl = doc.querySelector('Stylesheet');
            const sheetColors = routeColorsFromStylesheet(sheetEl ? sheetEl.textContent : '');
            const allegianceNames = (options && options.allegianceNames) || {};

            doc.querySelectorAll('Allegiance').forEach(el => {
                const code = (el.getAttribute('Code') || '').trim();
                const name = (el.textContent || '').trim();
                if (code && name) allegianceNames[code] = name;
            });

            routeEls.forEach(el => {
                const startCode = el.getAttribute('Start');
                const endCode   = el.getAttribute('End');
                if (!startCode || !endCode) return;

                // Resolve start sector — StartOffsetX/Y shift the start hex into an adjacent sector.
                const startOffsetX = parseInt(el.getAttribute('StartOffsetX') || '0', 10);
                const startOffsetY = parseInt(el.getAttribute('StartOffsetY') || '0', 10);
                let startSlotNum = slotNum;
                if (startOffsetX !== 0 || startOffsetY !== 0) {
                    const startKey  = `${sectorX + startOffsetX},${sectorY + startOffsetY}`;
                    const startSlot = coordLookup.get(startKey);
                    if (startSlot === undefined) {
                        console.warn(`[OTU Metadata] "${sectorName}": cross-sector route from (${startKey}) skipped — sector not in lookup.`);
                        skipped++;
                        return;
                    }
                    startSlotNum = startSlot;
                }

                const startId = hexCodeToHexId(startSlotNum, startCode);

                // Resolve end sector — EndOffsetX/Y shift the end hex into an adjacent sector.
                const offsetX = parseInt(el.getAttribute('EndOffsetX') || '0', 10);
                const offsetY = parseInt(el.getAttribute('EndOffsetY') || '0', 10);
                let endSlotNum = slotNum;
                if (offsetX !== 0 || offsetY !== 0) {
                    const targetKey  = `${sectorX + offsetX},${sectorY + offsetY}`;
                    const targetSlot = coordLookup.get(targetKey);
                    if (targetSlot === undefined) {
                        console.warn(`[OTU Metadata] "${sectorName}": cross-sector route to (${targetKey}) skipped — sector not in lookup.`);
                        skipped++;
                        return;
                    }
                    endSlotNum = targetSlot;
                }

                const endId = hexCodeToHexId(endSlotNum, endCode);
                if (typeof addRoute !== 'function') return;

                const alleg = (el.getAttribute('Allegiance') || '').trim();
                if (!alleg) {
                    addRoute(startId, endId, 'Xboat');
                    added++;
                    return;
                }

                const ownColor = (el.getAttribute('Color') || '').trim();
                const color = ownColor || sheetColors.get(alleg) || OTU_DEFAULT_ROUTE_COLORS[alleg] || '';
                const style = (el.getAttribute('Style') || '').trim();
                const def = claimOtuRouteSlot(alleg, color, allegianceNames[alleg] || alleg, style);
                addRoute(startId, endId, 'Xboat', null, { routeId: def.id, groupId: def.groupId });
                added++;
            });

            if (added > 0 || skipped > 0) {
                console.log(`[OTU Metadata] "${sectorName}": ${added} route(s) added, ${skipped} cross-sector skipped.`);
            }
        }

        if (importBorders) {
            const bordersEl = doc.querySelector('Borders');
            if (bordersEl && typeof window.importBordersFromXml === 'function') {
                const result = window.importBordersFromXml(bordersEl, slotNum);
                if (result.skipped.length > 0) {
                    console.warn(`[OTU Metadata] "${sectorName}": ${result.skipped.length} border(s) skipped — no free slots: ${result.skipped.map(s => s.label).join(', ')}`);
                }
            }
        }

        if (importRegions) {
            const regionsEl = doc.querySelector('Regions');
            if (regionsEl && typeof window.importRegionsFromXml === 'function') {
                const result = window.importRegionsFromXml(regionsEl, slotNum);
                if (result.assigned.length > 0) {
                    console.log(`[OTU Metadata] "${sectorName}": ${result.assigned.length} region(s) imported — ${result.assigned.map(r => r.label).join(', ')}`);
                }
                if (result.skipped.length > 0) {
                    console.warn(`[OTU Metadata] "${sectorName}": ${result.skipped.length} region(s) skipped — ${result.skipped.map(r => r.label).join(', ')}`);
                }
            }
        }

    }

    /**
     * Reads TravellerMap <Subsector Index="A">Name</Subsector> nodes into
     * window.subsectorNames keyed "slotNum-letter".
     */
    function importSubsectorNamesFromXml(doc, slotNum) {
        if (!doc || slotNum == null) return 0;
        if (typeof setSubsectorName !== 'function') return 0;
        if (typeof clearSubsectorNamesForSector === 'function') {
            clearSubsectorNamesForSector(slotNum);
        }
        let n = 0;
        doc.querySelectorAll('Subsector').forEach(el => {
            const idx = (el.getAttribute('Index') || '').trim().toUpperCase();
            const name = (el.textContent || '').trim();
            if (!/^[A-P]$/.test(idx) || !name) return;
            setSubsectorName(slotNum, idx, name);
            n++;
        });
        return n;
    }

    window.parseAndAddOtuRoutes = parseAndAddOtuRoutes;
    window.importSubsectorNamesFromXml = importSubsectorNamesFromXml;
}());
