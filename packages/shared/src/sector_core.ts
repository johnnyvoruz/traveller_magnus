/**
 * The sector values that need no zod. `schemas/sector.ts` builds its enum from this list and
 * re-exports it.
 */
export const SUBSECTOR_LETTERS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
    'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
] as const;
export type SubsectorLetter = (typeof SUBSECTOR_LETTERS)[number];
