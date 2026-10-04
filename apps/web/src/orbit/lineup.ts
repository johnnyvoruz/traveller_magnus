/**
 * The Row and Column line-ups: the star first, then every body in orbit order at even
 * spacing, each with its moons round it and a caption. Ported from js/system_viewer.js
 * (_lineupNodes 2359-2401, _lineupMetrics 2405-2433, _lineupScreen 2435-2440,
 * _lineupCaption 2442-2451, _lineupReach 2453-2463, _drawLineupBelt 2481-2536,
 * _drawLineupLabel 2538-2572, _drawLineup 2574-2669). State those functions closed over
 * (the layout, the canvas size, the camera, the layer switches) arrives as arguments. Pure.
 */
import { seedOf } from './backdrop.ts';
import { shortLabel } from './bodies.ts';
import {
    HZ_INNER, HZ_OUTER, isMainworldBelt, moonOrbitRadius, placeWorld, ringOrbitRadius,
    starHzAU, type Hit, type Plan, type PlanStar, type PlanWorld, type View,
} from './layout.ts';
import {
    emptyLayer, PATH_ALPHA_LINEUP, type Caption, type Dot, type Layers, type Mode, type Picture,
} from './picture.ts';

export type LineupNode = {
    kind: 'star' | 'world' | 'belt';
    key: string;
    star: PlanStar | null;
    world: PlanWorld | null;
    /** The AU the body is sorted by, and the AU and star its habitable zone is judged on. */
    sortAu: number;
    order: number;
    hzAu: number | null;
    hzStar: number;
};

/** js/system_viewer.js:2359-2401: the primary first, then everything else by distance. */
export function lineupNodes(plan: Plan): LineupNode[] {
    const nodes: LineupNode[] = [];
    const first = plan.stars[0];
    if (first) nodes.push({ kind: 'star', key: first.key, star: first, world: null, sortAu: -1, order: -1, hzAu: null, hzStar: 0 });
    const items: LineupNode[] = [];
    let order = 0;
    for (const w of plan.sets[0] || []) {
        items.push({ kind: w.belt ? 'belt' : 'world', key: w.key, star: null, world: w, sortAu: w.au, order: order++, hzAu: w.au, hzStar: 0 });
    }
    for (let i = 1; i < plan.stars.length; i++) {
        const s = plan.stars[i] as PlanStar;
        const parent = plan.stars[s.parent];
        // 2378-2382: a companion of a companion sorts just after its parent.
        const parentAu = s.parent > 0 ? (parent ? parent.au : s.au) : 0;
        const au = s.parent > 0 ? parentAu + 0.0001 + s.au * 0.00001 : s.au;
        items.push({ kind: 'star', key: s.key, star: s, world: null, sortAu: au, order: order++, hzAu: s.parent > 0 ? parentAu : au, hzStar: 0 });
        for (const w of plan.sets[i] || []) {
            items.push({
                kind: w.belt ? 'belt' : 'world', key: w.key, star: null, world: w,
                sortAu: au + 0.000001 * (1 + w.au), order: order++, hzAu: w.au, hzStar: i,
            });
        }
    }
    items.sort((a, b) => a.sortAu - b.sortAu || a.order - b.order);
    return nodes.concat(items);
}

export type LineupMetrics = {
    horizontal: boolean;
    pad: number;
    slot: number;
    crossPos: number;
    labelGutter: number;
    /** The disc scale: a gas giant with its moons fits its slot and leaves room for the caption. */
    disc: number;
};

/** js/system_viewer.js:2405-2433. */
export function lineupMetrics(nodes: LineupNode[], horizontal: boolean, w: number, h: number, moonsShown: boolean): LineupMetrics {
    const along = Math.max(1, horizontal ? w : h);
    const cross = Math.max(1, horizontal ? h : w);
    const pad = 44;
    const slot = Math.max(8, (along - pad * 2) / Math.max(1, nodes.length));
    const labelGutter = horizontal ? 52 : Math.min(210, Math.max(108, cross * 0.36));
    const crossPos = Math.max(24, (cross - labelGutter) / 2);
    let moonGap = 0;
    if (moonsShown) {
        for (const node of nodes) {
            if (!node.world) continue;
            const idx = Math.max(node.world.moons.length, node.world.rings) - 1;
            if (idx >= 0) moonGap = Math.max(moonGap, 10 + idx * 6);
        }
    }
    const room = Math.max(12, crossPos - 12);
    const byRoom = room / (14 + moonGap);
    const bySlot = (slot * 0.42) / (14 + moonGap);
    let starBase = 28;
    for (const node of nodes) if (node.star) starBase = Math.max(starBase, node.star.basePx);
    const byStar = (slot * 0.32) / starBase;
    return { horizontal, pad, slot, crossPos, labelGutter, disc: Math.max(0.45, Math.min(byRoom, bySlot, byStar, 2.4)) };
}

/** js/system_viewer.js:168-174: bodies grow with the zoom past the fitted line-up, which is zoom 1. */
export function lineupZoomScale(disc: number, zoom: number): number {
    return disc * Math.max(1, zoom);
}

