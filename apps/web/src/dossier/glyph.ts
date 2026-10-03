/**
 * Which disc BodyGlyph draws for a dossier glyph (model.ts).
 * Star colour is the spectral letter the tree stored on sType.
 * Worlds and moons share the barren disc until the orbit view supplies a surface family.
 */
import type { BodyGlyphData } from './model.ts';

export type GlyphKind = 'star' | 'gas' | 'belt' | 'world';
export type Glyph = { kind: GlyphKind; tone: string };

const TONE = /^(?:bd|[obafgkmd])$/;

/** Presentation kind. gasGiant draws the banded disc; moon draws the same disc as a world. */
export function glyphFor(glyph: BodyGlyphData): Glyph {
    if (glyph.kind === 'star') {
        const tone = glyph.star.trim().toLowerCase();
        return { kind: 'star', tone: TONE.test(tone) ? tone : '' };
    }
    if (glyph.kind === 'gasGiant') return { kind: 'gas', tone: '' };
    if (glyph.kind === 'belt') return { kind: 'belt', tone: '' };
    return { kind: 'world', tone: '' };
}
