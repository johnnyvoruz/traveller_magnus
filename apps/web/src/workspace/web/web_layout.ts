/**
 * The relationship web (UX backlog U39; streams/D.md DU39): the open campaign's records as nodes and
 * its links as edges, filtered by record type and link kind, laid out by a force layout. Pure and
 * deterministic: the same records and links give the same picture every time (no random start; the
 * nodes begin on a circle in id order). A record with no shown link is not drawn.
 */
import type { CampaignLink, CampaignRecord } from '@voyage/shared';

export type WebNode = { id: string; name: string; type: string; degree: number; x: number; y: number };
export type WebEdge = { id: string; from: string; to: string; kind: string };
export type WebGraph = { nodes: WebNode[]; edges: WebEdge[] };

/** Null shows every type or kind; a set shows only those in it. */
export type WebFilter = { types: ReadonlySet<string> | null; kinds: ReadonlySet<string> | null };

/** How a link kind is drawn: how two records stand, in three tones and a plain line. */
export type EdgeTone = 'friend' | 'foe' | 'work' | 'plain';

export function edgeTone(kind: string): EdgeTone {
    if (kind === 'ally' || kind === 'contact') return 'friend';
    if (kind === 'rival' || kind === 'enemy') return 'foe';
    if (kind === 'patron' || kind === 'client' || kind === 'target') return 'work';
    return 'plain';
}

const live = <T extends { deleted: boolean }>(rows: Readonly<Record<string, T>>): T[] => Object.values(rows).filter((row) => !row.deleted);

/** The record types and link kinds the campaign's links use, for the filter's choices, in a stable order. */
export function webChoices(records: Readonly<Record<string, CampaignRecord>>, links: Readonly<Record<string, CampaignLink>>): { types: string[]; kinds: string[] } {
    const types = new Set<string>();
    const kinds = new Set<string>();
    for (const link of Object.values(links)) {
        if (link.deleted) continue;
        const from = records[link.from];
        const to = records[link.to];
        if (!from || !to || from.deleted || to.deleted) continue;
        types.add(from.type);
        types.add(to.type);
        kinds.add(link.kind);
    }
    return { types: [...types].sort(), kinds: [...kinds].sort() };
}

/** The nodes and edges the filter keeps, before layout (x and y are 0). */
export function webGraph(
    records: Readonly<Record<string, CampaignRecord>>,
    links: Readonly<Record<string, CampaignLink>>,
    filter: WebFilter,
): WebGraph {
    const kept = new Map<string, CampaignRecord>();
    for (const record of live(records)) {
        if (!filter.types || filter.types.has(record.type)) kept.set(record.id, record);
    }
    const edges: WebEdge[] = [];
    const seen = new Set<string>();
    for (const link of Object.values(links).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
        if (link.deleted || link.from === link.to) continue;
        if (filter.kinds && !filter.kinds.has(link.kind)) continue;
        if (!kept.has(link.from) || !kept.has(link.to)) continue;
        // Two records joined twice in one kind are one edge.
        const pair = link.kind + ' ' + (link.from < link.to ? link.from + ' ' + link.to : link.to + ' ' + link.from);
        if (seen.has(pair)) continue;
        seen.add(pair);
        edges.push({ id: link.id, from: link.from, to: link.to, kind: link.kind });
    }
    const degree = new Map<string, number>();
    for (const edge of edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    const nodes: WebNode[] = [...degree.keys()].sort().map((id) => {
        const record = kept.get(id) as CampaignRecord;
        return { id, name: record.name, type: record.type, degree: degree.get(id) ?? 0, x: 0, y: 0 };
    });
    return { nodes, edges };
}

/**
 * Fruchterman and Reingold's layout of one connected group in the unit square: nodes repel, edges
 * pull, the step cools to nothing. They start on a circle in order, so it is the same every time.
 */
function forceLayout(n: number, ends: readonly (readonly [number, number])[], iterations: number): { xs: Float64Array; ys: Float64Array } {
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n;
        xs[i] = 0.5 + 0.4 * Math.cos(angle);
        ys[i] = 0.5 + 0.4 * Math.sin(angle);
    }
    if (n < 2) return { xs, ys };
    const k = Math.sqrt(1 / n);
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    for (let step = 0; step < iterations; step++) {
        const heat = 0.1 * (1 - step / iterations);
        dx.fill(0);
        dy.fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                let ex = xs[i] - xs[j];
                let ey = ys[i] - ys[j];
                let d = Math.hypot(ex, ey);
                if (d < 1e-6) {
                    // Two at one place: part them along a direction fixed by their order.
                    ex = Math.cos(i + j);
                    ey = Math.sin(i + j);
                    d = 1e-3;
                }
                const push = (k * k) / d;
                dx[i] += (ex / d) * push;
                dy[i] += (ey / d) * push;
                dx[j] -= (ex / d) * push;
                dy[j] -= (ey / d) * push;
            }
        }
        for (const [a, b] of ends) {
            const ex = xs[a] - xs[b];
            const ey = ys[a] - ys[b];
            const d = Math.max(1e-6, Math.hypot(ex, ey));
            const pull = (d * d) / k;
            dx[a] -= (ex / d) * pull;
            dy[a] -= (ey / d) * pull;
            dx[b] += (ex / d) * pull;
            dy[b] += (ey / d) * pull;
        }
        for (let i = 0; i < n; i++) {
            const d = Math.hypot(dx[i], dy[i]);
            if (d > 0) {
                const move = Math.min(d, heat);
                xs[i] += (dx[i] / d) * move;
                ys[i] += (dy[i] / d) * move;
            }
        }
    }
    // Fitted to the unit square, keeping its shape.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]);
        y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]);
    }
    const size = Math.max(x1 - x0, y1 - y0, 1e-6);
    const ox = (1 - (x1 - x0) / size) / 2;
    const oy = (1 - (y1 - y0) / size) / 2;
    for (let i = 0; i < n; i++) {
        xs[i] = ox + (xs[i] - x0) / size;
        ys[i] = oy + (ys[i] - y0) / size;
    }
    return { xs, ys };
}

