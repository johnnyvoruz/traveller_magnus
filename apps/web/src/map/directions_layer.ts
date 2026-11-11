/**
 * The Directions route on the chart (DN1): its own canvas over the chart, as the jump ring has
 * (`jump_ring.ts`), so the party's track under it stays drawn. The party-route line's style: a 2 px line
 * in the signal colour cased in the ground colour, round joins, and one dot per stop. It takes no pointer.
 */
import { toScreen, type Camera, type Viewport } from './camera.ts';
import { hexCentre, parseHex, toGlobal } from './geometry.ts';
import type { RouteEnd } from './route_plan.ts';

export type DirectionsInk = { line: string; casing: string };

/** The stops as map points; a stop in a sector the chart does not place is left out. */
export function stopPoints(stops: readonly RouteEnd[], sectorAt: (slug: string) => { x: number; y: number } | null): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const stop of stops) {
        const sector = sectorAt(stop.sector);
        const local = parseHex(stop.hex);
        if (!sector || !local) continue;
        const global = toGlobal(sector.x, sector.y, local.col, local.row);
        out.push(hexCentre(global.q, global.r));
    }
    return out;
}

export class DirectionsLayer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;
    private dpr = 1;
    private drawn = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('DirectionsLayer: no 2D context');
        this.ctx = ctx;
    }

    resize(width: number, height: number, dpr: number): void {
        this.width = width;
        this.height = height;
        this.dpr = dpr > 0 ? dpr : 1;
        const w = Math.max(1, Math.round(width * this.dpr));
        const h = Math.max(1, Math.round(height * this.dpr));
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
        this.drawn = true;
    }

    /** One frame: cleared once when there is no route, else the line and its stops. */
    draw(cam: Camera, vp: Viewport, points: readonly { x: number; y: number }[] | null, ink: DirectionsInk): void {
        const ctx = this.ctx;
        if (!points || points.length < 2) {
            if (!this.drawn) return;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.drawn = false;
            return;
        }
        this.drawn = true;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        drawDirections(ctx, cam, vp, points, ink);
    }
}

/** The route into any context in CSS pixels. */
export function drawDirections(ctx: CanvasRenderingContext2D, cam: Camera, vp: Viewport, points: readonly { x: number; y: number }[], ink: DirectionsInk): void {
    const at = points.map((point) => toScreen(cam, vp, point.x, point.y));
    const line = new Path2D();
    at.forEach((p, i) => (i === 0 ? line.moveTo(p.sx, p.sy) : line.lineTo(p.sx, p.sy)));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = ink.casing;
    ctx.lineWidth = 5;
    ctx.stroke(line);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = 2;
    ctx.stroke(line);
    for (let i = 0; i < at.length; i++) {
        const end = i === 0 || i === at.length - 1;
        ctx.beginPath();
        ctx.arc(at[i].sx, at[i].sy, end ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = ink.casing;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(at[i].sx, at[i].sy, end ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = ink.line;
        ctx.fill();
    }
    ctx.restore();
}
