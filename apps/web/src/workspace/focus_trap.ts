/**
 * Where Tab goes inside a dialog that holds focus while it is open: from the last control
 * forward to the first, from the first back to the last, and from anywhere outside to the first
 * (or, going back, the last). Null leaves the step to the browser.
 * Same steps as the orbit picker (workspace/build/orbit_pick.ts). Copied here so the Lightbox
 * does not import from build/.
 */
export function wrapFocus(count: number, index: number, back: boolean): number | null {
    if (count === 0) return null;
    if (index < 0) return back ? count - 1 : 0;
    if (!back && index >= count - 1) return 0;
    if (back && index <= 0) return count - 1;
    return null;
}
