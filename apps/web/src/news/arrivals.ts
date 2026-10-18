/**
 * Arrival times on the X-boat graph (spec_xboat_ripples.md §1.2 and §5 A2).
 * Three Dijkstra runs: earliest, likely, latest. Days come from the arc kind
 * and the cited jump, plus the hold and the wait supplied for this run.
 * `to` walks the arcs backwards. A step past the horizon is left unreached.
 */
import { fromGlobal } from '../map/geometry.ts';
import { jumpSpan, NEWS_PARAMS, type NewsParams } from './params.ts';
import { sectorsWanted, type NewsGraph } from './graph.ts';

export type ArrivalMode = 'from' | 'to';

export type ArrivalDays = {
    earliest: number | null;
    likely: number | null;
    latest: number | null;
};

export type NewsArrivals = {
    source: string;
    mode: ArrivalMode;
    horizonDays: number | null;
    arrivals: Map<string, ArrivalDays>;
    /** Sectors named by nodes settled on the likely run. */
    wanted: { sx: number; sy: number }[];
};

export type ArrivalOptions = {
    mode?: ArrivalMode;
    /** Undefined uses params.horizonDays. Null runs with no horizon. */
    horizonDays?: number | null;
    stationHoldHours?: number;
    /** Null prices an off-network arc that is already in the graph at 0 hours of wait. */
    offNetworkWaitHours?: number | null;
};

const XBOAT = 0;

type Span = 'earliest' | 'likely' | 'latest';

type Csr = {
    offsets: Uint32Array;
    targets: Uint32Array;
    kinds: Uint8Array;
};

function reverseCsr(graph: NewsGraph): Csr {
    const n = graph.nodes.length;
    const counts = new Uint32Array(n);
    for (let k = 0; k < graph.targets.length; k++) counts[graph.targets[k]] += 1;
    const offsets = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + counts[i];
    const cursor = offsets.slice(0, n);
    const targets = new Uint32Array(graph.targets.length);
    const kinds = new Uint8Array(graph.targets.length);
    for (let i = 0; i < n; i++) {
        for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
            const j = graph.targets[k];
            const at = cursor[j];
            cursor[j] = at + 1;
            targets[at] = i;
            kinds[at] = graph.kinds[k];
        }
    }
    return { offsets, targets, kinds };
}

function legCost(params: NewsParams, span: Span, hold: number, wait: number | null): (kind: number) => number {
    const boat = (jumpSpan(params.xboatLegHours)[span] + hold) / 24;
    const ship = ((wait ?? 0) + jumpSpan(params.jumpHours)[span]) / 24;
    return (kind) => (kind === XBOAT ? boat : ship);
}

/** Binary heap, lowest day first. Stale entries are skipped by the caller. */
function push(heap: { at: number; day: number }[], item: { at: number; day: number }): void {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].day <= heap[i].day) break;
        const swap = heap[parent];
        heap[parent] = heap[i];
        heap[i] = swap;
        i = parent;
    }
}

function pop(heap: { at: number; day: number }[]): { at: number; day: number } {
    const top = heap[0];
    const last = heap.pop();
    if (last === undefined || heap.length === 0) return top;
    heap[0] = last;
    let i = 0;
    for (;;) {
        const left = i * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        let best = left;
        if (right < heap.length && heap[right].day < heap[left].day) best = right;
        if (heap[i].day <= heap[best].day) break;
        const swap = heap[best];
        heap[best] = heap[i];
        heap[i] = swap;
        i = best;
    }
    return top;
}

function dijkstra(csr: Csr, origin: number, cost: (kind: number) => number, horizon: number | null): (number | null)[] {
    const n = csr.offsets.length - 1;
    const dist = new Float64Array(n);
    dist.fill(Number.POSITIVE_INFINITY);
    const out: (number | null)[] = new Array(n).fill(null);
    if (origin < 0 || origin >= n) return out;
    dist[origin] = 0;
    const heap: { at: number; day: number }[] = [];
    push(heap, { at: origin, day: 0 });
    while (heap.length > 0) {
        const cur = pop(heap);
        if (cur.day !== dist[cur.at]) continue;
        const from = csr.offsets[cur.at];
        const to = csr.offsets[cur.at + 1];
        for (let k = from; k < to; k++) {
            const next = csr.targets[k];
            const day = cur.day + cost(csr.kinds[k]);
            if (horizon !== null && day > horizon) continue;
            if (day >= dist[next]) continue;
            dist[next] = day;
            push(heap, { at: next, day });
        }
    }
    for (let i = 0; i < n; i++) {
        if (dist[i] !== Number.POSITIVE_INFINITY) out[i] = dist[i];
    }
    return out;
}

function loadedSectors(graph: NewsGraph): { sx: number; sy: number }[] {
    const seen = new Map<string, { sx: number; sy: number }>();
    for (const node of graph.nodes) {
        if (!node.loaded) continue;
        const here = fromGlobal(node.q, node.r);
        const key = here.sx + ',' + here.sy;
        if (!seen.has(key)) seen.set(key, { sx: here.sx, sy: here.sy });
    }
    return [...seen.values()];
}

export function newsArrivals(
    graph: NewsGraph,
    params: NewsParams = NEWS_PARAMS,
    sourceKey: string,
    options: ArrivalOptions = {},
): NewsArrivals {
    const mode: ArrivalMode = options.mode ?? 'from';
    const horizon = options.horizonDays === undefined ? params.horizonDays : options.horizonDays;
    const hold = options.stationHoldHours ?? params.stationHoldHours;
    const wait = options.offNetworkWaitHours === undefined ? params.offNetworkWaitHours : options.offNetworkWaitHours;
    const n = graph.nodes.length;
    const origin = graph.nodes.findIndex((node) => node.key === sourceKey);
    const csr = mode === 'to' ? reverseCsr(graph) : graph;
    const spans: Span[] = ['earliest', 'likely', 'latest'];
    const days: Record<Span, (number | null)[]> = {
        earliest: dijkstra(csr, origin, legCost(params, 'earliest', hold, wait), horizon),
        likely: dijkstra(csr, origin, legCost(params, 'likely', hold, wait), horizon),
        latest: dijkstra(csr, origin, legCost(params, 'latest', hold, wait), horizon),
    };
    const arrivals = new Map<string, ArrivalDays>();
    const settled: { q: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
        const row: ArrivalDays = { earliest: null, likely: null, latest: null };
        for (const span of spans) row[span] = days[span][i];
        arrivals.set(graph.nodes[i].key, row);
        if (row.likely !== null) settled.push(graph.nodes[i]);
    }
    return {
        source: sourceKey,
        mode,
        horizonDays: horizon,
        arrivals,
        wanted: origin < 0 ? [] : sectorsWanted(settled, loadedSectors(graph), params),
    };
}
