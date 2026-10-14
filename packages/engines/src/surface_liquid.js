// Surface liquid: the one place a body's liquidType is decided (engine 1.2.0, findings/liquid_temperature_minimal.md).
//
// Called once per body, after the last write of meanTempK / highTempK / lowTempK
// (generateBiospherics, after the inherent-heat recompute). Nothing else writes liquidType
// on a MgT2E body. Inputs: atmCode, hydroPercent, meanTempK, liquidRoll (the die drawn in
// generateAtmospherics, kept so the dice stream is unchanged) and the liquid table
// rules/mgt2e_data.js atmosphereExtended.exoticLiquids (mp/bp in kelvin; Water is its row 11).
//
// Rules (handoff 198, mean temperature for ice): the Water/Ice line is the
// MEAN against Water's melting point; no free liquid above boiling or on a vacuum at or above
// melting; on atmosphere 10-12 with no listed liquid holding the mean, no label and liquidStatus
// unresolved/unknown-exotic (handoff 198); no liquidType at all when hydroPercent is 0.
import { MgT2EData } from './generated/rules/mgt2e_data.js';

const LIQUIDS = MgT2EData.atmosphereExtended.exoticLiquids;
const WATER = LIQUIDS.find(row => row.name === 'Water');

/** Rows of the liquid table whose melting..boiling window holds the temperature. */
export function liquidCandidates(tempK) {
    if (!Number.isFinite(tempK)) return [];
    return LIQUIDS.filter(row => tempK >= row.mp && tempK <= row.bp);
}

/** Abundance-weighted pick with one uniform draw u in [0,1). Same walk as engine 1.1.0. */
export function pickByAbundance(candidates, u) {
    const total = candidates.reduce((sum, row) => sum + row.abundance, 0);
    let roll = u * total;
    let winner = candidates[candidates.length - 1];
    for (const row of candidates) {
        roll -= row.abundance;
        if (roll <= 0) { winner = row; break; }
    }
    return winner;
}

export function isExoticAtmosphere(atmCode) {
    return atmCode >= 10 && atmCode <= 12;
}

/**
 * Decide w.liquidType (and w.liquidStatus when there is no named liquid) from stored temperatures.
 * draw() is called only when an exotic atmosphere has candidates and no liquidRoll was kept.
 */
export function decideSurfaceLiquid(w, draw) {
    delete w.liquidStatus;
    if (!(w.hydroPercent > 0)) {
        delete w.liquidType;
        return w;
    }
    const mean = w.meanTempK;
    if (!Number.isFinite(mean)) {
        w.liquidType = null;
        w.liquidStatus = { status: 'unknown', outcome: 'temperature-missing' };
        return w;
    }
    if (isExoticAtmosphere(w.atmCode)) {
        const candidates = liquidCandidates(mean);
        if (candidates.length === 0) {
            // No listed liquid holds the mean. Not a result: no label is stored, the status says
            // why (handoff 198 as the reconciler implements it; question Q3).
            w.liquidType = null;
            w.liquidStatus = { status: 'unresolved', outcome: 'unknown-exotic' };
            return w;
        }
        if (!Number.isFinite(w.liquidRoll)) w.liquidRoll = draw();
        w.liquidType = pickByAbundance(candidates, w.liquidRoll).name;
        return w;
    }
    // Vacuum is atmosphere 0 (rules/guideline_2_3_hydrographic_distribution.md line 9; the
    // reconciler's vacuumAtmospheres [0]). Engine 1.1.0 also counted atmosphere 1 (question Q4).
    const vacuum = w.atmCode === 0;
    if (mean < WATER.mp) {
        w.liquidType = 'Ice';
    } else if (vacuum) {
        w.liquidType = null;
        w.liquidStatus = { status: 'none', outcome: 'vacuum-above-melt' };
    } else if (mean > WATER.bp) {
        w.liquidType = null;
        w.liquidStatus = { status: 'none', outcome: 'above-boiling' };
    } else {
        w.liquidType = 'Water';
    }
    return w;
}
