/**
 * The words under a surface map: which painter drew it and, for the enhanced one, what its
 * sea is, with the reason for its ice as the tooltip. Pure.
 */
import type { SurfaceMode } from './contracts.ts';
import { seaColours, seaPlan } from './enhanced/map.ts';

export type SheetCaption = {
    /** "Vanilla", or "Enhanced · Ethane". */
    text: string;
    /** The longer account, for a tooltip. */
    title: string;
};

const VANILLA_NOTE = 'The surface as the original painter draws it.';

function percent(cover: number | null): string {
    if (cover == null) return 'no cover given';
    return String(Number((cover * 100).toFixed(1))) + '% cover';
}

/** The caption for a sheet of this body in this mode. */
export function sheetCaption(mode: SurfaceMode, body: Readonly<Record<string, unknown>> | null | undefined): SheetCaption {
    if (mode === 'vanilla') return { text: 'Vanilla', title: VANILLA_NOTE };
    const plan = seaPlan(body);
    const sea = plan.sea;
    if (sea.coverage == null || !(sea.coverage > 0)) {
        return { text: 'Enhanced · no seas', title: 'No sea: ' + plan.why + '.' };
    }
    if (sea.liquid === null) {
        const what = plan.named ? plan.named : 'no liquid named';
        return {
            text: 'Enhanced · ' + what + ', not drawn',
            title: 'Sea: ' + percent(sea.coverage) + ', but ' + plan.why + '. No sea colour is invented; its basins are drawn as dry lowland.',
        };
    }
    if (seaColours(sea.liquid) === null) {
        return {
            text: 'Enhanced · ' + sea.liquid + ', not drawn',
            title: 'Sea: ' + percent(sea.coverage) + ' of ' + sea.liquid + '. There is no colour for it yet, so its basins are drawn as dry lowland.',
        };
    }
    if (sea.liquid === 'Unknown Exotic Liquid') {
        const unresolved = plan.why === 'the liquid is unresolved';
        const note = unresolved ? 'the liquid is unresolved' : 'exotic liquid; freezing point unknown';
        return {
            text: 'Enhanced · Unknown Exotic Liquid, ' + note,
            title: 'Sea: ' + percent(sea.coverage) + ' of Unknown Exotic Liquid: ' + note + '. No ice is drawn.',
        };
    }
    const ice = sea.ice;
    const state = ice.kind === 'all' ? ', frozen'
        : ice.kind === 'caps' ? ', ice from ' + String(Math.round(ice.fromLatDeg)) + '°'
            : '';
    return {
        text: 'Enhanced · ' + sea.liquid + state,
        title: 'Sea: ' + percent(sea.coverage) + ' of ' + sea.liquid + '. Sea ice: ' + ice.kind + ' (' + plan.why + ').',
    };
}

/** The caption of a hybrid sheet (the enhanced mode's map): its sea, its layout and how it was made. */
export function hybridCaption(model: {
    readonly world: { readonly liquid: string | null; readonly liquidAssumed: boolean; readonly tempSource: string; readonly meanK: number; readonly lowK: number; readonly highK: number };
    readonly layout: string;
    readonly seaShare: number;
    readonly hexes: readonly { readonly terrain: string }[];
}): SheetCaption {
    const w = model.world;
    const sea = w.liquid ? w.liquid + (w.liquidAssumed ? ' (assumed)' : '') : 'no seas';
    const layout = model.layout === 'normal' ? '' : model.layout === 'locked' ? ' · locked, night side centred' : ' · ' + model.layout;
    const iced = model.hexes.filter((h) => h.terrain === 'SI' || h.terrain === 'IF' || h.terrain === 'IC').length;
    const notes = [
        'Hybrid hex map: ' + model.hexes.length + ' hexes.',
        w.liquid ? 'Sea: ' + Math.round(model.seaShare * 100) + '% of the surface, ' + w.liquid + (w.liquidAssumed ? ' (the data names no liquid; water is assumed)' : '') + '.' : 'No sea.',
        'Ice: ' + iced + ' hexes.',
        'Temperatures: ' + (w.tempSource === 'engine' ? 'engine' : 'climate word only') + ', mean ' + Math.round(w.meanK) + ' K (' + Math.round(w.lowK) + '–' + Math.round(w.highK) + ' K).',
    ];
    return { text: 'Enhanced · ' + sea + layout, title: notes.join(' ') };
}
