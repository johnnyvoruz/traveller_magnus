/**
 * The orbit stage's state between frames: the plan, the camera, the body being followed and
 * any camera move in flight. The component feeds it pointer input and asks it for the scene
 * once a frame; nothing here touches a canvas or the DOM, so it runs under Node.
 *
 * Legacy rules kept (js/system_viewer.js): the fitted view refits as the bodies move (2030);
 * a click selects and follows (4737-4744); a drag past the slop stops the follow (4718); a
 * double click frames a body, or fits on empty space (4750-4756); zooming out to the floor
 * fits (4690). New here: fit, frame and follow are eased moves instead of cuts, and a move
 * of zero length (reduced motion) is the legacy cut.
 */
import {
    centreOn, easeInOut, fitCamera, frameCamera, panBy, startCamera, toward, tweenShare,
    viewOf, zoomAt, zoomToward, type Camera, type Size,
} from './camera.ts';
import { hitAt, hitOf, layoutScene, type Hit, type Plan, type Scene, type View } from './layout.ts';

/** How long the eased moves take, in milliseconds. 0 is a cut. */
export type StageMotion = {
    /** Following a body at the same zoom. */
    hop: number;
    /** Fit, and framing a body. */
    flight: number;
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

export type StageFrame = {
    scene: Scene;
    view: View;
    /** False when nothing moved since the last frame: the caller may skip the paint. */
    changed: boolean;
    /** True while a camera move is in flight: the caller must keep asking for frames. */
    moving: boolean;
};

export class OrbitStage {
    plan: Plan | null = null;
    cam: Camera = startCamera();
    size: Size = { w: 0, h: 0 };
    linear = false;
    motion: StageMotion = { hop: 0, flight: 0 };
    /** The key of the body the camera follows, or null. */
    tracked: string | null = null;

    private flight: Flight | null = null;
    private dirty = true;
    private lastDays = Number.NaN;
    private last: StageFrame | null = null;

    setPlan(plan: Plan | null): void {
        this.plan = plan;
        this.cam = startCamera();
        this.tracked = null;
        this.flight = null;
        this.last = null;
        this.dirty = true;
    }

    /** js/system_viewer.js:5202-5221: a new canvas size keeps the view relative to the new fit. */
    resize(w: number, h: number, days: number): void {
        if (w === this.size.w && h === this.size.h) return;
        this.size = { w, h };
        if (this.plan) this.cam = fitCamera(this.plan, this.size, days, this.cam, true, this.linear);
        this.dirty = true;
    }

    invalidate(): void {
        this.dirty = true;
    }

    /** The topmost body under a point of the last frame. */
    pick(x: number, y: number): Hit | null {
        return this.last ? hitAt(this.last.scene, x, y) : null;
    }

    wheel(x: number, y: number, notches: number, days: number, time: number): void {
        if (!this.plan || !notches) return;
        // A wheel takes over from a fit in flight; a follow keeps going at the new zoom.
        if (this.flight && this.flight.kind === 'fit') this.flight = null;
        if (this.flight) this.flight.zoom = null;
        this.cam = fitCamera(this.plan, this.size, days, this.cam, true, this.linear);
        const result = zoomAt(this.cam, this.size, x, y, notches, this.tracked !== null);
        if (result.fit) this.fit(time);
        else this.cam = result.cam;
        this.dirty = true;
    }

    /** moved: the press has travelled past DRAG_SLOP, so it is a drag and not a click. */
    drag(dx: number, dy: number, moved: boolean): void {
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
        this.tracked = key;
        this.cam.atFit = false;
        this.flight = { kind: 'follow', start: time, duration: this.motion.hop, remain: 1, zoom: null };
        this.dirty = true;
    }

    /** Frame a body and what orbits it, then follow it. False when the body is not in the picture. */
    frame(key: string, days: number, time: number): boolean {
        if (!this.plan) return false;
        const target = frameCamera(this.plan, this.size, days, this.cam, key, this.linear);
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

    /** True when the view is the fitted view, or is on its way there. */
    get fitted(): boolean {
        return this.cam.atFit || (this.flight !== null && this.flight.kind === 'fit');
    }

    /** The scene for this frame, or null before there is a plan and a size. */
    tick(days: number, time: number): StageFrame | null {
        const plan = this.plan;
        if (!plan || !(this.size.w > 0) || !(this.size.h > 0)) return null;
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
            const target = fitCamera(plan, this.size, days, this.cam, false, this.linear);
            this.cam = toward(this.cam, target, share);
            this.cam.atFit = this.flight === null;
        } else if (this.cam.atFit) {
            this.cam = fitCamera(plan, this.size, days, this.cam, false, this.linear);
        } else if (this.tracked) {
            if (flight && flight.zoom !== null) this.cam = zoomToward(this.cam, flight.zoom, share);
            const hit = hitOf(layoutScene(plan, viewOf(this.cam, this.size, this.linear), days), this.tracked);
            if (hit) this.cam = centreOn(this.cam, hit, this.size, share);
            else this.tracked = null;
        }

        const view = viewOf(this.cam, this.size, this.linear);
        this.last = { scene: layoutScene(plan, view, days), view, changed: true, moving: this.flight !== null };
        this.lastDays = days;
        this.dirty = false;
        return this.last;
    }
}
