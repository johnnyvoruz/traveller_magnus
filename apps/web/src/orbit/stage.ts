/**
 * The orbit stage's state between frames: the plan, the layout (Orbits, Row or Column), the
 * layer switches, the camera, the body being followed, and any move in flight. The component
 * feeds it pointer input and asks it for the picture once a frame; nothing here touches a
 * canvas or the DOM, so it runs under Node.
 *
 * Legacy rules kept (js/system_viewer.js): the fitted view refits as the bodies move (2030);
 * a click selects and follows (4737-4744); a drag past the slop stops the follow (4718); a
 * double click frames a body, or fits on empty space (4750-4756); zooming out to the floor
 * fits (4690); changing the layout fits the new one and lets go of a followed body
 * (2073-2081); a line-up is fitted at zoom 1 (5124-5137). New here: fit, frame and follow are
 * eased moves, and a change of layout is the travelling transition of
 * campaign_manager_plan.md §7.8. A move of zero length (reduced motion) is the legacy cut.
 */
import {
    centreOn, easeInOut, fitCamera, frameCamera, lineupFit, panBy, startCamera, toward, tweenShare,
    viewOf, zoomAt, zoomToward, type Camera, type Size,
} from './camera.ts';
import { hitAt, hitOf, layoutScene, type Hit, type Plan, type View } from './layout.ts';
import { layoutLineup } from './lineup.ts';
import { DEFAULT_LAYERS, orbitPicture, type Layers, type Mode, type Picture } from './picture.ts';
import { blendPictures, moveDuration, travelOrder } from './tween.ts';

/** How long the eased moves take, in milliseconds. 0 is a cut. */
export type StageMotion = {
    /** Following a body at the same zoom. */
    hop: number;
    /** Fit, and framing a body. */
    flight: number;
    /** Bodies travelling from one layout to another. */
    lineup: number;
};

type Flight = {
    kind: 'fit' | 'follow';
    start: number;
    duration: number;
    /** 1 − eased progress at the last frame. */
    remain: number;
    /** Framing only: the zoom to arrive at. */
    zoom: number | null;
};

/** A change of layout in flight. */
type Move = {
    /** The layout being left, or null when the move began part way through another. */
    from: Mode | null;
    /** The picture the move began from, when it began part way through another (§7.8.8). */
    frozen: Picture | null;
    fromCam: Camera;
    to: Mode;
    start: number;
    ms: number;
};

export type StageFrame = {
    picture: Picture;
    view: View;
    /** False when nothing moved since the last frame: the caller may skip the paint. */
    changed: boolean;
    /** True while a move is in flight: the caller must keep asking for frames. */
    moving: boolean;
};

export class OrbitStage {
    plan: Plan | null = null;
    cam: Camera = startCamera();
    size: Size = { w: 0, h: 0 };
    motion: StageMotion = { hop: 0, flight: 0, lineup: 0 };
    /** The layout shown, or being left while a change is in flight. */
    mode: Mode = 'orbits';
    layers: Layers = { ...DEFAULT_LAYERS };
    /** The key of the body the camera follows, or null. */
    tracked: string | null = null;

    private flight: Flight | null = null;
    private move: Move | null = null;
    private order = new Map<string, number>();
    private dirty = true;
    private lastDays = Number.NaN;
    private last: StageFrame | null = null;

    setPlan(plan: Plan | null): void {
        this.plan = plan;
        this.order = plan ? travelOrder(plan) : new Map();
        this.cam = startCamera();
        this.tracked = null;
        this.flight = null;
        this.move = null;
        this.last = null;
        this.dirty = true;
    }

    /** The layout the stage shows or is on its way to. */
    get target(): Mode {
        return this.move ? this.move.to : this.mode;
    }

    /** True when the view is the fitted view, or is on its way there. */
    get fitted(): boolean {
        return this.cam.atFit || this.move !== null || (this.flight !== null && this.flight.kind === 'fit');
    }

    private fitFor(mode: Mode, days: number, cam: Camera, preserve: boolean): Camera {
        if (mode !== 'orbits') return lineupFit(cam, preserve);
        return fitCamera(this.plan as Plan, this.size, days, cam, preserve, this.layers.linear, this.layers.moons, this.layers.jump);
    }

    private viewFor(cam: Camera): View {
        return viewOf(cam, this.size, this.layers.linear, this.layers.moons, this.layers.jump);
    }

    private pictureFor(mode: Mode, cam: Camera, days: number): Picture {
        const plan = this.plan as Plan;
        const view = this.viewFor(cam);
        if (mode === 'orbits') return orbitPicture(plan, layoutScene(plan, view, days), this.layers, view.z);
        return layoutLineup(plan, view, mode, days, this.layers);
    }

    /** js/system_viewer.js:5202-5221: a new canvas size keeps the view relative to the new fit. */
    resize(w: number, h: number, days: number): void {
        if (w === this.size.w && h === this.size.h) return;
        this.size = { w, h };
        if (this.plan) this.cam = this.fitFor(this.mode, days, this.cam, true);
        this.dirty = true;
    }

    invalidate(): void {
        this.dirty = true;
    }

    /** The topmost body under a point of the last frame. */
    pick(x: number, y: number): Hit | null {
        return this.last ? hitAt(this.last.picture, x, y) : null;
    }

    /** Orbits, Row or Column. The bodies travel to their new places; under reduced motion they cut. */
    setMode(mode: Mode, time: number): void {
        if (!this.plan || mode === this.target) return;
        this.tracked = null;
        this.flight = null;
        if (!(this.motion.lineup > 0) || !this.last) {
            this.mode = mode;
            this.move = null;
            this.cam = startCamera();
            this.dirty = true;
            return;
        }
        this.move = {
            from: this.move ? null : this.mode,
            frozen: this.move ? this.last.picture : null,
            fromCam: this.cam,
            to: mode,
            start: time,
            ms: this.motion.lineup,
        };
        this.dirty = true;
    }

