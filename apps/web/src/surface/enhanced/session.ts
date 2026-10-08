/**
 * Links the enhanced draw program in the disc worker and installs cube C.
 * The vanilla baker still compiles its own programs. The draw program swaps
 * only when the mode or version changes. Cube C is installed for enhanced
 * and cleared for vanilla. Vanilla cubes are left in place.
 */
import type { SurfaceMode } from '../contracts.ts';
import type { DiscBaker } from '../vanilla/gl.ts';
import { linkDiscProgram } from '../vanilla/gl.ts';
import { DRAW_FRAG } from '../vanilla/gl_shade.ts';
import { ENHANCED_BAKE_PASSES, discResourceKey } from './bake.ts';
import { CITY_BAKE_FRAG, createCityBake, type CityBake } from './city_cube.ts';
import { ENHANCED_DRAW_FRAG } from './draw.ts';

const mounted = new WeakMap<DiscBaker, string>();
let epoch = 0;
let cityBake: CityBake | null = null;
let cityGl: WebGL2RenderingContext | null = null;

function cityFor(gl: WebGL2RenderingContext): CityBake {
    if (cityBake && cityGl === gl) return cityBake;
    cityBake = createCityBake(gl, linkDiscProgram(gl, CITY_BAKE_FRAG));
    cityGl = gl;
    return cityBake;
}

export function resetDiscProgram(): void {
    epoch += 1;
    cityBake = null;
    cityGl = null;
}

/** Prepare the draw program for this mode. A no-op when that baker already has it. */
export function mountDiscProgram(baker: DiscBaker, mode: SurfaceMode, version: string): void {
    if (!baker.ready()) return;
    const gl = baker.gl();
    if (!gl) return;
    baker.setCityPass(mode === 'enhanced' ? cityFor(gl) : null);
    const revision = ENHANCED_BAKE_PASSES.length === 0 ? 'baseline' : 'cities';
    const key = String(epoch) + '|' + discResourceKey('draw-program', revision, mode, version, 0);
    if (mounted.get(baker) === key) return;
    // This baker's first link is already the vanilla baseline. Claiming it
    // avoids a second compile and a second resident program.
    if (!mounted.has(baker) && mode === 'vanilla') {
        mounted.set(baker, key);
        return;
    }
    const source = mode === 'enhanced' ? ENHANCED_DRAW_FRAG : DRAW_FRAG;
    baker.bindDraw(linkDiscProgram(gl, source));
    mounted.set(baker, key);
}