/** The connected groups of the graph, as node indexes: the largest first, then by their first id. */
export function webGroups(graph: WebGraph): number[][] {
    const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
    const parent = graph.nodes.map((_, i) => i);
    const root = (i: number): number => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    for (const edge of graph.edges) {
        const a = root(index.get(edge.from) as number);
        const b = root(index.get(edge.to) as number);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
    const groups = new Map<number, number[]>();
    graph.nodes.forEach((_, i) => {
        const r = root(i);
        const list = groups.get(r);
        if (list) list.push(i);
        else groups.set(r, [i]);
    });
    return [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/**
 * The whole web in the unit square: each connected group laid out on its own, in a square cell whose
 * side grows with the root of its size, the cells packed in rows to suit the box's shape (`aspect`,
 * width over height). Groups never sit on each other; joined records sit nearer than strangers.
 */
export function layoutWeb(graph: WebGraph, aspect = 1, iterations = 300): WebGraph {
    if (!graph.nodes.length) return graph;
    const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
    const groups = webGroups(graph);
    const sides = groups.map((group) => Math.sqrt(group.length));
    const area = sides.reduce((sum, side) => sum + side * side, 0);
    const rowWidth = Math.max(Math.max(...sides), Math.sqrt(area * Math.max(0.2, aspect)));
    const xs = new Float64Array(graph.nodes.length);
    const ys = new Float64Array(graph.nodes.length);
    let cx = 0;
    let cy = 0;
    let rowHeight = 0;
    let width = 0;
    groups.forEach((group, g) => {
        const side = sides[g];
        if (cx > 0 && cx + side > rowWidth + 1e-9) {
            cx = 0;
            cy += rowHeight;
            rowHeight = 0;
        }
        const local = new Map(group.map((node, i) => [node, i]));
        const ends: [number, number][] = [];
        for (const edge of graph.edges) {
            const a = local.get(index.get(edge.from) as number);
            const b = local.get(index.get(edge.to) as number);
            if (a !== undefined && b !== undefined) ends.push([a, b]);
        }
        const placed = forceLayout(group.length, ends, iterations);
        // A margin inside the cell keeps one group's names off the next group.
        const margin = side * 0.18;
        group.forEach((node, i) => {
            xs[node] = cx + margin + (group.length === 1 ? 0.5 : placed.xs[i]) * (side - 2 * margin);
            ys[node] = cy + margin + (group.length === 1 ? 0.5 : placed.ys[i]) * (side - 2 * margin);
        });
        cx += side;
        width = Math.max(width, cx);
        rowHeight = Math.max(rowHeight, side);
    });
    const height = cy + rowHeight;
    const nodes = graph.nodes.map((node, i) => ({ ...node, x: xs[i] / width, y: ys[i] / height }));
    return { nodes, edges: graph.edges };
}

/** One node's label on screen: its point, and the box its dot and name take to the right of it. */
export type LabelBox = { x: number; y: number; w: number; h: number };

/**
 * Names that cover each other are pushed apart, mostly up and down, until none overlap or the passes
 * run out; every point stays inside the box `width` by `height` less `pad`. Pure.
 */
export function declutter(boxes: readonly LabelBox[], width: number, height: number, pad = 12, passes = 80): LabelBox[] {
    const out = boxes.map((box) => ({ ...box }));
    const clamp = (box: LabelBox): void => {
        box.x = Math.min(Math.max(box.x, pad + box.h / 2), Math.max(pad + box.h / 2, width - pad - box.w + box.h / 2));
        box.y = Math.min(Math.max(box.y, pad + box.h / 2), Math.max(pad + box.h / 2, height - pad - box.h / 2));
    };
    out.forEach(clamp);
    for (let pass = 0; pass < passes; pass++) {
        let moved = false;
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
                const a = out[i];
                const b = out[j];
                // The box starts half a dot left of the point and is centred on it vertically.
                const ax0 = a.x - a.h / 2;
                const bx0 = b.x - b.h / 2;
                const overX = Math.min(ax0 + a.w, bx0 + b.w) - Math.max(ax0, bx0);
                const overY = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
                if (overX <= 0 || overY <= 0) continue;
                moved = true;
                if (overY <= overX) {
                    const shift = (overY + 2) / 2;
                    const up = a.y < b.y || (a.y === b.y && i < j) ? -1 : 1;
                    a.y += up * shift;
                    b.y -= up * shift;
                } else {
                    const shift = (overX + 2) / 2;
                    const left = a.x < b.x || (a.x === b.x && i < j) ? -1 : 1;
                    a.x += left * shift;
                    b.x -= left * shift;
                }
                clamp(a);
                clamp(b);
            }
        }
        if (!moved) break;
    }
    return out;
}
