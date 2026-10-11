/**
 * The pointer rules of Build (findings/builder_system_design.md §18): which gesture a press
 * begins, what an unmoved press does to the hex under it, which cursor says so, what a box
 * would add or take away, and where the chart can be seen once the pane is open. All of it
 * is pure and runs under Node; the map view only asks.
 */
import { fit, type Camera, type Viewport } from '../../map/camera.ts';
import type { Rect } from '../../map/geometry.ts';

/** The keys held while the pointer is used. Space is the map's own: held, a drag always moves the chart. */
export type Held = { shift: boolean; alt: boolean; space: boolean };

export type Press = Held & {
    /** Build is on with a universe open. Off, every drag moves the chart, as it always has. */
    build: boolean;
    /** The Select hexes tool is on. */
    tool: boolean;
    /** The pointer's button: 0 is the main one; the middle button always moves the chart. */
    button: number;
    /** The chart is close enough to show hexes: only there can hexes be boxed. */
    hexTier: boolean;
};

export type Gesture = 'pan' | 'box-add' | 'box-take';

/**
 * A plain drag always moves the map. The box is asked for: Shift+drag adds, Alt+Shift+drag
 * takes away; with the tool on a plain drag is the box, Alt takes away, and Space or the
 * middle button still moves the map.
 */
export function gestureFor(press: Press): Gesture {
    if (!press.build || !press.hexTier || press.button !== 0) return 'pan';
    if (press.shift) return press.alt ? 'box-take' : 'box-add';
    if (press.tool && !press.space) return press.alt ? 'box-take' : 'box-add';
    return 'pan';
}

export type Intent = 'select' | 'add' | 'take';

/** What a press that does not move does to the hex under it: select it alone, add it, or take it away. */
export function clickIntent(held: Pick<Held, 'shift' | 'alt'>, selected: boolean): Intent {
    if (!held.shift) return 'select';
    if (held.alt) return 'take';
    return selected ? 'take' : 'add';
}

export type CursorName = 'default' | 'grab' | 'grabbing' | 'add' | 'take' | 'box' | 'box-take';

/** The cursor says what the next press will do, and what the press under way is doing. */
export function cursorFor(state: {
    build: boolean;
    tool: boolean;
    hexTier: boolean;
    held: Held;
    /** The drag under way, if any. */
    dragging: Gesture | null;
    /** The hex under the pointer is in the selection. */
    overSelected: boolean;
}): CursorName {
    if (!state.build) return 'default';
    if (state.dragging === 'pan') return 'grabbing';
    if (state.dragging === 'box-add') return 'box';
    if (state.dragging === 'box-take') return 'box-take';
    if (!state.hexTier) return 'default';
    if (state.held.shift) return clickIntent(state.held, state.overSelected) === 'take' ? 'take' : 'add';
    if (state.tool) {
        if (state.held.space) return 'grab';
        return state.held.alt ? 'box-take' : 'box';
    }
    return 'default';
}

export type Tone = 'plain' | 'add' | 'take';

/** The hover outline's tone follows what a press would do: plain selects, add in the selection's tone, take away in the removal tone. */
export function hoverTone(held: Pick<Held, 'shift' | 'alt'>, selected: boolean): Tone {
    const intent = clickIntent(held, selected);
    return intent === 'select' ? 'plain' : intent;
}

export type HoverKind = 'empty' | 'filled' | 'removed' | 'slot';

/** The chip beside the hovered hex: its number and, if filled, its name; a plus or a minus when a press would add or take away. */
export function hoverWords(hex: string, kind: HoverKind, name: string, tone: Tone): string {
    const what = kind === 'filled' ? (name || 'a system') : kind === 'slot' ? 'empty sector slot' : kind === 'removed' ? 'removed' : 'empty';
    const lead = tone === 'add' ? '+ ' : tone === 'take' ? '− ' : '';
    return lead + (hex ? hex + ' · ' : '') + what;
}

/**
 * What a box does to the selection. Adding: the boxed hexes not yet held join it, up to the
 * cap. Taking away: the boxed hexes that are held leave it. `changed` is what the drag
 * previews; `over` says the cap cut the box short.
 */
