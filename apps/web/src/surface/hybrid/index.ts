/**
 * The hybrid surface map: grid → model → painted sheet, plus the overlays drawn over it.
 * The worker calls renderHybridPixels; the page builds the same model (cheap) for symbols,
 * hex data and the day and night layer. Orbit discs stay on the enhanced disc program
 * (city lights). This sheet is not sampled onto the globe.
 *
 * A referee's painted hexes (DW2) are laid over a memoised generated model: the same world
 * and the same edits give the same model object, so the page's overlays and the painter agree.
 */
import type { HybridPaintInputs } from '../contracts.ts';
import { editedModel, editsText } from '../paint_edits.ts';
import { SHEET_LAYOUT, type SheetLayout } from './field.ts';
import type { HybridWorld } from './inputs.ts';
import { buildHybridModel, type HybridModel } from './model.ts';
import { paintHybrid } from './paint.ts';
import type { HexEdits } from './serialize.ts';

const models = new Map<string, HybridModel>();
/** Edited models by their generated base, then by the edits' text: the page asks for the same one often. */
const edited = new WeakMap<HybridModel, Map<string, HybridModel>>();

function modelKey(world: HybridWorld): string {
    return JSON.stringify(world);
}

/** The generated model with edits laid over it, memoised; the base itself when there are none. */
export function hybridModelWith(base: HybridModel, edits: HexEdits | null): HybridModel {
    const text = editsText(edits);
    if (!text) return base;
    let held = edited.get(base);
    if (!held) {
        held = new Map();
        edited.set(base, held);
    }
    let model = held.get(text);
    if (!model) {
        model = editedModel(base, edits);
        if (held.size > 4) held.clear();
        held.set(text, model);
    }
    return model;
}

/** A model already built for this world (with these edits over it), or null. Does not build one. */
export function cachedHybridModel(world: HybridWorld, edits: HexEdits | null = null): HybridModel | null {
    const base = models.get(modelKey(world));
    return base ? hybridModelWith(base, edits) : null;
}

/** Keep a generated model the page built in slices, so the next ask is the same object. */
export function rememberHybridModel(world: HybridWorld, model: HybridModel): void {
    const key = modelKey(world);
    if (models.get(key) === model) return;
    if (!models.has(key) && models.size > 12) models.clear();
    models.set(key, model);
}

/** The model for a world, memoised by its data (the page asks often), with the edits over it. */
export function hybridModel(world: HybridWorld, edits: HexEdits | null = null): HybridModel {
    const key = modelKey(world);
    let model = models.get(key);
    if (!model) {
        model = buildHybridModel(world);
        if (models.size > 12) models.clear();
        models.set(key, model);
    }
    return hybridModelWith(model, edits);
}

export function renderHybridPixels(inputs: HybridPaintInputs, layout: SheetLayout = SHEET_LAYOUT): Uint8ClampedArray {
    return paintHybrid(hybridModel(inputs.world, inputs.edits ?? null), layout);
}

export { SHEET_LAYOUT };
export type { HybridPaintInputs };