/** js/system_viewer.js:2584-2586: where a node sits before the camera, in canvas pixels. */
export function lineupSlot(metrics: LineupMetrics, index: number): { lx: number; ly: number } {
    const alongPos = metrics.pad + metrics.slot * (index + 0.5);
    return metrics.horizontal ? { lx: alongPos, ly: metrics.crossPos } : { lx: metrics.crossPos, ly: alongPos };
}

/** js/system_viewer.js:2435-2440. */
export function lineupScreen(lx: number, ly: number, view: View): { x: number; y: number } {
    return {
        x: view.w / 2 + view.offX + (lx - view.w / 2) * view.zoom,
        y: view.h / 2 + view.offY + (ly - view.h / 2) * view.zoom,
    };
}

/** js/system_viewer.js:2442-2451. */
export function lineupCaption(node: LineupNode): string {
    if (node.star) {
        const body = node.star.body;
        const spec = body.name || [body.sType, body.sClass].filter(Boolean).join(' ') || 'Star';
        return body.separation ? spec + ' (' + body.separation + ')' : String(spec);
    }
    const body = node.world ? node.world.body : {};
    if (body.name) return String(body.name);
    if (node.kind === 'belt') return 'Planetoid belt';
    return String(body.type || 'World');
}

/** js/system_viewer.js:2453-2463: how far a node reaches from its centre. */
export function lineupReach(node: LineupNode, z: number, zoom: number, moonsShown: boolean): number {
    if (node.star) return node.star.basePx * z;
    if (node.kind === 'belt' || !node.world) return Math.max(16, 14 * zoom);
    const w = node.world;
    const r = w.basePx * z;
    if (!moonsShown) return r;
    let reach = r;
    // 2459: every non-Empty moon by its place, the ring moons included.
    for (const m of w.moons) reach = Math.max(reach, moonOrbitRadius(r, m.index, w.ringed, z));
    for (let ri = 0; ri < w.rings; ri++) reach = Math.max(reach, ringOrbitRadius(r, ri, w.rings));
    return reach;
}

/** js/system_viewer.js:2475-2479. */
export function inHabitableZone(plan: Plan, au: number | null, starIndex: number): boolean {
    const hz = starHzAU(plan.sys, starIndex);
    if (hz == null || au == null || !Number.isFinite(au)) return false;
    return au >= hz * HZ_INNER && au <= hz * HZ_OUTER;
}

/** A belt's 72 rocks as unit offsets, seeded by the hex and the belt, worked out once (2490-2512). */
type RockSeed = { along: number; cross: number; big: boolean; alpha: number };
const rockCache = new WeakMap<PlanWorld, RockSeed[]>();

