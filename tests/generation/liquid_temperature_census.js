// Census of the six liquid/temperature invariants, engine 1.2.0 (findings/liquid_temperature_minimal.md).
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';
import { MgT2EMath } from '../../packages/engines/src/mgt2e_math.js';
import { reconcileTree, environmentPolicy } from '../../packages/engines/src/reconcile_environment.js';

const LIQ = MgT2EData.atmosphereExtended.exoticLiquids;
const WATER = LIQ.find(l => l.name === 'Water');
const TC = MgT2EData.tradeCodes;
const hex = c => (c == null ? NaN : parseInt(String(c), 36));
const fin = x => typeof x === 'number' && Number.isFinite(x);

export function* bodies(sys) {
    for (const w of sys.worlds || []) {
        yield { b: w, parent: null };
        for (const m of w.moons || []) yield { b: m, parent: w };
    }
}

function tradeAllowed(code, d) {
    const r = TC[code];
    if (!r) return true;
    const chk = (k, v) => {
        const lo = r['min' + k], hi = r['max' + k];
        if (lo !== undefined && !(v >= lo)) return false;
        if (hi !== undefined && !(v <= hi)) return false;
        return true;
    };
    if (!chk('Size', d.size) || !chk('Atm', d.atm) || !chk('Hydro', d.hydro) || !chk('Pop', d.pop) || !chk('Gov', d.gov) || !chk('Law', d.law) || !chk('Tl', d.tl)) return false;
    if (r.validAtms && !r.validAtms.includes(d.atm)) return false;
    if (r.atmRanges && !r.atmRanges.some(([a, b]) => d.atm >= a && d.atm <= b)) return false;
    return true;
}

/** Expected liquid class at a stored mean: the verdict the census holds the body to. */
export function liquidVerdict(b) {
    const mean = b.meanTempK;
    const L = b.liquidType;
    const hasHydro = (b.hydroCode || 0) > 0 || (b.hydroPercent || 0) > 0;
    if (!hasHydro) return null;
    if (L == null) {
        const st = b.liquidStatus && b.liquidStatus.status;
        if (st === 'none') return 'OK:none-' + b.liquidStatus.outcome;
        if (st === 'unresolved' && b.liquidStatus.outcome === 'unknown-exotic') return 'I4R:unknown-exotic-counted';
        return 'I4:missing-liquidType';
    }
    if (L === 'Unknown Exotic Liquid') return (b.liquidStatus && b.liquidStatus.status === 'unresolved') ? 'I4R:unknown-exotic-counted' : 'I4:unknown-exotic';
    if (!fin(mean)) return 'I4:nonfinite-mean';
    if (L === 'None' || L === 'No free liquid') return null;
    if (L === 'Water') {
        if (b.atmCode === 0) return 'I2:water-on-vacuum';
        if (mean < WATER.mp) return 'I3:water-below-melt';
        if (mean > WATER.bp) return 'I2:water-above-boil';
        return null;
    }
    if (L === 'Ice') {
        if (mean >= WATER.mp) return b.atmCode === 0 ? 'I3:ice-vacuum-at-or-above-melt' : 'I3:ice-mean-above-melt';
        return null;
    }
    const row = LIQ.find(l => l.name === L);
    if (!row) return 'I4:unlisted-liquid';
    if (mean < row.mp) return 'I2:exotic-below-melt';
    if (mean > row.bp) return 'I2:exotic-above-boil';
    return null;
}

/** I5: one formula reproduces stored mean from stored inputs (primary lum, au, albedo, greenhouse, inherent). */
function tempRecompute(b, parent, sys) {
    const lum = (sys.stars && sys.stars[0] && sys.stars[0].lum) || 1.0;
    const au = b.au || (parent ? parent.au : 0);
    if (!fin(b.albedo) || !fin(b.greenhouseFactor) || !(au > 0)) return null;
    const solar = MgT2EMath.calculateMeanTemperature(lum, au, b.albedo, b.greenhouseFactor);
    const inh = b.seismicStress || 0;
    return Math.pow(Math.pow(solar, 4) + Math.pow(inh, 4), 0.25) + (b.bandHoldK || 0);
}

