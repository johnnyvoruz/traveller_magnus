/**
 * Enhanced city bake, step 3.
 * A and B stay the vanilla bake. Cube C is a later pass on the enhanced path.
 */
import type { SurfaceMode } from '../contracts.ts';
import { cityLook } from './city_look.ts';

/** Renderer version family. The live string also names the look, so a change rebakes C. */
export const ENHANCED_CITY_VERSION = 'enhanced-cities-4b';

/**
 * The vanilla disc program has no renderer version of its own.
 * The envelope still carries a version; this is that field for vanilla.
 */
export const VANILLA_DISC_VERSION = 'vanilla';

/** Extra bake passes. C is the city cube. */
export const ENHANCED_BAKE_PASSES: readonly string[] = ['C'];

export function discRendererVersion(mode: SurfaceMode): string {
    return mode === 'enhanced' ? ENHANCED_CITY_VERSION + '-' + cityLook().id : VANILLA_DISC_VERSION;
}

/**
 * Resource identity. Body id and source revision are the released body's.
 * Resolution is the cube face, or 0 for the draw program.
 */
export function discResourceKey(
    bodyId: string,
    revision: string,
    mode: SurfaceMode,
    version: string,
    resolution: number,
): string {
    return bodyId + '|' + revision + '|' + mode + '|' + version + '|' + String(resolution);
}
