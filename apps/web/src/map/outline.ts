import { HEX_SIZE, hexCentre, hexCorners } from './geometry.ts';

export type Loop = { points: number[]; minX: number; minY: number; maxX: number; maxY: number };

const INSET = HEX_SIZE * 0.1;

/** Odd-q flat-top neighbours, [side][q & 1] = [dq, dr]. js/renderer.js:2309-2316. */
const NEIGHBOR = [
    [[1, 0], [1, 1]],
    [[0, 1], [0, 1]],
    [[-1, 0], [-1, 1]],
    [[-1, -1], [-1, 0]],
    [[0, -1], [0, -1]],
    [[1, -1], [1, 0]],
];

/**
 * Legacy vertex keys are Math.round of pixel coordinates at baseHexSize 50
 * (js/renderer.js:2366). A parsec is 1.5 * 50 of those pixels. Rounding the
 * parsec value itself merges corners, because a hex edge is only 2/3 long.
 */
const KEY_SCALE = 1.5 * 50;

function vertexKey(x: number, y: number): string {
    return `${Math.round(x * KEY_SCALE)},${Math.round(y * KEY_SCALE)}`;
}

/** Closed inset outlines of a set of global hexes. js/renderer.js:2297-2414, in parsecs. */
export function outlineLoops(hexes: { q: number; r: number }[]): Loop[] {
    const seen = new Set<string>();
    const unique: { q: number; r: number }[] = [];
    for (const hex of hexes) {
        const key = `${hex.q},${hex.r}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(hex);
    }
    unique.sort((a, b) => a.q - b.q || a.r - b.r);

    const edges: { x1: number; y1: number; x2: number; y2: number; nx: number; ny: number }[] = [];
    for (const hex of unique) {
        const centre = hexCentre(hex.q, hex.r);
        const corners = hexCorners(centre.x, centre.y);
        const parity = hex.q & 1;
        for (let side = 0; side < 6; side++) {
            const step = NEIGHBOR[side][parity];
            if (seen.has(`${hex.q + step[0]},${hex.r + step[1]}`)) continue;
            const x1 = corners[side * 2];
            const y1 = corners[side * 2 + 1];
            const next = ((side + 1) % 6) * 2;
            const x2 = corners[next];
            const y2 = corners[next + 1];
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const dx = centre.x - mx;
            const dy = centre.y - my;
            const len = Math.sqrt(dx * dx + dy * dy);
            edges.push({ x1, y1, x2, y2, nx: dx / len, ny: dy / len });
        }
    }
    if (edges.length === 0) return [];

    const byStart = new Map<string, number>();
    edges.forEach((edge, index) => byStart.set(vertexKey(edge.x1, edge.y1), index));

    const visited = new Set<number>();
    const loops: Loop[] = [];
    edges.forEach((_edge, startIdx) => {
        if (visited.has(startIdx)) return;
        const chain: { x: number; y: number; nx: number; ny: number }[] = [];
        let idx: number | undefined = startIdx;
        while (idx !== undefined && !visited.has(idx)) {
            visited.add(idx);
            const edge = edges[idx];
            chain.push({ x: edge.x1, y: edge.y1, nx: edge.nx, ny: edge.ny });
            idx = byStart.get(vertexKey(edge.x2, edge.y2));
        }
        if (chain.length < 2) return;

        const points: number[] = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = chain.length;
        for (let i = 0; i < count; i++) {
            const vertex = chain[i];
            const inward = chain[(i + count - 1) % count];
            const dot = inward.nx * vertex.nx + inward.ny * vertex.ny;
            const denom = 1 + dot;
            let x: number;
            let y: number;
            if (Math.abs(denom) < 1e-6) {
                x = vertex.x + INSET * vertex.nx;
                y = vertex.y + INSET * vertex.ny;
            } else {
                x = vertex.x + INSET * (inward.nx + vertex.nx) / denom;
                y = vertex.y + INSET * (inward.ny + vertex.ny) / denom;
            }
            points.push(x, y);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        loops.push({ points, minX, minY, maxX, maxY });
    });
    return loops;
}