export function censusHex(hexKey, env, chartRow) {
    const out = [];
    const body = env.body;
    const sys = body.mgtSystem;
    if (!sys) return out;
    const mw = body.mgt2eData;
    const add = (inv, cause, b, extra) => out.push({ hexKey, inv, cause, name: b && b.name, type: b && b.type, ...extra });
    // I1
    const chart = chartRow && chartRow.t5Data;
    if (chart && mw && typeof chart.uwp === 'string' && chart.uwp.length >= 9) {
        const u = chart.uwp;
        const d = { size: hex(u[1]), atm: hex(u[2]), hydro: hex(u[3]), pop: hex(u[4]), gov: hex(u[5]), law: hex(u[6]), tl: hex(u[8]) };
        const lunar = mw.isLunarMainworld === true;
        if (mw.atmCode !== d.atm) add('I1', lunar ? 'atm-not-chart:lunar' : 'atm-not-chart:planet', mw, { chart: u, atmCode: mw.atmCode });
        if (mw.hydroCode !== d.hydro) add('I1', lunar ? 'hydro-not-chart:lunar' : 'hydro-not-chart:planet', mw, { chart: u, hydroCode: mw.hydroCode });
        if (mw.uwp !== u) add('I1', 'uwp-string-not-chart', mw, { chart: u, uwp: mw.uwp });
        for (const c of mw.tradeCodes || []) if (!tradeAllowed(c, d)) add('I1', 'trade-code-forbidden:' + c, mw, { chart: u });
    }
    for (const { b, parent } of bodies(sys)) {
        if (!b || b.type === 'Empty') continue;
        const isGG = b.type === 'Gas Giant' || b.size === 'GG';
        // I4 non-finite temperature on any solid body
        if (!isGG && b.type !== 'Planetoid Belt') {
            for (const k of ['meanTempK']) if (!fin(b[k])) add('I4', 'nonfinite-' + k, b, {});
        }
        const v = isGG ? null : liquidVerdict(b);
        if (v) {
            const [inv, cause] = v.split(':');
            if (inv === 'OK') { add('OK', cause, b, {}); continue; }
            add(inv, cause, b, { liquid: b.liquidType, meanK: b.meanTempK, highK: b.highTempK, atmCode: b.atmCode, mainworld: b === mw });
        }
        // I5 ordering + one formula
        if (!isGG && b.type !== 'Planetoid Belt' && fin(b.meanTempK)) {
            if (fin(b.highTempK) && b.highTempK + 1e-9 < b.meanTempK) add('I5', 'high-below-mean', b, {});
            if (fin(b.lowTempK) && b.lowTempK - 1e-9 > b.meanTempK) add('I5', 'low-above-mean', b, {});
            const r = tempRecompute(b, parent, sys);
            if (r != null && Math.abs(r - b.meanTempK) > 1e-6 * Math.max(1, r)) add('I5', 'mean-not-one-formula', b, { stored: b.meanTempK, recomputed: r });
        }
    }
    // I3 readers: the reconciler must not change a liquid the engine decided.
    try {
        const r = reconcileTree(env, environmentPolicy);
        const at = (p) => p.split(/\.|\[|\]/).filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), sys);
        for (const ch of r.changes) {
            const tb = at(ch.path);
            if (tb && (tb.type === 'Gas Giant' || tb.size === 'GG')) { if (ch.field === 'liquidStatus') add('OK', 'gas-giant-satellite-hydroPercent-null', tb, {}); continue; }
            if (ch.field === 'liquidType' && (ch.before === null || ch.before === undefined) && ch.after === null) continue;
            if (ch.field === 'liquidType') add('I3', 'reconciler-rewrites-liquidType:' + String(ch.before) + '->' + String(ch.after), null, { path: ch.path });
            if (ch.field === 'liquidStatus' && ch.after && ch.after.status !== 'known' && !(ch.after.status === 'none' && ch.after.outcome === 'zero') && !(ch.after.status === 'unresolved' && ch.after.outcome === 'unknown-exotic')) add('I3', 'reconciler-status:' + ch.after.status + '-' + ch.after.outcome, null, { path: ch.path });
        }
    } catch (e) { add('I3', 'reconciler-threw', null, { msg: e.message }); }
    return out;
}

/** Headline: mainworlds whose chart atm is 2-9 and chart hydro >0, and whose stored liquid is not Water. */
export function headline(env, chartRow) {
    const chart = chartRow && chartRow.t5Data; const mw = env.body.mgt2eData;
    if (!chart || !mw || typeof chart.uwp !== 'string') return null;
    const a = hex(chart.uwp[2]), h = hex(chart.uwp[3]);
    if (!(a >= 2 && a <= 9 && h > 0)) return null;
    return { a49: a >= 4,  water: mw.liquidType === 'Water', liquid: mw.liquidType, meanK: mw.meanTempK };
}

