/**
 * The hybrid surface map: grid → model → painted sheet, plus the overlays drawn over it.
 * The worker calls renderHybridPixels; the page builds the same model (cheap) for symbols,
 * hex data and the day and night layer. Orbit discs stay on the enhanced disc program
 * (city lights). This sheet is not sampled onto the globe.
 */
import type { HybridPaintInputs } from '../contracts.ts';
import { SHEET_LAYOUT, type SheetLayout } from './field.ts';
import type { HybridWorld } from './inputs.ts';
import { buildHybridModel, type HybridModel } from './model.ts';
import { paintHybrid } from './paint.ts';

const models = new Map<string, HybridModel>();

/** The model for a world, memoised by its data (the page asks often). */
export function hybridModel(world: HybridWorld): HybridModel {
    const key = JSON.stringify(world);
    let model = models.get(key);
    if (!model) {
        model = buildHybridModel(world);
        if (models.size > 12) models.clear();
        models.set(key, model);
    }
    return model;
}

export function renderHybridPixels(inputs: HybridPaintInputs, layout: SheetLayout = SHEET_LAYOUT): Uint8ClampedArray {
    return paintHybrid(hybridModel(inputs.world), layout);
}

export { SHEET_LAYOUT };
export type { HybridPaintInputs };