export function boxResult(held: readonly string[], inside: readonly string[], mode: 'box-add' | 'box-take', cap: number): { keys: string[]; changed: string[]; over: boolean } {
    const have = new Set(held);
    if (mode === 'box-take') {
        const gone = new Set(inside);
        const changed = held.filter((key) => gone.has(key));
        return { keys: held.filter((key) => !gone.has(key)), changed, over: false };
    }
    const keys = [...held];
    const changed: string[] = [];
    let over = false;
    for (const key of inside) {
        if (have.has(key)) continue;
        if (keys.length >= cap) {
            over = true;
            break;
        }
        have.add(key);
        keys.push(key);
        changed.push(key);
    }
    return { keys, changed, over };
}

/** "12 hexes, 7 empty" beside the pointer while a box is dragged; "5 hexes taken away" when it takes. */
export function boxWords(changed: number, empty: number, mode: 'box-add' | 'box-take', over = false): string {
    const hexes = changed + (changed === 1 ? ' hex' : ' hexes');
    if (mode === 'box-take') return hexes + ' taken away';
    return hexes + ', ' + empty + ' empty' + (over ? ' · the most one selection holds' : '');
}

// ---- where the chart can be seen ---------------------------------------------------------------------

/** A part of the canvas, in its own pixels. */
export type Area = { left: number; top: number; right: number; bottom: number };

/** The chart that nothing covers: the canvas less the pane at its left and the chrome row at its top. */
export function visibleArea(vp: Viewport, cover: { left: number; top: number }): Area {
    const left = Math.min(Math.max(0, cover.left), vp.width);
    const top = Math.min(Math.max(0, cover.top), vp.height);
    return { left, top, right: vp.width, bottom: vp.height };
}

/** A camera that puts its target at the middle of the area instead of the middle of the canvas. */
export function centreIn(target: Camera, vp: Viewport, area: Area): Camera {
    const dx = (area.left + area.right) / 2 - vp.width / 2;
    const dy = (area.top + area.bottom) / 2 - vp.height / 2;
    return { x: target.x - dx / target.ppp, y: target.y - dy / target.ppp, ppp: target.ppp };
}

/** The camera that fits a part of the chart into the area. An area with no room falls back to the whole canvas. */
export function fitIn(rect: Rect, vp: Viewport, area: Area, marginPx: number): Camera {
    const width = area.right - area.left;
    const height = area.bottom - area.top;
    if (!(width > 2 * marginPx) || !(height > 2 * marginPx)) return fit(rect, vp, marginPx);
    return centreIn(fit(rect, { width, height }, marginPx), vp, area);
}

/** The least room the area must have for the map to be moved into it: under this the pane has taken the chart. */
export const AREA_MIN = 96;

/**
 * The glide that clears the pane: the least move of the camera that brings a box of the
 * screen (what was just selected) inside the area with a margin. Null when it is inside
 * already, or when the area is too small to hold anything. A box wider or taller than the
 * area is centred in it.
 */
export function clearGlide(cam: Camera, area: Area, box: Area, margin: number): Camera | null {
    const width = area.right - area.left;
    const height = area.bottom - area.top;
    if (width < AREA_MIN || height < AREA_MIN) return null;
    const along = (lo: number, hi: number, from: number, to: number): number => {
        const room = to - from - 2 * margin;
        if (hi - lo > room) return (from + to) / 2 - (lo + hi) / 2;
        if (lo < from + margin) return from + margin - lo;
        if (hi > to - margin) return to - margin - hi;
        return 0;
    };
    const dx = along(box.left, box.right, area.left, area.right);
    const dy = along(box.top, box.bottom, area.top, area.bottom);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
    return { x: cam.x - dx / cam.ppp, y: cam.y - dy / cam.ppp, ppp: cam.ppp };
}

/** Where a chip goes beside a box of the screen: above it, or below when there is no room above; never on it. */
export function chipPlace(box: Area, area: Area, gap: number, chipHeight: number): { x: number; y: number; below: boolean } {
    const below = box.top - gap - chipHeight < area.top;
    const half = 80;
    const x = Math.min(Math.max((box.left + box.right) / 2, area.left + half), Math.max(area.left + half, area.right - half));
    return { x, y: below ? box.bottom + gap : box.top - gap, below };
}
