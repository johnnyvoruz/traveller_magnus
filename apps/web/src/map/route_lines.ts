import type { SectorIndex } from '@voyage/shared';
import { hexCentre, parseHex, toGlobal } from './geometry.ts';

export type RouteSegment = {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    colourKey: string;
    dash: 'solid' | 'dashed' | 'dotted';
};

const GAP = 20 / 75;
const SPREAD = 5 / 75;

type End = { x: number; y: number; key: string };

function offsetOf(record: Record<string, string>, axis: 'X' | 'Y', end: 'Start' | 'End'): number {
    const raw = record[end + 'Offset' + axis];
    if (raw === undefined || raw === '') return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
}

function endOf(index: SectorIndex, record: Record<string, string>, which: 'Start' | 'End'): End | null {
    const hhhh = record[which];
    const local = hhhh ? parseHex(hhhh) : null;
    if (!local) return null;
    const sx = index.x + offsetOf(record, 'X', which);
    const sy = index.y + offsetOf(record, 'Y', which);
    const global = toGlobal(sx, sy, local.col, local.row);
    const centre = hexCentre(global.q, global.r);
    return { x: centre.x, y: centre.y, key: sx + ',' + sy + ',' + hhhh };
}

function asRecord(record: unknown): Record<string, string> | null {
    if (!record || typeof record !== 'object') return null;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') out[key] = value;
    }
    return out;
}

/**
 * One sector's routes as shortened segments.
 * The legacy direction-bucket spread for routes that share only one end
 * is not carried into B1; only routes that share both ends are offset.
 */
export function routeSegments(index: SectorIndex): RouteSegment[] {
    const records = index.metadata && Array.isArray(index.metadata.routes) ? index.metadata.routes : [];
    const built: { start: End; end: End; colourKey: string; dash: RouteSegment['dash'] }[] = [];
    for (const raw of records) {
        const record = asRecord(raw);
        if (!record) continue;
        const start = endOf(index, record, 'Start');
        const end = endOf(index, record, 'End');
        if (!start || !end) continue;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (Math.hypot(dx, dy) <= GAP * 2) continue;
        let colourKey = 'xboat';
        if (record.Color) colourKey = 'own:' + record.Color;
        else if (record.Allegiance) colourKey = record.Allegiance;
        const style = (record.Style || '').toLowerCase();
        const dash = style === 'dashed' ? 'dashed' : style === 'dotted' ? 'dotted' : 'solid';
        built.push({ start, end, colourKey, dash });
    }
    const groups = new Map<string, number[]>();
    for (let i = 0; i < built.length; i++) {
        const key = built[i].start.key + '>' + built[i].end.key;
        const group = groups.get(key);
        if (group) group.push(i);
        else groups.set(key, [i]);
    }
    const segments: RouteSegment[] = [];
    for (const group of groups.values()) {
        const n = group.length;
        for (let place = 0; place < n; place++) {
            const item = built[group[place]];
            const dx = item.end.x - item.start.x;
            const dy = item.end.y - item.start.y;
            const dist = Math.hypot(dx, dy);
            const ux = dx / dist;
            const uy = dy / dist;
            const offset = (place - (n - 1) / 2) * SPREAD;
            const ox = -uy * offset;
            const oy = ux * offset;
            segments.push({
                x0: item.start.x + ux * GAP + ox,
                y0: item.start.y + uy * GAP + oy,
                x1: item.end.x - ux * GAP + ox,
                y1: item.end.y - uy * GAP + oy,
                colourKey: item.colourKey,
                dash: item.dash,
            });
        }
    }
    return segments;
}