    /** The layer switches. Changing the scale fits the view (1915-1918). */
    setLayers(layers: Layers, time: number): void {
        const scaleChanged = layers.linear !== this.layers.linear;
        this.layers = { ...layers };
        if (scaleChanged && this.plan && !this.move) this.fit(time);
        this.dirty = true;
    }

    wheel(x: number, y: number, notches: number, days: number, time: number): void {
        if (!this.plan || !notches || this.move) return;
        // A wheel takes over from a fit in flight; a follow keeps going at the new zoom.
        if (this.flight && this.flight.kind === 'fit') this.flight = null;
        if (this.flight) this.flight.zoom = null;
        this.cam = this.fitFor(this.mode, days, this.cam, true);
        const result = zoomAt(this.cam, this.size, x, y, notches, this.tracked !== null);
        if (result.fit) this.fit(time);
        else this.cam = result.cam;
        this.dirty = true;
    }

    /** moved: the press has travelled past DRAG_SLOP, so it is a drag and not a click. */
    drag(dx: number, dy: number, moved: boolean): void {
        if (this.move) return;
        this.cam = panBy(this.cam, dx, dy);
        if (moved) {
            this.cam.atFit = false;
            this.tracked = null;
            this.flight = null;
        }
        this.dirty = true;
    }

    /** Follow a body at the current zoom. */
    follow(key: string, time: number): void {
        if (this.move) return;
        this.tracked = key;
        this.cam.atFit = false;
        this.flight = { kind: 'follow', start: time, duration: this.motion.hop, remain: 1, zoom: null };
        this.dirty = true;
    }

    /** Frame a body and what orbits it, then follow it. False when the body is not in the picture. */
    frame(key: string, days: number, time: number): boolean {
        const plan = this.plan;
        if (!plan || this.move) return false;
        const target = frameCamera(plan, this.size, this.cam, key, (cam) => this.pictureFor(this.mode, cam, days).hits);
        if (!target) {
            this.release();
            return false;
        }
        this.tracked = key;
        this.cam.atFit = false;
        this.flight = { kind: 'follow', start: time, duration: this.motion.flight, remain: 1, zoom: target.zoom };
        this.dirty = true;
        return true;
    }

    /** js/system_viewer.js:5201. */
    fit(time: number): void {
        if (this.move) return;
        this.tracked = null;
        this.cam.atFit = false;
        this.flight = { kind: 'fit', start: time, duration: this.motion.flight, remain: 1, zoom: null };
        this.dirty = true;
    }

    /** Stop following. The camera stays where it is. */
    release(): void {
        if (this.flight && this.flight.kind === 'follow') this.flight = null;
        this.tracked = null;
    }

    /** One frame of a change of layout: both pictures at this date, blended (§7.8). */
    private travel(move: Move, days: number, time: number): StageFrame {
        const toCam = { ...this.fitFor(move.to, days, startCamera(), false), atFit: true };
        const to = this.pictureFor(move.to, toCam, days);
        const elapsed = time - move.start;
        if (elapsed >= moveDuration(move.ms, this.order.size)) {
            this.mode = move.to;
            this.cam = toCam;
            this.move = null;
            return { picture: to, view: this.viewFor(toCam), changed: true, moving: false };
        }
        let from = move.frozen;
        if (!from && move.from) {
            // The layout being left keeps its camera; a fitted orbits view keeps refitting.
            const fromCam = move.fromCam.atFit ? this.fitFor(move.from, days, move.fromCam, false) : move.fromCam;
            from = this.pictureFor(move.from, fromCam, days);
        }
        const picture = from
            ? blendPictures({ from, to, elapsed, ms: move.ms, order: this.order, days, moonsShown: this.layers.moons })
            : to;
        return { picture, view: this.viewFor(toCam), changed: true, moving: true };
    }

    /** The picture for this frame, or null before there is a plan and a size. */
    tick(days: number, time: number): StageFrame | null {
        const plan = this.plan;
        if (!plan || !(this.size.w > 0) || !(this.size.h > 0)) return null;
        if (this.move) {
            this.last = this.travel(this.move, days, time);
            this.lastDays = days;
            this.dirty = false;
            return this.last;
        }
        if (!this.dirty && !this.flight && days === this.lastDays && this.last) {
            this.last.changed = false;
            this.last.moving = false;
            return this.last;
        }

        let share = 1;
        const flight = this.flight;
        if (flight) {
            const t = flight.duration > 0 ? Math.min(1, Math.max(0, (time - flight.start) / flight.duration)) : 1;
            const remain = 1 - easeInOut(t);
            share = t >= 1 ? 1 : tweenShare(flight.remain, remain);
            flight.remain = remain;
            if (t >= 1) this.flight = null;
        }

        if (flight && flight.kind === 'fit') {
            const target = this.fitFor(this.mode, days, this.cam, false);
            this.cam = toward(this.cam, target, share);
            this.cam.atFit = this.flight === null;
        } else if (this.cam.atFit) {
            this.cam = this.fitFor(this.mode, days, this.cam, false);
        } else if (this.tracked) {
            if (flight && flight.zoom !== null) this.cam = zoomToward(this.cam, flight.zoom, share);
            const hit = hitOf(this.pictureFor(this.mode, this.cam, days), this.tracked);
            if (hit) this.cam = centreOn(this.cam, hit, this.size, share);
            else this.tracked = null;
        }

        this.last = { picture: this.pictureFor(this.mode, this.cam, days), view: this.viewFor(this.cam), changed: true, moving: this.flight !== null };
        this.lastDays = days;
        this.dirty = false;
        return this.last;
    }
}
