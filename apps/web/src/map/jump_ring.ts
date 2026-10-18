/**
 * The jump-range ring (streams/D.md DU2; UX backlog U2): with a party ship's record open, the hexes
 * within its jump number of where it is, shaded, with their outer edge drawn, on a layer of their own
 * over the chart. The jump number is what the referee typed on the ship sheet (Jump Drive Output); a
 * jump number carries that many parsecs (`rules/mgt2e_space_travel.json` `jump.parsecsPerJumpNumber`).
 * Nothing else is read into it: no fuel, no drive check. Drawn at the device's full resolution every
 * frame the chart draws.
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import generated from '../../../../packages/engines/src/generated/rules/mgt2e_space_travel.js';
import { toScreen, type Camera, type Viewport } from './camera.ts';
import { hexCentre, hexCorners, hexDistance } from './geometry.ts';

const rules = generated as { jump: { parsecsPerJumpNumber: number } };

/** The sheet's box the jump number is read from. */
export const JUMP_FIELD = 'Jump Drive Output';

/** The jump number typed on a ship sheet: the first whole number from 1 to 9 ("2", "J-2", "Jump-2"); null otherwise. */
export function jumpNumberOf(values: Readonly<Record<string, unknown>> | null | undefined): number | null {
    const raw = values ? values[JUMP_FIELD] : null;
    if (typeof raw !== 'string') return null;
    const match = raw.match(/(\d+)/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isInteger(n) && n >= 1 && n <= 9 ? n : null;
}

/** The parsecs a jump number carries, from the rules file. */
export function jumpParsecs(jump: number): number {
    return jump * rules.jump.parsecsPerJumpNumber;
}

export type Hex = { q: number; r: number };

/** Every hex within `parsecs` of the centre, the centre included. */
export function ringHexes(centre: Hex, parsecs: number): Hex[] {
    const out: Hex[] = [];
    for (let q = centre.q - parsecs; q <= centre.q + parsecs; q++) {
        for (let r = centre.r - parsecs - 1; r <= centre.r + parsecs + 1; r++) {
            if (hexDistance(centre, { q, r }) <= parsecs) out.push({ q, r });
        }
    }
    return out;
}

/** The ring's outer edge in map units: each hex side that only one hex of the set has. */
export function ringOutline(hexes: readonly Hex[]): [number, number, number, number][] {
    const key = (x: number, y: number) => Math.round(x * 1e4) + ',' + Math.round(y * 1e4);
    const seen = new Map<string, { edge: [number, number, number, number]; count: number }>();
    for (const hex of hexes) {
        const centre = hexCentre(hex.q, hex.r);
        const corners = hexCorners(centre.x, centre.y);
        for (let i = 0; i < 6; i++) {
            const j = (i + 1) % 6;
            const a = key(corners[i * 2], corners[i * 2 + 1]);
            const b = key(corners[j * 2], corners[j * 2 + 1]);
            const id = a < b ? a + '|' + b : b + '|' + a;
            const have = seen.get(id);
            if (have) have.count += 1;
            else seen.set(id, { edge: [corners[i * 2], corners[i * 2 + 1], corners[j * 2], corners[j * 2 + 1]], count: 1 });
        }
    }
    return [...seen.values()].filter((item) => item.count === 1).map((item) => item.edge);
}

export type JumpRing = { centre: Hex; jump: number; hexes: Hex[]; outline: [number, number, number, number][] };

export function jumpRing(centre: Hex, jump: number): JumpRing {
    const hexes = ringHexes(centre, jumpParsecs(jump));
    return { centre, jump, hexes, outline: ringOutline(hexes) };
}

export type RingInk = { line: string; fill: string };

/** The ring's own canvas over the chart. It takes no pointer: the chart under it is clicked as before. */
export class JumpRingLayer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;
    private dpr = 1;
    private drawn = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('JumpRingLayer: no 2D context');
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

    /** One frame: nothing when there is no ring (cleared once), else the shaded hexes and their edge. */
    draw(cam: Camera, vp: Viewport, ring: JumpRing | null, ink: RingInk): void {
        const ctx = this.ctx;
        if (!ring) {
            if (!this.drawn) return;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.drawn = false;
            return;
        }
        this.drawn = true;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        const fill = new Path2D();
        for (const hex of ring.hexes) {
            const centre = hexCentre(hex.q, hex.r);
            const corners = hexCorners(centre.x, centre.y);
            for (let i = 0; i < 6; i++) {
                const at = toScreen(cam, vp, corners[i * 2], corners[i * 2 + 1]);
                if (i === 0) fill.moveTo(at.sx, at.sy);
                else fill.lineTo(at.sx, at.sy);
            }
            fill.closePath();
        }
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = ink.fill;
        ctx.fill(fill);
        ctx.globalAlpha = 1;
        const edge = new Path2D();
        for (const [x1, y1, x2, y2] of ring.outline) {
            const a = toScreen(cam, vp, x1, y1);
            const b = toScreen(cam, vp, x2, y2);
            edge.moveTo(a.sx, a.sy);
            edge.lineTo(b.sx, b.sy);
        }
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = ink.line;
        ctx.stroke(edge);
    }
}
