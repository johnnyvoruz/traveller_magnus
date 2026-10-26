/**
 * The builder values that need no zod. `schemas/builder.ts` re-exports them.
 */

/**
 * Pairs `generateHex` actually runs today.
 * Mongoose goes through `buildOne`, which generates top down.
 * Architect of Worlds goes through `generateAoWSystemBottomUp`.
 * The other editions, and the other pairing of these two, are not offered.
 */
export function builderPairReady(edition: string, generator: string): boolean {
    return (edition === 'MgT2E' && generator === 'top-down')
        || (edition === 'AoW' && generator === 'bottom-up');
}
