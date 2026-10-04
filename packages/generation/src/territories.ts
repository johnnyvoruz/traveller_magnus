// Port of js/borders.js importBordersFromXml (574-1141) and the colour tables (21-41).
// One sector, slot 1. Nothing in the fill is simplified.

export type BorderRecord = Record<string, string>;
export type Territory = { id: number; name: string; color: string; allegianceCodes: string[]; hexes: string[] };

const BORDER_COLOR_MAP: Record<string, string> = {
    'red': '#e63946', 'crimson': '#dc143c', 'darkred': '#8b0000',
    'orange': '#f4a261', 'gold': '#ffd700', 'amber': '#ffbf00',
    'yellow': '#e9c46a', 'olive': '#808000',
    'green': '#06d6a0', 'lime': '#32cd32', 'darkgreen': '#006400',
    'teal': '#2a9d8f', 'cyan': '#00e5ff', 'aqua': '#00e5ff',
    'blue': '#4cc9f0', 'navy': '#003580', 'darkblue': '#00008b',
    'purple': '#7209b7', 'violet': '#8a2be2', 'indigo': '#4b0082',
    'magenta': '#e040fb', 'fuchsia': '#ff00ff',
    'pink': '#f72585', 'hotpink': '#ff69b4', 'rose': '#ff007f',
    'brown': '#a0522d', 'maroon': '#800000', 'sienna': '#a0522d',
    'white': '#ffffff', 'silver': '#c0c0c0',
    'gray': '#888888', 'grey': '#888888', 'darkgray': '#555555',
    'black': '#333333',
};

export const BORDER_COLOR_CYCLE = [
    '#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#4cc9f0', '#7209b7', '#f72585', '#06d6a0',
    '#ffffff', '#ff6b35', '#b5e48c', '#0077b6', '#9d4edd', '#ffbe0b', '#d62828', '#52b788',
    '#c77dff', '#3a86ff', '#fb8500', '#a8dadc',
];

type Slot = {
    id: number;
    name: string;
    color: string;
    visible: boolean;
    allegiance?: string;
    allegianceCodes?: string[];
};

type GroupItem = { rec: BorderRecord; allegianceCode: string; color: string; labelPos: string };

function defaultSlots(): Slot[] {
    return [
        { id: 1, name: 'Border 1', color: '#e63946', visible: true },
        { id: 2, name: 'Border 2', color: '#f4a261', visible: true },
        { id: 3, name: 'Border 3', color: '#e9c46a', visible: true },
        { id: 4, name: 'Border 4', color: '#2a9d8f', visible: true },
        { id: 5, name: 'Border 5', color: '#4cc9f0', visible: true },
    ];
}

function hexNeighbors(q: number, r: number): [number, number][] {
    const p = q & 1;
    return [
        [q + 1, r + (p ? 1 : 0)],
        [q, r + 1],
        [q - 1, r + (p ? 1 : 0)],
        [q - 1, r + (p ? 0 : -1)],
        [q, r - 1],
        [q + 1, r + (p ? 0 : -1)],
    ];
}

function qrToHexId(q: number, r: number): string {
    const lQ = q % 32;
    const lR = r % 40;
    return `${String(lQ + 1).padStart(2, '0')}${String(lR + 1).padStart(2, '0')}`;
}

