/**
 * Links the enhanced draw program in the disc worker.
 * The vanilla baker still compiles its own programs. This swaps only the draw
 * program, and only when the mode or version changes. Cube C is not allocated
 * (ENHANCED_BAKE_PASSES is empty), so the vanilla cubes stay the one set.
 */
import type { SurfaceMode } from '../contracts.ts';
import type { DiscBaker } from '../vanilla/gl.ts';
import { linkDiscProgram } from '../vanilla/gl.ts';
import { DRAW_FRAG } from '../vanilla/gl_shade.ts';
import { ENHANCED_BAKE_PASSES, discResourceKey } from './bake.ts';
import { ENHANCED_DRAW_FRAG } from './draw.ts';

let mountedKey = '';

export function resetDiscProgram(): void {
    mountedKey = '';
}

/** Prepare the draw program for this mode. A no-op when that program is already current. */
export function mountDiscProgram(baker: DiscBaker, mode: SurfaceMode, version: string): void {
    const revision = ENHANCED_BAKE_PASSES.length === 0 ? 'baseline' : 'cities';
    const key = discResourceKey('draw-program', revision, mode, version, 0);
    if (mountedKey === key) return;
    if (!baker.ready()) return;
    const gl = baker.gl();
    if (!gl) return;
    // The baker's first link is already the vanilla baseline. Claiming it
    // avoids a second compile and a second resident program.
    if (mountedKey === '' && mode === 'vanilla') {
        mountedKey = key;
        return;
    }
    const source = mode === 'enhanced' ? ENHANCED_DRAW_FRAG : DRAW_FRAG;
    baker.bindDraw(linkDiscProgram(gl, source));
    mountedKey = key;
}