export function beltRocks(hexKey: string, world: PlanWorld): RockSeed[] {
    const kept = rockCache.get(world);
    if (kept) return kept;
    let h = seedOf(hexKey + ':' + (world.body.name || '') + ':' + (world.body.au || 0));
    const rand = (): number => {
        h ^= h >>> 16;
        h = Math.imul(h, 0x7feb352d) >>> 0;
        h ^= h >>> 15;
        h = Math.imul(h, 0x846ca68b) >>> 0;
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
    const rocks: RockSeed[] = [];
    for (let i = 0; i < 72; i++) {
        const along = rand() * 2 - 1;
        const cross = rand() * 2 - 1;
        const big = rand() < 0.16;
        rocks.push({ along, cross, big, alpha: 0.35 + rand() * 0.55 });
    }
    rockCache.set(world, rocks);
    return rocks;
}

/** js/system_viewer.js:2574-2669, everything but the painting: the line-up as a picture. */
export function layoutLineup(plan: Plan, view: View, mode: Mode, days: number, layers: Layers): Picture {
    const horizontal = mode === 'row';
    const nodes = lineupNodes(plan);
    const metrics = lineupMetrics(nodes, horizontal, view.w, view.h, layers.moons);
    const zoom = view.zoom;
    const z = lineupZoomScale(metrics.disc, zoom);
    const slots = nodes.map((_node, i) => lineupSlot(metrics, i));
    const at = slots.map((slot) => lineupScreen(slot.lx, slot.ly, view));
    let maxReach = 0;
    for (const node of nodes) maxReach = Math.max(maxReach, lineupReach(node, z, zoom, layers.moons));

    const layer = emptyLayer();
    const picture: Picture = { mode, orbital: false, z, layers: [layer], stars: [], captions: [], hits: [], centre: null };
    const hits: Hit[] = picture.hits;
    const starAt = at[0] || { x: view.w / 2, y: view.h / 2 };

    // 2613-2632: a panel behind each body that sits in its star's habitable zone.
    if (layers.habitable) {
        nodes.forEach((node, i) => {
            if (!inHabitableZone(plan, node.hzAu, node.hzStar)) return;
            const c = at[i] as { x: number; y: number };
            const along = metrics.slot * 0.9 * zoom;
            const across = Math.min((horizontal ? view.h : view.w) * 0.7, maxReach * 2 + 28 * zoom);
            // Legacy draws the panel upright in both line-ups, so in Column it covers its
            // neighbours' slots; here it lies along its own slot.
            const pw = horizontal ? along : across;
            const ph = horizontal ? across : along;
            layer.panels.push({ key: 'hzp:' + node.key, x: c.x - pw / 2, y: c.y - ph / 2, w: pw, h: ph, radius: Math.min(16, 8 * zoom), alpha: 1 });
        });
    }

    // 2634-2647: an arc of each body's distance from the star, behind the row.
    if (layers.paths && layers.pathStrength > 0) {
        nodes.forEach((node, i) => {
            if (i === 0) return;
            const p = at[i] as { x: number; y: number };
            const radius = Math.hypot(p.x - starAt.x, p.y - starAt.y);
            if (radius < 2) return;
            layer.paths.push({
                key: node.key, cx: starAt.x, cy: starAt.y, r: radius, alpha: layers.pathStrength * PATH_ALPHA_LINEUP,
                style: 'solid', width: 0, phase: 0, main: null,
            });
        });
    }

    nodes.forEach((node, i) => {
        const p = at[i] as { x: number; y: number };
        const slot = slots[i] as { lx: number; ly: number };
        if (node.kind === 'belt' && node.world) {
            // 2481-2536.
            const reachV = maxReach / Math.max(zoom, 0.0001);
            const halfLen = horizontal
                ? Math.max(18, Math.min(reachV * 0.72, view.h * 0.2))
                : Math.max(14, Math.min(reachV * 0.65, Math.max(12, metrics.crossPos - 10)));
            const halfThick = Math.max(8, 11 * metrics.disc);
            const dots: Dot[] = beltRocks(plan.hexKey, node.world).map((rock) => {
                const vx = slot.lx + (horizontal ? rock.along * halfThick : rock.cross * halfLen);
                const vy = slot.ly + (horizontal ? rock.cross * halfLen : rock.along * halfThick);
                const dot = lineupScreen(vx, vy, view);
                return { x: dot.x, y: dot.y, r: (rock.big ? 1.8 : 0.85) * zoom, alpha: rock.alpha };
            });
            const isMain = isMainworldBelt(node.world.body);
            // 2520: the mainworld mark over the band, sized as for a body of this radius.
            const mark = isMain ? { x: p.x, y: p.y, r: Math.max(4, 6 * metrics.disc * zoom) } : null;
            layer.rocks.push({ key: node.key, dots, alpha: 1, mark });
            const kind = isMain ? 'world' : 'belt';
            const hitR = Math.max(14, 12 * metrics.disc * zoom);
            hits.push({ kind, key: node.key, cx: p.x, cy: p.y, r: hitR, visualR: hitR * 0.65 });
            for (let k = -2; k <= 2; k++) {
                if (k === 0) continue;
                const q = lineupScreen(slot.lx + (horizontal ? 0 : halfLen * k / 3), slot.ly + (horizontal ? halfLen * k / 3 : 0), view);
                hits.push({ kind, key: node.key, cx: q.x, cy: q.y, r: Math.max(12, 10 * zoom), visualR: hitR * 0.65 });
            }
            return;
        }
        if (node.star) {
            const r = node.star.basePx * z;
            picture.stars.push({ star: node.star, x: p.x, y: p.y, r, ringR: 0, parentX: p.x, parentY: p.y, glow: 1.45, label: 0 });
            hits.push({ kind: 'star', key: node.key, cx: p.x, cy: p.y, r: r + 8 * z, visualR: r });
            return;
        }
        if (node.world) {
            layer.worlds.push({ ...placeWorld(node.world, p.x, p.y, z, days, starAt.x, starAt.y, hits, layers.moons), z, label: 0 });
        }
    });

    // 2538-2572: a caption under each body (Row) or beside it (Column).
    nodes.forEach((node, i) => {
        const text = lineupCaption(node);
        if (!text) return;
        const slot = slots[i] as { lx: number; ly: number };
        const virtual = metrics.crossPos + maxReach / Math.max(zoom, 0.0001) + 16;
        const c = horizontal ? lineupScreen(slot.lx, virtual, view) : lineupScreen(virtual, slot.ly, view);
        const maxW = horizontal ? Math.max(24, metrics.slot * 0.92 * zoom) : view.w - c.x - 6;
        if (!(maxW >= 16) || c.x > view.w - 4 || c.y > view.h - 4 || c.y < 0) return;
        const body = node.world ? node.world.body : null;
        const isMain = !!body && (body.type === 'Mainworld' || isMainworldBelt(body));
        const caption: Caption = {
            key: node.key, text, short: shortLabel(text, plan.name), x: c.x, y: c.y, maxW, fontPx: Math.max(12, Math.min(20, 13 * zoom)),
            main: isMain && layers.markMainworld, align: horizontal ? 'center' : 'left', alpha: 1,
        };
        picture.captions.push(caption);
    });
    return picture;
}
