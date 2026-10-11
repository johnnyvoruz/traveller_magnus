/**
 * Motion for the hybrid map's day and night layer: the sun's place shown on screen, eased
 * toward the clock's, and the fades between layer states. Pure: the stage hands in the time
 * (ms) and the clock's subsolar point each frame; nothing here touches the page.
 *
 * - While the clock runs, the shown sun is the clock's sun, frame by frame (the clock is
 *   continuous, so the terminator glides).
 * - A jump (a typed date, Now, a drag of the orbit view's timeline) is not shown as a pop:
 *   the sun travels from where it stands to the new place over JUMP_TWEEN_MS, eased, by the
 *   short way round in longitude. A clock that keeps running during the tween is followed.
 * - Under reduced motion there is no tween and no fade: the sun is where the clock says, and
 *   a running clock is drawn at most once every REDUCED_STEP_MS.
 */

/** A jump's travel time. */
export const JUMP_TWEEN_MS = 750;
/** The crossfade into and out of the day-averaged shading. */
export const AVERAGE_FADE_MS = 650;
/** Under reduced motion a running clock redraws this often, no more. */
export const REDUCED_STEP_MS = 1000;
/** A move this much larger than the clock's own step in one frame counts as a jump. */
export const JUMP_SLACK_DEG = 4;

/** Ease in and out (cubic). 0 → 0, 1 → 1, never outside [0, 1], never decreasing. */
export function easeInOutCubic(t: number): number {
    const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** A longitude in (−180, 180]. */
export function wrapLon(deg: number): number {
    const w = ((deg + 180) % 360 + 360) % 360 - 180;
    return w === -180 ? 180 : w;
}

/** The short way from one longitude to another, degrees in (−180, 180]. */
export function lonDelta(from: number, to: number): number {
    return wrapLon(to - from);
}

export type SunPose = { readonly lat: number; readonly lon: number };

/** Great-circle angle between two poses, degrees. */
export function angleBetween(a: SunPose, b: SunPose): number {
    const r = Math.PI / 180;
    const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
    return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}

/** The pose a share t of the way from a to b: latitude straight, longitude the short way round. */
export function lerpPose(a: SunPose, b: SunPose, t: number): SunPose {
    const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
    return { lat: a.lat + (b.lat - a.lat) * k, lon: wrapLon(a.lon + lonDelta(a.lon, b.lon) * k) };
}

export type SunMotion = {
    /**
     * The pose to draw at time nowMs for the clock's pose. expectedStepDeg is how far the
     * clock alone moves the sun in this frame (0 when stopped); jumped says the clock was
     * set (a typed date or Now).
     */
    step(target: SunPose, nowMs: number, expectedStepDeg: number, jumped: boolean): SunPose;
    /** True while a jump is being travelled. */
    readonly tweening: boolean;
    /** Forget the shown pose (a new body): the next step shows its target at once. */
    reset(): void;
};

export function createSunMotion(options: { reducedMotion: boolean; tweenMs?: number }): SunMotion {
    const tweenMs = options.tweenMs ?? JUMP_TWEEN_MS;
    let shown: SunPose | null = null;
    let from: SunPose | null = null;
    let began = 0;
    return {
        step(target, nowMs, expectedStepDeg, jumped) {
            if (!shown || options.reducedMotion) {
                shown = target;
                from = null;
                return shown;
            }
            const far = angleBetween(shown, target) > 2 * Math.max(0, expectedStepDeg) + JUMP_SLACK_DEG;
            if (jumped || (!from && far)) {
                from = shown;
                began = nowMs;
            }
            if (from) {
                const t = (nowMs - began) / tweenMs;
                if (t >= 1) {
                    from = null;
                    shown = target;
                } else {
                    shown = lerpPose(from, target, easeInOutCubic(t));
                }
                return shown;
            }
            shown = target;
            return shown;
        },
        get tweening() { return from !== null; },
        reset() {
            shown = null;
            from = null;
        },
    };
}

export type Fade = {
    /** Where the fade is heading: 0 or 1 (or anything between). */
    set(target: number, nowMs: number): void;
    /** The eased value at nowMs. */
    value(nowMs: number): number;
    /** True while the value is still moving. */
    moving(nowMs: number): boolean;
};

/** A value that travels to its target in a fixed time, eased; at once under reduced motion. */
export function createFade(initial: number, ms: number, reducedMotion: boolean): Fade {
    let start = initial;
    let target = initial;
    let began = 0;
    const raw = (nowMs: number): number => {
        if (reducedMotion || ms <= 0) return target;
        const t = (nowMs - began) / ms;
        return t >= 1 ? target : start + (target - start) * easeInOutCubic(t);
    };
    return {
        set(next, nowMs) {
            if (next === target) return;
            start = raw(nowMs);
            target = next;
            began = nowMs;
        },
        value: raw,
        moving(nowMs) {
            return !reducedMotion && ms > 0 && nowMs - began < ms && start !== target;
        },
    };
}

/** Whether a running clock should be drawn now. Every frame, or once a step under reduced motion. */
export function frameDue(lastDrawnMs: number | null, nowMs: number, reducedMotion: boolean): boolean {
    if (lastDrawnMs === null || !reducedMotion) return true;
    return nowMs - lastDrawnMs >= REDUCED_STEP_MS;
}

/** Degrees the clock alone moves the subsolar longitude in dtMs at rate days per second. */
export function clockStepDeg(rate: number, solarDayHours: number | null, playing: boolean, dtMs: number): number {
    if (!playing || !solarDayHours || !(solarDayHours > 0)) return 0;
    return Math.abs(rate) * (24 / solarDayHours) * 360 * Math.max(0, dtMs) / 1000;
}
