import { cancelFrame, nextFrame, now, prefersReducedMotion } from '../platform/browser.ts';
import { panBy, zoomAt, type Camera, type Viewport } from './camera.ts';
import { readMotion } from './theme.ts';

/** Legacy wheel notch (js/canvas_input.js). deltaMode 0 reports about 100 CSS pixels per notch. */
const WHEEL_STEP = 1.1;
const WHEEL_NOTCH_PX = 100;
const LINE_PX = 16;
const CLICK_PX = 4;

export type InputWhy = 'drag' | 'wheel' | 'pinch' | 'key' | 'inertia';

/**
 * home() is the home-view camera the view supplies. The Home key itself is the
 * shell registry command, not a listener in this adapter.
 */
export function attachInput(el: HTMLElement, api: {
    getCamera(): Camera;
    getViewport(): Viewport;
    setCamera(cam: Camera, why: InputWhy): void;
    click(sx: number, sy: number): void;
    home(): Camera;
}): () => void {
    el.style.touchAction = 'none';

    const pointers = new Map<number, { x: number; y: number }>();
    let origin = { x: 0, y: 0 };
    let downAt = 0;
    let last = { x: 0, y: 0 };
    let lastT = 0;
    let vx = 0;
    let vy = 0;
    let pinched = false;
    let startCam: Camera | null = null;
    let pinchStart = { x: 0, y: 0, dist: 1 };
    let motionGen = 0;
    let motionFrame = 0;

    function local(clientX: number, clientY: number): { x: number; y: number } {
        const rect = el.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function cancelMotion(): void {
        motionGen += 1;
        if (motionFrame) {
            cancelFrame(motionFrame);
            motionFrame = 0;
        }
    }

    function pinchOf(): { x: number; y: number; dist: number } {
        const pts = [...pointers.values()];
        const x = (pts[0].x + pts[1].x) / 2;
        const y = (pts[0].y + pts[1].y) / 2;
        return { x, y, dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
    }

    function inertia(): void {
        if (prefersReducedMotion()) return;
        if (vx === 0 && vy === 0) return;
        const motion = readMotion(el);
        const dur = motion.tLong * 1000;
        const t0 = now();
        let previous = t0;
        const v0x = vx;
        const v0y = vy;
        const gen = motionGen;
        const step = () => {
            if (gen !== motionGen) return;
            const t = now();
            const elapsed = t - t0;
            if (elapsed >= dur) return;
            const dt = t - previous;
            previous = t;
            const decay = 1 - elapsed / dur;
            api.setCamera(panBy(api.getCamera(), -v0x * dt * decay, -v0y * dt * decay), 'inertia');
            motionFrame = nextFrame(step);
        };
        motionFrame = nextFrame(step);
    }

    function onDown(event: PointerEvent): void {
        cancelMotion();
        el.setPointerCapture(event.pointerId);
        const point = local(event.clientX, event.clientY);
        pointers.set(event.pointerId, point);
        if (pointers.size === 1) {
            pinched = false;
            origin = point;
            last = point;
            downAt = now();
            lastT = downAt;
            vx = 0;
            vy = 0;
            startCam = null;
        } else if (pointers.size === 2) {
            pinched = true;
            startCam = api.getCamera();
            pinchStart = pinchOf();
            if (pinchStart.dist === 0) pinchStart.dist = 1;
        }
    }

    function onMove(event: PointerEvent): void {
        if (!pointers.has(event.pointerId)) return;
        const point = local(event.clientX, event.clientY);
        pointers.set(event.pointerId, point);
        if (pointers.size >= 2 && startCam) {
            const pinch = pinchOf();
            const vp = api.getViewport();
            const factor = pinch.dist / pinchStart.dist;
            let next = zoomAt(startCam, vp, pinchStart.x, pinchStart.y, factor);
            next = panBy(next, -(pinch.x - pinchStart.x), -(pinch.y - pinchStart.y));
            api.setCamera(next, 'pinch');
            return;
        }
        if (pointers.size !== 1) return;
        const dx = point.x - last.x;
        const dy = point.y - last.y;
        const t = now();
        const dt = t - lastT;
        if (dt > 0) {
            vx = dx / dt;
            vy = dy / dt;
        }
        last = point;
        lastT = t;
        api.setCamera(panBy(api.getCamera(), -dx, -dy), 'drag');
    }

    function onUp(event: PointerEvent): void {
        const wasTracked = pointers.delete(event.pointerId);
        if (!wasTracked) return;
        if (pointers.size === 1) {
            const only = [...pointers.values()][0];
            last = only;
            lastT = now();
            vx = 0;
            vy = 0;
            startCam = null;
            return;
        }
        if (pointers.size > 1) return;
        const point = local(event.clientX, event.clientY);
        const dist = Math.hypot(point.x - origin.x, point.y - origin.y);
        const elapsed = now() - downAt;
        const motion = readMotion(el);
        if (!pinched && dist <= CLICK_PX && elapsed <= motion.tBase * 1000) {
            api.click(point.x, point.y);
            return;
        }
        if (!pinched && now() - lastT <= 100) inertia();
    }

    function onWheel(event: WheelEvent): void {
        event.preventDefault();
        cancelMotion();
        const point = local(event.clientX, event.clientY);
        const vp = api.getViewport();
        let pixels = event.deltaY;
        if (event.deltaMode === 1) pixels *= LINE_PX;
        else if (event.deltaMode === 2) pixels *= vp.height;
        const factor = Math.pow(WHEEL_STEP, -pixels / WHEEL_NOTCH_PX);
        api.setCamera(zoomAt(api.getCamera(), vp, point.x, point.y, factor), 'wheel');
    }

    function onKey(event: KeyboardEvent): void {
        const vp = api.getViewport();
        const cam = api.getCamera();
        const midX = vp.width / 2;
        const midY = vp.height / 2;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            cancelMotion();
            api.setCamera(panBy(cam, -vp.width * 0.15, 0), 'key');
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            cancelMotion();
            api.setCamera(panBy(cam, vp.width * 0.15, 0), 'key');
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            cancelMotion();
            api.setCamera(panBy(cam, 0, -vp.height * 0.15), 'key');
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            cancelMotion();
            api.setCamera(panBy(cam, 0, vp.height * 0.15), 'key');
        } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            cancelMotion();
            api.setCamera(zoomAt(cam, vp, midX, midY, 1.5), 'key');
        } else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            cancelMotion();
            api.setCamera(zoomAt(cam, vp, midX, midY, 1 / 1.5), 'key');
        }
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('keydown', onKey);

    return () => {
        cancelMotion();
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('keydown', onKey);
        el.style.touchAction = '';
    };
}
