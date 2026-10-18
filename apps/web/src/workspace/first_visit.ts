/**
 * Where the map opens when the address names no place (prompts/d_first_run_fixes.md item 1;
 * findings/first_run_review.md finding 1), and the one line of help a new person reads.
 *
 * A "first visit" is a browser that holds no last view: the camera is stored on this device
 * each time it comes to rest, so a returning person's bare address opens where they left the
 * map. A browser that refuses storage (a private window) holds none, and opens as a first
 * visit each time. An address that names a place, or carries a camera, always wins.
 */
import { clampPpp, type Camera } from '../map/camera.ts';
import { PPP_NAMES } from '../map/tiers.ts';

/** The camera last at rest on this device, as "x,y,ppp". */
export const LAST_VIEW_KEY = 'voyage_last_view';
/** Set once the line of help is dismissed, or a hex has been opened. */
export const HINT_KEY = 'voyage_first_hint_done';
/** Set once the welcome window has been closed or left. A signed-out first visit opens it once. */
export const WELCOME_KEY = 'voyage_welcome_shown';

/** True while the welcome window is on the map, so the hint waits until it closes. */
let welcomeCovering = false;

export function setWelcomeCovering(on: boolean): void {
    welcomeCovering = on;
}

/**
 * The welcome window opens by itself only for a signed-out browser that has not
 * stored a camera and has not already dismissed the welcome.
 */
export function welcomeDue(at: { signedIn: boolean; shown: boolean; returning: boolean }): boolean {
    return !at.signedIn && !at.shown && !at.returning;
}

/** The Regina subsector of the Spinward Marches: Regina (1910) is in view and the names can be read. */
export const FIRST_PLACE = '/s/Spinward_Marches/sub/C';
/** Regina itself: where the camera goes when the subsector, framed whole, is too small to read. */
export const FIRST_WORLD = '/s/Spinward_Marches/1910';
export const FIRST_HINT = 'Search for a world, or select a hex to read its system.';

export function viewText(cam: Camera): string {
    return cam.x.toFixed(3) + ',' + cam.y.toFixed(3) + ',' + cam.ppp.toFixed(3);
}

/** The stored view read back: null for nothing stored, or anything that is not three finite numbers. */
export function parseView(raw: string | null | undefined): Camera | null {
    if (!raw) return null;
    const parts = raw.split(',');
    if (parts.length !== 3 || parts.some((part) => part.trim() === '')) return null;
    const [x, y, ppp] = parts.map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(ppp) || ppp <= 0) return null;
    return { x, y, ppp: clampPpp(ppp) };
}

/**
 * A narrow window frames the whole subsector below the zoom where names show. Then the first
 * view is Regina, centred, at that zoom. Null when the framed subsector can be read as it is.
 */
export function firstNear(fittedPpp: number, world: Camera | null): Camera | null {
    if (!world || fittedPpp >= PPP_NAMES) return null;
    return { x: world.x, y: world.y, ppp: PPP_NAMES };
}

export type Opening = 'address' | 'last' | 'first';

/**
 * What decides the first camera of a load. `named` is an address that names a place (a
 * sector, a subsector, a hex); `linked` is a camera in the address.
 */
export function openingFor(at: { named: boolean; linked: boolean; stored: Camera | null }): Opening {
    if (at.named || at.linked) return 'address';
    return at.stored ? 'last' : 'first';
}

/**
 * The line shows until it is dismissed or a hex is opened, and only where it covers nothing a
 * person is using. It stays while the search field has focus, so Tab reaches its button from
 * the field; the list of results opens over it.
 */
export function hintShown(at: { done: boolean; chartReady: boolean; paneOpen: boolean; buildOn: boolean }): boolean {
    return !welcomeCovering && !at.done && at.chartReady && !at.paneOpen && !at.buildOn;
}