export function sectorTerritories(input: {
    borders: BorderRecord[];
    allegiances: { code: string; name: string }[];
    stylesheet: string;
}): Territory[] {
    if (!input.borders.length) return [];

    const byGroup = new Map<string, GroupItem[]>();
    const stylesheetColors = new Map<string, string>();
    {
        const cssRe = /border\.(\w+)\s*\{[^}]*color:\s*([^;}\s]+)/g;
        let m: RegExpExecArray | null;
        while ((m = cssRe.exec(input.stylesheet || '')) !== null) {
            const code = m[1];
            const colorStr = m[2].toLowerCase().trim();
            const hex = colorStr.startsWith('#') ? colorStr : BORDER_COLOR_MAP[colorStr];
            if (hex) stylesheetColors.set(code, hex);
        }
    }

    for (const rec of input.borders) {
        const allegianceCode = (rec.Allegiance || '').trim();
        const label = (rec.Label || '').trim();
        const groupKey = allegianceCode.startsWith('Kk') ? 'Two Thousand Worlds'
            : allegianceCode.startsWith('V') ? 'Vargr Extents'
            : allegianceCode.startsWith('Zh') ? 'Zhodani Consulate'
            : (label || allegianceCode);
        if (!groupKey) continue;
        const rawColor = (rec.Color || '').trim().toLowerCase();
        const color = rawColor || stylesheetColors.get(allegianceCode) || '';
        const labelPos = (rec.LabelPosition || '').trim();
        if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
        byGroup.get(groupKey)!.push({ rec, allegianceCode, color, labelPos });
    }

    if (byGroup.size === 0) return [];

    const borderDefinitions = defaultSlots();
    const borderPaths = new Map<number, { rawPath: string; labelPos: string; allegianceCode: string; sectorNum: number }[]>();
    const hexBorderAssignments = new Map<string, number>();

    const weakGroupKeys = new Set<string>();
    byGroup.forEach((groupItems, key) => {
        if (groupItems.every(({ rec }) => (rec.ShowLabel || '').toLowerCase() === 'false')) weakGroupKeys.add(key);
    });
    const weakBorderIds = new Set<number>();

    const sortedEntries = [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));

    function hasOffSectorCodes(items: GroupItem[]): boolean {
        return items.some(({ rec }) => {
            const raw = (rec.path || '').trim();
            return raw.split(/\s+/).some(code => {
                if (code.length !== 4) return false;
                const v = parseInt(code, 10);
                const lQ = Math.floor(v / 100), lR = v % 100;
                return lQ < 1 || lQ > 32 || lR < 1 || lR > 40;
            });
        });
    }

    const orderedEntries = [
        ...sortedEntries.filter(([k]) => weakGroupKeys.has(k)),
        ...sortedEntries.filter(([k, items]) => !weakGroupKeys.has(k) && !hasOffSectorCodes(items)),
        ...sortedEntries.filter(([k, items]) => !weakGroupKeys.has(k) && hasOffSectorCodes(items)),
    ];

    orderedEntries.forEach(([groupKey, items]) => {
        const isWeak = weakGroupKeys.has(groupKey);
        let def = borderDefinitions.find(d =>
            d.name === groupKey ||
            (d.allegianceCodes && d.allegianceCodes.includes(groupKey)) ||
            (d.allegianceCodes && items.some(it => it.allegianceCode && d.allegianceCodes!.includes(it.allegianceCode)))
        );
        let isNewSlot = false;

        if (!def) {
            def = borderDefinitions.find(d =>
                (!d.allegianceCodes || d.allegianceCodes.length === 0) &&
                !d.allegiance &&
                !(hexBorderAssignments && [...hexBorderAssignments.values()].includes(d.id)) &&
                !borderPaths.has(d.id)
            );
            isNewSlot = !!def;
        }

        if (!def) {
            const nextId = borderDefinitions.length > 0
                ? Math.max(...borderDefinitions.map(d => d.id)) + 1
                : 1;
            def = {
                id: nextId,
                name: `Border ${nextId}`,
                color: BORDER_COLOR_CYCLE[(nextId - 1) % BORDER_COLOR_CYCLE.length],
                visible: true,
            };
            borderDefinitions.push(def);
            isNewSlot = true;
        }

        if (!isNewSlot && !isWeak) {
            const primaryCode = items.length > 0 ? items[0].allegianceCode : null;
            if (primaryCode && def.name === primaryCode && groupKey !== primaryCode) def.name = groupKey;
        }
        if (isNewSlot) {
            def.name = groupKey;
            const primaryAllegCode = items.length > 0 ? items[0].allegianceCode : null;
            if (primaryAllegCode && primaryAllegCode === groupKey) {
                const allegianceEl = input.allegiances.find(a => a.code === primaryAllegCode);
                if (allegianceEl) {
                    const english = allegianceEl.name.trim();
                    if (english) def.name = english;
                }
            }
            const colorItem = items.find(it => it.color && (it.color.startsWith('#') || BORDER_COLOR_MAP[it.color]));
            if (colorItem) def.color = colorItem.color.startsWith('#') ? colorItem.color : BORDER_COLOR_MAP[colorItem.color];
        }

        if (!def.allegianceCodes) def.allegianceCodes = [];
        items.forEach(it => {
            if (it.allegianceCode && !def.allegianceCodes!.includes(it.allegianceCode)) def.allegianceCodes!.push(it.allegianceCode);
        });

        const secMinQ = 0, secMaxQ = 31, secMinR = 0, secMaxR = 39;

        items.forEach(({ rec, allegianceCode: itemAllegCode, labelPos }) => {
            const boundaryHexIds: string[] = [];
            const boundaryCoords: { q: number; r: number }[] = [];
            const boundaryIsAfterGap: boolean[] = [];
            let hadColLo = false, hadColHi = false;
            let hadRowLo = false, hadRowHi = false;
            let hadGapBefore = false;

            const raw = (rec.path || '').trim();
            if (!raw) return;

            if (!borderPaths.has(def.id)) borderPaths.set(def.id, []);
            borderPaths.get(def.id)!.push({ rawPath: raw, labelPos, allegianceCode: itemAllegCode, sectorNum: 1 });
            raw.split(/\s+/).forEach(code => {
                if (code.length !== 4) return;
                const codeV = parseInt(code, 10);
                const codeLQ = Math.floor(codeV / 100);
                const codeLR = codeV % 100;
                if (codeLQ < 1 || codeLQ > 32 || codeLR < 1 || codeLR > 40) {
                    if (codeLQ < 1) hadColLo = true;
                    if (codeLQ > 32) hadColHi = true;
                    if (codeLR < 1) hadRowLo = true;
                    if (codeLR > 40) hadRowHi = true;
                    hadGapBefore = true;
                    return;
                }
                const c = { q: codeLQ - 1, r: codeLR - 1 };
                boundaryHexIds.push(code);
                boundaryCoords.push(c);
                boundaryIsAfterGap.push(hadGapBefore);
                hadGapBefore = false;
            });

            if (boundaryCoords.length === 0) {
                if (!hadColLo && !hadColHi && !hadRowLo && !hadRowHi) return;
                let wsQ = secMinQ + 15, wsR = secMinR + 19;
                if (labelPos && labelPos.length === 4) {
                    const lpV = parseInt(labelPos, 10);
                    const lpLQ = Math.floor(lpV / 100);
                    const lpLR = lpV % 100;
                    if (lpLQ >= 1 && lpLQ <= 32 && lpLR >= 1 && lpLR <= 40) {
                        wsQ = lpLQ - 1;
                        wsR = lpLR - 1;
                    }
                }
                const wsVisited = new Set([`${wsQ},${wsR}`]);
                const wsQueue: [number, number][] = [[wsQ, wsR]];
                const wsInter: [number, number][] = [];
                while (wsQueue.length > 0) {
                    const next = wsQueue.shift();
                    if (!next) break;
                    const [q, r] = next;
                    wsInter.push([q, r]);
                    hexNeighbors(q, r).forEach(([nq, nr]) => {
                        const k = `${nq},${nr}`;
                        if (!wsVisited.has(k)) {
                            wsVisited.add(k);
                            if (nq >= secMinQ && nq <= secMaxQ && nr >= secMinR && nr <= secMaxR) wsQueue.push([nq, nr]);
                        }
                    });
                }
                wsInter.forEach(([q, r]) => {
                    hexBorderAssignments.set(qrToHexId(q, r), def.id);
                });
                return;
            }

            const boundaryQR = new Set(boundaryCoords.map(({ q, r }) => `${q},${r}`));

            let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
            boundaryCoords.forEach(({ q, r }) => {
                if (q < minQ) minQ = q;
                if (q > maxQ) maxQ = q;
                if (r < minR) minR = r;
                if (r > maxR) maxR = r;
            });

            {
                const closeLoop = !(hadColLo || hadColHi || hadRowLo || hadRowHi);
                const n = boundaryCoords.length;
                const segments = closeLoop ? n : n - 1;
                for (let i = 0; i < segments; i++) {
                    const nextIdx = (i + 1) % n;
                    if (boundaryIsAfterGap[nextIdx]) continue;
                    const { q: q1, r: r1 } = boundaryCoords[i];
                    const { q: q2, r: r2 } = boundaryCoords[nextIdx];
                    const cx1 = q1, cz1 = r1 - (q1 - (q1 & 1)) / 2, cy1 = -cx1 - cz1;
                    const cx2 = q2, cz2 = r2 - (q2 - (q2 & 1)) / 2, cy2 = -cx2 - cz2;
                    const dist = Math.max(Math.abs(cx2 - cx1), Math.abs(cy2 - cy1), Math.abs(cz2 - cz1));
                    for (let step = 1; step < dist; step++) {
                        const t = step / dist;
                        const lx = cx1 + (cx2 - cx1) * t;
                        const ly = cy1 + (cy2 - cy1) * t;
                        const lz = cz1 + (cz2 - cz1) * t;
                        let rx = Math.round(lx), ry = Math.round(ly), rz = Math.round(lz);
                        const dx = Math.abs(rx - lx), dy = Math.abs(ry - ly), dz = Math.abs(rz - lz);
                        if (dx > dy && dx > dz) rx = -ry - rz;
                        else if (dy > dz) ry = -rx - rz;
                        else rz = -rx - ry;
                        const rq = rx;
                        const rr = rz + (rx - (rx & 1)) / 2;
                        if (rq < secMinQ || rq > secMaxQ || rr < secMinR || rr > secMaxR) continue;
                        const k = `${rq},${rr}`;
                        if (boundaryQR.has(k)) continue;
                        boundaryQR.add(k);
                        boundaryHexIds.push(qrToHexId(rq, rr));
                    }
                }
            }

            const candidateSeeds: [number, number][] = [];

            if (labelPos && labelPos.length === 4) {
                const lpV = parseInt(labelPos, 10);
                const lpLQ = Math.floor(lpV / 100);
                const lpLR = lpV % 100;
                if (lpLQ >= 1 && lpLQ <= 32 && lpLR >= 1 && lpLR <= 40) {
                    const lpQ = lpLQ - 1, lpR = lpLR - 1;
                    if (!boundaryQR.has(`${lpQ},${lpR}`)) candidateSeeds.push([lpQ, lpR]);
                }
            }

            if ((hadColLo || hadColHi) && (hadRowLo || hadRowHi)) {
                const cornerQ = hadColLo ? secMinQ : secMaxQ;
                const cornerR = hadRowLo ? secMinR : secMaxR;
                const cProbe: [number, number][] = [[cornerQ, cornerR]];
                const cProbed = new Set([`${cornerQ},${cornerR}`]);
                let csQ: number | null = null, csR: number | null = null;
                for (let i = 0; i < cProbe.length; i++) {
                    const [pq, pr] = cProbe[i];
                    if (!boundaryQR.has(`${pq},${pr}`)) { csQ = pq; csR = pr; break; }
                    if (i < 50) {
                        hexNeighbors(pq, pr).forEach(([nq, nr]) => {
                            if (nq >= secMinQ && nq <= secMaxQ && nr >= secMinR && nr <= secMaxR) {
                                const k = `${nq},${nr}`;
                                if (!cProbed.has(k)) { cProbed.add(k); cProbe.push([nq, nr]); }
                            }
                        });
                    }
                }
                if (csQ !== null && csR !== null) candidateSeeds.push([csQ, csR]);
            }

            {
                const avgQ = Math.round(boundaryCoords.reduce((s, c) => s + c.q, 0) / boundaryCoords.length);
                const avgR = Math.round(boundaryCoords.reduce((s, c) => s + c.r, 0) / boundaryCoords.length);
                const probe: [number, number][] = [[avgQ, avgR]];
                const probed = new Set([`${avgQ},${avgR}`]);
                for (let i = 0; i < probe.length; i++) {
                    const [pq, pr] = probe[i];
                    if (!boundaryQR.has(`${pq},${pr}`)) candidateSeeds.push([pq, pr]);
                    if (i < 50) {
                        hexNeighbors(pq, pr).forEach(([nq, nr]) => {
                            const k = `${nq},${nr}`;
                            if (!probed.has(k)) { probed.add(k); probe.push([nq, nr]); }
                        });
                    }
                }
            }

            const eMinQ = hadColLo ? secMinQ - 1 : minQ - 1;
            const eMaxQ = hadColHi ? secMaxQ + 1 : maxQ + 1;
            const eMinR = hadRowLo ? secMinR - 1 : minR - 1;
            const eMaxR = hadRowHi ? secMaxR + 1 : maxR + 1;

            let filled = false;
            let successSeed: [number, number] | null = null;
            for (const [seedQ, seedR] of candidateSeeds) {
                const visited = new Set(boundaryQR);
                const interior: [number, number][] = [];
                let leaked = false;

                visited.add(`${seedQ},${seedR}`);
                const queue: [number, number][] = [[seedQ, seedR]];

                while (queue.length > 0 && !leaked) {
                    const next = queue.shift();
                    if (!next) break;
                    const [q, r] = next;
                    if (q <= eMinQ || q >= eMaxQ || r <= eMinR || r >= eMaxR) {
                        leaked = true;
                        break;
                    }
                    interior.push([q, r]);
                    hexNeighbors(q, r).forEach(([nq, nr]) => {
                        const k = `${nq},${nr}`;
                        if (!visited.has(k)) {
                            visited.add(k);
                            const existingId = hexBorderAssignments.get(qrToHexId(nq, nr));
                            if (existingId !== undefined && existingId !== def.id &&
                                (isWeak || !weakBorderIds.has(existingId))) return;
                            if (nq >= secMinQ && nq <= secMaxQ && nr >= secMinR && nr <= secMaxR) queue.push([nq, nr]);
                        }
                    });
                }

                if (!leaked) {
                    interior.forEach(([q, r]) => {
                        hexBorderAssignments.set(qrToHexId(q, r), def.id);
                    });
                    boundaryHexIds.forEach(hId => hexBorderAssignments.set(hId, def.id));
                    filled = true;
                    successSeed = [seedQ, seedR];
                    break;
                }
            }

            if (!filled) boundaryHexIds.forEach(hId => hexBorderAssignments.set(hId, def.id));

            let refInteriorSet: Set<string> | null = null;
            if (successSeed) {
                const [rsQ, rsR] = successSeed;
                const refVisited = new Set(boundaryQR);
                const refQueue: [number, number][] = [];
                if (!refVisited.has(`${rsQ},${rsR}`)) {
                    refVisited.add(`${rsQ},${rsR}`);
                    refQueue.push([rsQ, rsR]);
                }
                let refLeaked = false;
                while (refQueue.length > 0 && !refLeaked) {
                    const next = refQueue.shift();
                    if (!next) break;
                    const [q, r] = next;
                    if (q <= eMinQ || q >= eMaxQ || r <= eMinR || r >= eMaxR) { refLeaked = true; break; }
                    hexNeighbors(q, r).forEach(([nq, nr]) => {
                        const nk = `${nq},${nr}`;
                        if (!refVisited.has(nk)) {
                            refVisited.add(nk);
                            if (nq >= secMinQ && nq <= secMaxQ && nr >= secMinR && nr <= secMaxR) refQueue.push([nq, nr]);
                        }
                    });
                }
                if (!refLeaked) refInteriorSet = refVisited;
            }

            {
                const patchedSoFar = new Set(boundaryQR);
                for (let pq = eMinQ + 1; pq <= eMaxQ - 1; pq++) {
                    for (let pr = eMinR + 1; pr <= eMaxR - 1; pr++) {
                        if (patchedSoFar.has(`${pq},${pr}`)) continue;
                        const startId = hexBorderAssignments.get(qrToHexId(pq, pr));
                        if (startId !== undefined && startId !== def.id &&
                            (isWeak || !weakBorderIds.has(startId))) {
                            patchedSoFar.add(`${pq},${pr}`);
                            continue;
                        }
                        const pWall = new Set(boundaryQR);
                        const pQueue: [number, number][] = [[pq, pr]];
                        const pInterior: [number, number][] = [];
                        let pLeaked = false;
                        pWall.add(`${pq},${pr}`);
                        while (pQueue.length > 0 && !pLeaked) {
                            const next = pQueue.shift();
                            if (!next) break;
                            const [q2, r2] = next;
                            if (q2 <= eMinQ || q2 >= eMaxQ || r2 <= eMinR || r2 >= eMaxR) {
                                pLeaked = true;
                                break;
                            }
                            pInterior.push([q2, r2]);
                            hexNeighbors(q2, r2).forEach(([nq, nr]) => {
                                const nk = `${nq},${nr}`;
                                if (!pWall.has(nk)) {
                                    pWall.add(nk);
                                    const nId = hexBorderAssignments.get(qrToHexId(nq, nr));
                                    if (nId !== undefined && nId !== def.id &&
                                        (isWeak || !weakBorderIds.has(nId))) return;
                                    if (nq >= secMinQ && nq <= secMaxQ && nr >= secMinR && nr <= secMaxR) pQueue.push([nq, nr]);
                                }
                            });
                        }
                        if (!pLeaked) {
                            const inRefInterior = refInteriorSet
                                ? pInterior.every(([q2, r2]) => refInteriorSet.has(`${q2},${r2}`))
                                : !pInterior.some(([q2, r2]) => q2 === secMinQ || q2 === secMaxQ || r2 === secMinR || r2 === secMaxR);
                            if (inRefInterior) pInterior.forEach(([q2, r2]) => hexBorderAssignments.set(qrToHexId(q2, r2), def.id));
                        }
                        pWall.forEach(k => { if (!boundaryQR.has(k)) patchedSoFar.add(k); });
                    }
                }
            }
        });

        if (isWeak) weakBorderIds.add(def.id);
    });

    return borderDefinitions
        .filter(d => d.allegianceCodes && d.allegianceCodes.length)
        .map(d => ({
            id: d.id,
            name: d.name,
            color: d.color,
            allegianceCodes: d.allegianceCodes!.slice(),
            hexes: [...hexBorderAssignments].filter(([, id]) => id === d.id).map(([hexId]) => hexId).sort(),
        }));
}
