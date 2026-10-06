/**
 * Enhanced city bake, step 1.
 * No cube C yet. A and B stay the vanilla bake, so a mode switch does not
 * allocate a second cube set. Later steps add passes here.
 */
import type { SurfaceMode } from '../contracts.ts';

/** Renderer version for enhanced city bakes. */
export const ENHANCED_CITY_VERSION = 'enhanced-cities-1';

/**
 * The vanilla disc program has no renderer version of its own.
 * The envelope still carries a version; this is that field for vanilla.
 */
export const VANILLA_DISC_VERSION = 'vanilla';

/** Extra bake passes. Empty in step 1: the draw program samples A and B only. */
export const ENHANCED_BAKE_PASSES: readonly string[] = [];

export function discRendererVersion(mode: SurfaceMode): string {
    return mode === 'enhanced' ? ENHANCED_CITY_VERSION : VANILLA_DISC_VERSION;
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
