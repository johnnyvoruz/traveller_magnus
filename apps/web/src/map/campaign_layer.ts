/**
 * Campaign marks on the chart. The caller passes a snapshot. This module
 * never fetches, and it draws nothing when no campaign is open.
 * Records have no pins: the design's only map marks are the party and the locator.
 */
import { locate, type CampaignAnchor } from '@voyage/shared';
import type { Camera, Viewport } from './camera.ts';
import { toScreen } from './camera.ts';
import { DISC_R } from './glyphs.ts';
import { hexCentre, hexCorners, parseHex, toGlobal } from './geometry.ts';
import { PPP_GRID, PPP_NAMES } from './tiers.ts';

export type CampaignParty = {
    name: string;
    hexKey: string;
    /** The subsector chevron keeps its name for a hover or a keyboard stop. */
    focused: boolean;
};

export type CampaignLocate = {
    hexKey: string;
    fromX: number;
    fromY: number;
    /** Set when the camera has arrived. Null while it is still on the way. */
    arrivedAt: number | null;
};

export type CampaignSnapshot = {
    party: CampaignParty | null;
    locate: CampaignLocate | null;
    reducedMotion: boolean;
};

export type CampaignInk = {
    signal: string;
    tag: string;
    bg: string;
    font: string;
    /** One beat of the locator ring, in milliseconds. */
    pulseMs: number;
};

export type PartyMark = {
    tier: 'names' | 'chevron' | 'point';
    cx: number;
    cy: number;
    worldX: number;
    worldY: number;
    /** The system glyph. A click inside it belongs to the system. */
    glyphR: number;
    hitR: number;
    tag: { x: number; y: number; w: number; h: number } | null;
};

type SectorAt = { slug: string; x: number; y: number };

type Placed = { sx: number; sy: number; corners: number[] };

const DIM_ALPHA = 0.55;
const TAG_ALPHA = 0.82;
const NAME_FONT = 11;
const TAG_H = 18;
const RING_R = 18;

export function resolvePartyHex(
    party: { vesselId: string | null; anchor: CampaignAnchor },
    records: Readonly<Record<string, { anchor: CampaignAnchor; deleted?: boolean } | undefined>>,
): string | null {
    const live: Record<string, { anchor: CampaignAnchor }> = {};
    for (const [id, row] of Object.entries(records)) {
        if (!row || row.deleted) continue;
        live[id] = row;
    }
    if (party.vesselId) {
        const ship = locate(party.vesselId, live);
        if (ship) return ship.hexKey;
    }
    const anchor = party.anchor;
    if (anchor == null) return null;
    if (anchor.kind === 'system') return anchor.hexKey;
    return locate(anchor.id, live)?.hexKey ?? null;
}

/** A closed campaign, or an open one with nothing on the map. */
export function campaignIsBlank(snapshot: CampaignSnapshot | null): boolean {
    return snapshot == null || (snapshot.party == null && snapshot.locate == null);
}

export function partyContains(mark: PartyMark, sx: number, sy: number): boolean {
    const gx = sx - mark.worldX;
    const gy = sy - mark.worldY;
    if (gx * gx + gy * gy <= mark.glyphR * mark.glyphR) return false;
    if (mark.tier === 'point') return false;
    const dx = sx - mark.cx;
    const dy = sy - mark.cy;
    if (dx * dx + dy * dy <= mark.hitR * mark.hitR) return true;
    const tag = mark.tag;
    if (!tag) return false;
    return sx >= tag.x && sx <= tag.x + tag.w && sy >= tag.y && sy <= tag.y + tag.h;
}

