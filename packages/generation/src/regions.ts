// Port of js/borders.js importRegionsFromXml (1171-1513). One sector, slot 1.
// The bgFillColor filter rule the legacy header says this import upserts is UI
// state and is not ported. Persistence and the region-manager refresh after
// the loop are not ported either.
// Returned regions are the ones that own at least one hex, ordered by name
// with localeCompare. This is the used-names ordering of js/regions.js:58-63.
// The default region slots are UI state and are not ported.

export type RegionRecord = Record<string, string>;
export type Region = { name: string; color: string; hexes: string[] };

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

type RegionDef = { id: number; name: string; color: string; visible: boolean };

const secMinQ = 0, secMaxQ = 31, secMinR = 0, secMaxR = 39;

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

function qrToHex(q: number, r: number): string {
    const lQ = q % 32;
    const lR = r % 40;
    return `${String(lQ + 1).padStart(2, '0')}${String(lR + 1).padStart(2, '0')}`;
}

export function sectorRegions(input: { regions: RegionRecord[] }): Region[] {
    if (!input.regions.length) return [];

    const regionDefinitions: RegionDef[] = [];
    const regionPaths = new Map<string, { rawPath: string; color: string; labelPos: string }>();
    const cluster = new Map<string, string>();

    function upsert(label: string, hexColor: string): void {
        let def = regionDefinitions.find(d => d.name === label);
        if (def) {
            def.color = hexColor;
            return;
        }
        const hexCounts = new Map<string, number>();
        cluster.forEach(name => {
            if (name && name !== '----') hexCounts.set(name, (hexCounts.get(name) || 0) + 1);
        });
        def = regionDefinitions.find(d => /^Region \d+$/.test(d.name) && !hexCounts.has(d.name));
        if (def) {
            def.name = label;
            def.color = hexColor;
            return;
        }
        const nextId = regionDefinitions.length > 0
            ? Math.max(...regionDefinitions.map(d => d.id)) + 1 : 1;
        const CYCLE = ['#888888'];
        regionDefinitions.push({
            id: nextId,
            name: label,
            color: hexColor || CYCLE[(nextId - 1) % CYCLE.length],
            visible: true,
        });
    }

    for (const rec of input.regions) {
        const label = (rec.Label || '').trim();
        const colorStr = (rec.Color || '').trim().toLowerCase();
        const labelPos = (rec.LabelPosition || '').trim();
        if (!label) continue;

        const hexColor = colorStr.startsWith('#') ? colorStr : (BORDER_COLOR_MAP[colorStr] || '#888888');

        const seen = new Set<string>();
        const boundaryHexIds: string[] = [];
        const boundaryCoords: { q: number; r: number }[] = [];
        const boundaryIsAfterGap: boolean[] = [];
        let hadColLo = false, hadColHi = false;
        let hadRowLo = false, hadRowHi = false;
        let hadGapBefore = false;

        const raw = (rec.path || '').trim();
        if (!raw) continue;

        regionPaths.set(`1:${label}`, { rawPath: raw, color: hexColor, labelPos });

        raw.split(/\s+/).forEach(code => {
            if (code.length !== 4 || seen.has(code)) return;
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
            seen.add(code);
            boundaryHexIds.push(code);
            boundaryCoords.push({ q: codeLQ - 1, r: codeLR - 1 });
            boundaryIsAfterGap.push(hadGapBefore);
            hadGapBefore = false;
        });

        if (boundaryCoords.length === 0) {
            if (!hadColLo && !hadColHi && !hadRowLo && !hadRowHi) continue;
            let wsQ = secMinQ + 15, wsR = secMinR + 19;
            if (labelPos.length === 4) {
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
            while (wsQueue.length > 0) {
                const next = wsQueue.shift();
                if (!next) break;
                const [q, r] = next;
                cluster.set(qrToHex(q, r), label);
                hexNeighbors(q, r).forEach(([nq, nr]) => {
                    const k = `${nq},${nr}`;
                    if (!wsVisited.has(k)) {
                        wsVisited.add(k);
                        if (nq >= secMinQ && nq <= secMaxQ && nr >= secMinR && nr <= secMaxR) {
                            wsQueue.push([nq, nr]);
                        }
                    }
                });
            }
            upsert(label, hexColor);
            continue;
        }

        const boundaryQR = new Set(boundaryCoords.map(({ q, r }) => `${q},${r}`));
        {
            const closeLoop = !(hadColLo || hadColHi || hadRowLo || hadRowHi);
            const n = boundaryCoords.length;
            const segments = closeLoop ? n : n - 1;
            for (let i = 0; i < segments; i++) {
                const nextIdx = (i + 1) % n;
                if (boundaryIsAfterGap[nextIdx]) continue;
                const { q: q1, r: r1 } = boundaryCoords[i];
                const { q: q2, r: r2 } = boundaryCoords[nextIdx];
                const s1 = -q1 - r1;
                const s2 = -q2 - r2;
                const dist = Math.max(Math.abs(q2 - q1), Math.abs(r2 - r1), Math.abs(s2 - s1));
                for (let step = 1; step < dist; step++) {
                    const t = step / dist;
                    const lq = q1 + (q2 - q1) * t;
                    const lr = r1 + (r2 - r1) * t;
                    const ls = s1 + (s2 - s1) * t;
                    let rq = Math.round(lq), rr = Math.round(lr), rs = Math.round(ls);
                    const dq = Math.abs(rq - lq), dr = Math.abs(rr - lr), ds = Math.abs(rs - ls);
                    if (dq > dr && dq > ds) rq = -rr - rs;
                    else if (dr > ds) rr = -rq - rs;
                    if (rq < secMinQ || rq > secMaxQ || rr < secMinR || rr > secMaxR) continue;
                    const k = `${rq},${rr}`;
                    if (boundaryQR.has(k)) continue;
                    boundaryQR.add(k);
                    boundaryHexIds.push(qrToHex(rq, rr));
                }
            }
        }

        let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
        boundaryCoords.forEach(({ q, r }) => {
            if (q < minQ) minQ = q;
            if (q > maxQ) maxQ = q;
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
        });

        const candidateSeeds: [number, number][] = [];

        if (labelPos.length === 4) {
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
            let csQ: number | null = null, csR: number | null = null;
            for (let i = 0; i < probe.length; i++) {
                const [pq, pr] = probe[i];
                if (!boundaryQR.has(`${pq},${pr}`)) { csQ = pq; csR = pr; break; }
                if (i < 50) {
                    hexNeighbors(pq, pr).forEach(([nq, nr]) => {
                        const k = `${nq},${nr}`;
                        if (!probed.has(k)) { probed.add(k); probe.push([nq, nr]); }
                    });
                }
            }
            if (csQ !== null && csR !== null) candidateSeeds.push([csQ, csR]);
        }

        const eMinQ = hadColLo ? secMinQ - 1 : minQ - 1;
        const eMaxQ = hadColHi ? secMaxQ + 1 : maxQ + 1;
        const eMinR = hadRowLo ? secMinR - 1 : minR - 1;
        const eMaxR = hadRowHi ? secMaxR + 1 : maxR + 1;

        let filled = false;

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
                        if (nq >= secMinQ && nq <= secMaxQ && nr >= secMinR && nr <= secMaxR) {
                            queue.push([nq, nr]);
                        }
                    }
                });
            }

            if (!leaked) {
                interior.forEach(([q, r]) => {
                    cluster.set(qrToHex(q, r), label);
                });
                boundaryHexIds.forEach(hId => {
                    if (cluster.get(hId) !== label) cluster.set(hId, label);
                });
                filled = true;
                break;
            }
        }

        if (!filled) {
            boundaryHexIds.forEach(hId => {
                cluster.set(hId, label);
            });
        }

        upsert(label, hexColor);
    }

    return regionDefinitions.map(d => ({
        name: d.name,
        color: d.color,
        hexes: [...cluster].filter(([, name]) => name === d.name).map(([hex]) => hex).sort(),
    })).filter(region => region.hexes.length > 0).sort((a, b) => a.name.localeCompare(b.name));
}
