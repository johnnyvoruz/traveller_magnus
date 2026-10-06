/**
 * Enhanced city draw program, step 1.
 * The source is the existing disc geometry and fields (vanilla DRAW_FRAG).
 * It is linked as its own program. This file does not rewrite or patch that
 * source. Later steps replace this module; they do not edit vanilla/gl_shade.ts.
 */
import { DRAW_FRAG } from '../vanilla/gl_shade.ts';

export const ENHANCED_DRAW_FRAG = DRAW_FRAG;