export function drawCampaignLayer(
    ctx: CanvasRenderingContext2D,
    args: {
        cam: Camera;
        vp: Viewport;
        sectors: readonly SectorAt[];
        snapshot: CampaignSnapshot | null;
        ink: CampaignInk;
        nowMs: number;
    },
): { animating: boolean; mark: PartyMark | null } {
    if (campaignIsBlank(args.snapshot) || !args.snapshot) return { animating: false, mark: null };
    const snapshot = args.snapshot;
    ctx.save();
    let animating = false;
    let mark: PartyMark | null = null;
    if (snapshot.locate) {
        const place = placeHex(snapshot.locate.hexKey, args.sectors, args.cam, args.vp);
        if (place) animating = drawLocate(ctx, place, snapshot, args.ink, args.cam, args.vp, args.nowMs);
    }
    if (snapshot.party) {
        const place = placeHex(snapshot.party.hexKey, args.sectors, args.cam, args.vp);
        if (place) mark = drawParty(ctx, place, snapshot, args.cam, args.ink);
    }
    ctx.restore();
    return { animating, mark };
}

let standInHex: { count: number; hexKey: string } | null = null;

/** Resolves a stand-in party once. The draw still receives one marker, not the rows. */
export function standInSnapshot(count: number, nowMs: number): CampaignSnapshot {
    const n = Math.max(0, Math.min(20000, Math.floor(count)));
    if (!standInHex || standInHex.count !== n) {
        const records: Record<string, { anchor: CampaignAnchor }> = {};
        const vesselId = 'cr_vessel';
        records[vesselId] = { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' } };
        records.cr_person = { anchor: { kind: 'record', id: vesselId } };
        for (let i = 0; i < n; i++) {
            const col = (i % 32) + 1;
            const row = (Math.floor(i / 32) % 40) + 1;
            const hhhh = String(col).padStart(2, '0') + String(row).padStart(2, '0');
            records['cr_' + String(i)] = { anchor: { kind: 'system', hexKey: 'Spinward_Marches/' + hhhh } };
        }
        const hexKey = resolvePartyHex(
            { vesselId, anchor: { kind: 'system', hexKey: 'Spinward_Marches/0101' } },
            records,
        );
        standInHex = { count: n, hexKey: hexKey ?? 'Spinward_Marches/1910' };
    }
    return {
        party: { name: 'Far Margin', hexKey: standInHex.hexKey, focused: false },
        locate: {
            hexKey: standInHex.hexKey,
            fromX: 540,
            fromY: 280,
            arrivedAt: nowMs - 10000,
        },
        reducedMotion: false,
    };
}

function placeHex(hexKey: string, sectors: readonly SectorAt[], cam: Camera, vp: Viewport): Placed | null {
    const slash = hexKey.lastIndexOf('/');
    if (slash <= 0) return null;
    const local = parseHex(hexKey.slice(slash + 1));
    if (!local) return null;
    const slug = hexKey.slice(0, slash);
    let sector: SectorAt | null = null;
    for (const item of sectors) {
        if (item.slug === slug) {
            sector = item;
            break;
        }
    }
    if (!sector) return null;
    const global = toGlobal(sector.x, sector.y, local.col, local.row);
    const centre = hexCentre(global.q, global.r);
    const screen = toScreen(cam, vp, centre.x, centre.y);
    return { sx: screen.sx, sy: screen.sy, corners: hexCorners(centre.x, centre.y) };
}

function traceHex(ctx: CanvasRenderingContext2D, place: Placed, cam: Camera, vp: Viewport): void {
    const corners = place.corners;
    for (let i = 0; i < 6; i++) {
        const point = toScreen(cam, vp, corners[i * 2] ?? 0, corners[i * 2 + 1] ?? 0);
        if (i === 0) ctx.moveTo(point.sx, point.sy);
        else ctx.lineTo(point.sx, point.sy);
    }
    ctx.closePath();
}

function drawLocate(
    ctx: CanvasRenderingContext2D,
    place: Placed,
    snapshot: CampaignSnapshot,
    ink: CampaignInk,
    cam: Camera,
    vp: Viewport,
    nowMs: number,
): boolean {
    const locate = snapshot.locate;
    if (!locate) return false;
    ctx.beginPath();
    ctx.rect(0, 0, vp.width, vp.height);
    traceHex(ctx, place, cam, vp);
    ctx.fillStyle = ink.bg;
    ctx.globalAlpha = DIM_ALPHA;
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
    ctx.beginPath();
    traceHex(ctx, place, cam, vp);
    ctx.strokeStyle = ink.signal;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(locate.fromX, locate.fromY);
    ctx.lineTo(place.sx, place.sy);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const pulse = pulseRadius(nowMs, locate.arrivedAt, ink.pulseMs, snapshot.reducedMotion);
    ctx.beginPath();
    ctx.arc(place.sx, place.sy, pulse.radius, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    return pulse.live;
}

function pulseRadius(
    nowMs: number,
    arrivedAt: number | null,
    pulseMs: number,
    reducedMotion: boolean,
): { radius: number; live: boolean } {
    if (reducedMotion || arrivedAt == null || !(pulseMs > 0)) return { radius: RING_R, live: false };
    const age = nowMs - arrivedAt;
    if (age < 0 || age >= pulseMs) return { radius: RING_R, live: false };
    return { radius: RING_R + (age / pulseMs) * 22, live: true };
}

function markerTier(ppp: number): PartyMark['tier'] {
    if (ppp >= PPP_NAMES) return 'names';
    if (ppp >= PPP_GRID) return 'chevron';
    return 'point';
}

function drawParty(
    ctx: CanvasRenderingContext2D,
    place: Placed,
    snapshot: CampaignSnapshot,
    cam: Camera,
    ink: CampaignInk,
): PartyMark {
    const party = snapshot.party;
    const tier = markerTier(cam.ppp);
    const glyphR = tier === 'point' ? 0 : DISC_R * cam.ppp;
    if (!party || tier === 'point') {
        const hitR = 7;
        ctx.fillStyle = ink.signal;
        ctx.beginPath();
        ctx.arc(place.sx, place.sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ink.signal;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(place.sx, place.sy, hitR, 0, Math.PI * 2);
        ctx.stroke();
        return {
            tier: 'point',
            cx: place.sx,
            cy: place.sy,
            worldX: place.sx,
            worldY: place.sy,
            glyphR,
            hitR,
            tag: null,
        };
    }
    const hitR = tier === 'names' ? 11 : 8;
    const offset = tier === 'names' ? Math.max(22, glyphR + 12) : Math.max(14, glyphR + 10);
    const cx = place.sx + offset;
    const cy = place.sy;
    ctx.fillStyle = ink.tag;
    ctx.globalAlpha = TAG_ALPHA;
    ctx.beginPath();
    ctx.arc(cx, cy, hitR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink.signal;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = ink.signal;
    ctx.beginPath();
    ctx.moveTo(cx - hitR * 0.28, cy - hitR * 0.42);
    ctx.lineTo(cx + hitR * 0.4, cy);
    ctx.lineTo(cx - hitR * 0.28, cy + hitR * 0.42);
    ctx.closePath();
    ctx.fill();
    let tag: PartyMark['tag'] = null;
    const showName = tier === 'names' || (tier === 'chevron' && party.focused);
    if (showName && party.name) {
        const label = party.name.toUpperCase();
        ctx.font = NAME_FONT + 'px ' + ink.font;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const width = ctx.measureText(label).width;
        const x = cx + hitR + 6;
        const y = cy - TAG_H / 2;
        const w = width + 12;
        tag = { x, y, w, h: TAG_H };
        ctx.fillStyle = ink.tag;
        ctx.globalAlpha = TAG_ALPHA;
        ctx.beginPath();
        ctx.roundRect(x, y, w, TAG_H, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = ink.signal;
        ctx.fillText(label, x + 6, cy);
    }
    return { tier, cx, cy, worldX: place.sx, worldY: place.sy, glyphR, hitR, tag };
}
