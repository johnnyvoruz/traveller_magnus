/**
 * The words under a surface map: which painter drew it and, for the enhanced one, what its
 * sea is, with the reason for its ice as the tooltip. Pure.
 */
import type { SurfaceMode } from './contracts.ts';
import { seaColours, seaPlan } from './enhanced/map.ts';
import { phaseOf } from './hybrid/liquids.ts';

export type SheetCaption = {
    /** "Vanilla", or "Enhanced · Ethane". */
    text: string;
    /** The longer account, for a tooltip. */
    title: string;
};

const VANILLA_NOTE = 'The surface as the original painter draws it.';

/** One line for each 1.2.0 outcome that stores no free liquid. The words stay inside the outcome name. */
const OUTCOME_LINE: Readonly<Record<string, string>> = {
    'vacuum-above-melt': 'No sea. There is no air, and the surface is above melting.',
    'above-boiling': 'No sea. The surface is above boiling.',
    'unknown-exotic': 'No sea. No listed liquid fits this temperature.',
    'temperature-missing': 'No sea. The temperature is missing.',
};

function outcomeLine(body: Readonly<Record<string, unknown>> | null | undefined): string | null {
    if (!body || !body.liquidStatus || typeof body.liquidStatus !== 'object') return null;
    const outcome = (body.liquidStatus as { outcome?: unknown }).outcome;
    return typeof outcome === 'string' ? (OUTCOME_LINE[outcome] ?? null) : null;
}

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
        const line = outcomeLine(body);
        if (line) return { text: 'Enhanced · ' + line, title: line };
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

function oneDigit(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^[0-9A-Za-z]$/.test(value.trim())) {
        const parsed = parseInt(value.trim(), 36);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/** Hydrographics digit on the body: hydroCode, hydro, then the UWP's fourth character. */
function hydroDigit(body: Readonly<Record<string, unknown>>): number | null {
    for (const key of ['hydroCode', 'hydro']) {
        const value = oneDigit(body[key]);
        if (value !== null) return value;
    }
    return typeof body.uwp === 'string' && body.uwp.length > 3 ? oneDigit(body.uwp[3]) : null;
}

function statusOf(field: unknown): string | null {
    if (!field || typeof field !== 'object') return null;
    const status = (field as { status?: unknown }).status;
    return typeof status === 'string' ? status : null;
}

/**
 * A body has surface liquid when its hydrographics digit is above 0.
 * A digit of 0 names none, including when hydroPercent is a few percent:
 * that percent is the engine's spread inside hydrographics 0
 * (packages/engines/src/mgt2e_world_engine.js, hydro code 0).
 * With no digit, hydroPercent above 0 counts. liquidType null, and a status of none,
 * unresolved or unknown, name none. An absent liquidType keeps the digit.
 */
function hasSurfaceLiquid(body: Readonly<Record<string, unknown>> | null, fallback: boolean): boolean {
    if (!body) return fallback;
    const status = statusOf(body.liquidStatus);
    if (status === 'none' || status === 'unresolved' || status === 'unknown') return false;
    if (body.liquidType === null) return false;
    const digit = hydroDigit(body);
    if (digit === 0) return false;
    if (digit !== null && digit > 0) return true;
    const percent = body.hydroPercent;
    return typeof percent === 'number' && Number.isFinite(percent) ? percent > 0 : fallback;
}

/** The caption of a hybrid sheet. The liquid name is the body's, and the layout word is not that name. */
export function hybridCaption(model: {
    readonly world: { readonly liquid: string | null; readonly liquidAssumed: boolean; readonly tempSource: string; readonly meanK: number; readonly lowK: number; readonly highK: number };
    readonly layout: string;
    readonly seaShare: number;
    readonly hexes: readonly { readonly terrain: string }[];
}, body?: Readonly<Record<string, unknown>> | null): SheetCaption {
    const w = model.world;
    const handed = body && typeof body === 'object' ? body : null;
    const named = handed && typeof handed.liquidType === 'string' ? handed.liquidType.trim() : '';
    const because = outcomeLine(handed);
    const liquid = because ? '' : (hasSurfaceLiquid(handed, !!w.liquid)
        ? (named || (w.liquid ? w.liquid + (w.liquidAssumed ? ' (assumed)' : '') : ''))
        : '');
    const sea = because || liquid || 'no seas';
    const phase = liquid && liquid !== 'Ice' ? phaseOf(liquid) : null;
    const frozen = phase !== null && w.highK < phase.meltK ? ' · frozen' : '';
    const locked = model.layout === 'locked' ? ' · locked, night side centred' : '';
    const iced = model.hexes.filter((h) => h.terrain === 'SI' || h.terrain === 'IF' || h.terrain === 'IC').length;
    const notes = [
        'Hybrid hex map: ' + model.hexes.length + ' hexes.',
        because ? because : (liquid ? 'Sea: ' + (named || w.liquid || 'unnamed') + (w.liquidAssumed && !named ? ' (the data names no liquid; water is assumed)' : '') + '.' : 'No sea.'),
        'Ice: ' + iced + ' hexes.',
        'Temperatures: ' + (w.tempSource === 'engine' ? 'from its figures' : 'from its climate word only') + ', mean ' + Math.round(w.meanK) + ' K (' + Math.round(w.lowK) + '–' + Math.round(w.highK) + ' K).',
    ];
    return { text: 'Enhanced · ' + sea + frozen + locked, title: notes.join(' ') };
}
