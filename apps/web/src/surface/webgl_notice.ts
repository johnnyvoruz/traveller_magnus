/**
 * One line when this browser has no WebGL. The orbit discs are painted with
 * WebGL2. The dossier map is a 2D canvas and still paints; it shows the same
 * line so the missing textures are explained in both places.
 */
export const SURFACE_WEBGL_NOTICE = 'Planet surfaces need WebGL, which is turned off in this browser. Turn on hardware acceleration in the browser\'s settings, and then reload.';

let missing: boolean | null = null;

/** True when a page canvas cannot get a WebGL context. False where there is no document. */
export function webglMissing(): boolean {
    if (missing !== null) return missing;
    if (typeof document === 'undefined') {
        missing = false;
        return false;
    }
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        missing = !gl;
    } catch {
        missing = true;
    }
    return missing;
}
