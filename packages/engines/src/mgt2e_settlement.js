/**
 * Handbook procedures that sit inside extended socioeconomics.
 * City populations (pp.153–154), tariffs (p.192), traffic (p.198),
 * docking (p.199), and shipyard capacity (p.200).
 * Names, unusual-city types, freeports, and private ports are not rolled.
 */
import { tResult, tDM, tRoll1D, tRoll2D, tRoll3D } from './core/trace.js';

function roundUp100(value) {
    return Math.ceil(value / 100) * 100;
}

/**
 * Major-city count is the existing case list. Case 5 rounds up.
 * Per-city populations follow. An unspecified variance is not rolled.
 */
export function determineMajorCities({ pop, pcr, urbanPercent, totalUrbanPop }) {
    let majorCities = 0;
    let totalMajorCityPop = 0;
    let cities = [];
    let largestCityPop = 0;

    if (pcr === 0) {
        majorCities = 0;
        totalMajorCityPop = 0;
        tResult('City Formula', 'PCR 0 forces 0 cities');
        const capRoll = tRoll1D('Largest city cap');
        const cap = (capRoll + 2) * 10000;
        largestCityPop = Math.min(totalUrbanPop / 100, cap);
        if (largestCityPop < 100) {
            const few = tRoll1D('Largest city few');
            largestCityPop = Math.max(totalUrbanPop / 10, few + 1);
        }
        tResult('Largest City Pop', largestCityPop);
    } else if (pop <= 5 && pcr === 9) {
        majorCities = 1;
        totalMajorCityPop = totalUrbanPop;
        tResult('City Formula', 'Small Pop + PCR 9 forces 1 city');
    } else if (pop <= 5 && pcr >= 1 && pcr <= 8) {
        majorCities = Math.min(9 - pcr, pop);
        totalMajorCityPop = totalUrbanPop;
        tResult('City Formula', `Small Pop + PCR 1-8: min(9 - PCR(${pcr}), PopCode(${pop})) = ${majorCities}`);
    } else if (pop >= 6 && pcr === 9) {
        const mCRoll = tRoll2D('Major Cities Roll (2D)');
        majorCities = Math.max(pop - mCRoll, 1);
        totalMajorCityPop = totalUrbanPop;
        tResult('City Formula', `Pop 6+ + PCR 9: max(PopCode(${pop}) - Roll(${mCRoll}), 1) = ${majorCities}`);
    } else {
        const mCRoll = tRoll2D('Major Cities Roll (2D)');
        const urbanFactor = ((urbanPercent / 100) * 20) / pcr;
        const cityFormula = mCRoll - pcr + urbanFactor;
        majorCities = Math.max(1, Math.ceil(cityFormula));
        const shareRoll = tRoll1D('Major city population share');
        const rawPop = (pcr / (shareRoll + 7)) * totalUrbanPop;
        totalMajorCityPop = Math.ceil(Math.max(0, rawPop));
        tResult('City Formula', `Pop 6+ + PCR 1-8: Roll(${mCRoll}) - PCR(${pcr}) + urban factor ${urbanFactor.toFixed(2)} = ${cityFormula.toFixed(2)} -> ${majorCities}`);
        tResult('Total Major City Pop Formula', `${pcr} / (${shareRoll}+7) x ${totalUrbanPop} -> ${totalMajorCityPop}`);
    }

    if (majorCities === 1) {
        cities = [{ pop: totalMajorCityPop }];
    } else if (majorCities >= 2 && majorCities <= 3) {
        cities = shareTwoOrThree(totalMajorCityPop, majorCities);
    } else if (majorCities >= 4) {
        cities = shareChunks(totalMajorCityPop, majorCities, pcr);
    }
    if (cities.length) {
        largestCityPop = cities.reduce((max, city) => Math.max(max, city.pop), 0);
    }

    tResult('Major Cities Count', majorCities);
    tResult('Total Major City Pop', totalMajorCityPop);
    return { majorCities, totalMajorCityPop, cities, largestCityPop };
}

function shareTwoOrThree(total, n) {
    const minEach = total * 0.01;
    const pops = [];
    let remaining = total;
    for (let i = 0; i < n; i++) {
        let pop;
        if (i === n - 1) {
            pop = remaining;
        } else {
            const roll = tRoll1D('City share');
            const base = i === 0 ? total : remaining;
            pop = (roll + 3) * 0.1 * base;
        }
        const reserve = minEach * (n - 1 - i);
        if (pop < minEach) pop = minEach;
        if (pop > remaining - reserve) pop = Math.max(0, remaining - reserve);
        pops.push(pop);
        remaining -= pop;
    }
    if (remaining > 0 && pops.length) pops[0] += remaining;
    return pops.map((pop) => ({ pop }));
}

function shareChunks(total, n, pcr) {
    const pool = 100 - n;
    let chunkSize = pcr;
    let chunks = chunkSize > 0 ? Math.floor(pool / chunkSize) : 0;
    if (chunks < 2 * n) {
        chunkSize = Math.floor(pool / (2 * n));
        if (chunkSize < 1) chunkSize = 1;
        chunks = Math.floor(pool / chunkSize);
    }
    const held = pool - chunks * chunkSize;
    const extra = new Array(n).fill(0);
    let next = 0;
    let left = chunks;
    while (left > 0) {
        const city = next % n;
        const roll = tRoll1D('City chunks');
        const give = Math.min(roll, left);
        extra[city] += give;
        left -= give;
        next += 1;
    }
    const percents = extra.map((count) => 1 + count * chunkSize);
    if (held > 0) percents[next % n] += held;
    const onePercent = total / 100;
    return percents
        .map((percent, index) => ({ pop: percent * onePercent, index }))
        .sort((a, b) => b.pop - a.pop || a.index - b.index)
        .map((city) => ({ pop: city.pop }));
}

function imperialAllegiance(code) {
    const text = String(code || '').trim();
    return text === 'Im' || text.startsWith('Im');
}

/** One world rate. A foreign-polity or class restriction rolls the percent again with 1D+5 and no modifiers. */
export function rollTariff({ gov, law, xenophilia, portWtnMod, allegiance, freeport }) {
    let roll = tRoll2D('Tariff');
    let dm = 0;
    if (gov === 0) { tDM('Government 0', -7); dm -= 7; }
    if (gov === 2 || gov === 4) { tDM('Government 2 or 4', -4); dm -= 4; }
    if (gov === 9) { tDM('Government 9', 2); dm += 2; }
    if (law >= 9) { tDM('Law 9+', 2); dm += 2; }
    if (freeport) { tDM('Freeport', -7); dm -= 7; }
    if (xenophilia >= 1 && xenophilia <= 3) { tDM('Xenophilia 1-3', 2); dm += 2; }
    if (xenophilia >= 9) { tDM('Xenophilia 9+', -2); dm -= 2; }
    if (portWtnMod) { tDM('WTN starport modifier', -portWtnMod); dm -= portWtnMod; }
    if (imperialAllegiance(allegiance)) { tDM('Third Imperium', -6); dm -= 6; }
    const total = roll + dm;
    let restriction = null;
    let row = total;
    if (total === 4 || total === 5) {
        restriction = total === 4 ? 'foreign-polity' : 'class-on-8+';
        row = tRoll1D('Tariff rate') + 5;
    }
    const percent = tariffPercent(row);
    const regimen = restriction || tariffRegimen(row);
    tResult('Tariff', `${regimen} ${percent}%`);
    return { roll: total, regimen, percent, restriction };
}

function tariffRegimen(row) {
    if (row <= 3) return 'free';
    if (row === 6) return 'low';
    if (row === 7) return 'moderate';
    if (row <= 9) return 'varying';
    if (row <= 11) return 'high';
    if (row <= 13) return 'extreme';
    return 'prohibitive';
}

function tariffPercent(row) {
    if (row <= 5) return 0;
    if (row === 6) return tRoll1D('Tariff percent');
    if (row === 7) return tRoll2D('Tariff percent');
    if (row <= 9) return tRoll1D('Tariff percent') * tRoll1D('Tariff percent');
    if (row <= 11) return tRoll2D('Tariff percent') * 5;
    if (row <= 13) return tRoll2D('Tariff percent') * 10;
    return tRoll2D('Tariff percent') * 20;
}

const TRAFFIC = [
    { min: 6, max: Infinity, weekly: 2000, cap: 365, roll: () => tRoll3D('Daily traffic') * 20 + tRoll2D('Daily traffic extra') - 7 },
    { min: 5, max: 5, weekly: 1000, cap: 185, roll: () => tRoll3D('Daily traffic') * 10 + tRoll2D('Daily traffic extra') - 7 },
    { min: 4, max: 4, weekly: 150, cap: 22, roll: () => tRoll2D('Daily traffic') + 10 },
    { min: 3, max: 3, weekly: 30, cap: 7, roll: () => tRoll2D('Daily traffic') - 5 },
    { min: 2, max: 2, weekly: 20, cap: 4, roll: () => tRoll1D('Daily traffic') - 2 },
    { min: 1, max: 1, weekly: 10, cap: 3, roll: () => tRoll1D('Daily traffic') - 3 },
    { min: 0, max: 0, weekly: 5, cap: 2, roll: () => tRoll1D('Daily traffic') - 4 },
    { min: -1, max: -1, weekly: 3, cap: 1, roll: () => tRoll1D('Daily traffic') - 5 },
    { min: -2, max: -2, weekly: 2, cap: 1, roll: () => tRoll2D('Daily traffic') - 11 },
    { min: -Infinity, max: -3, weekly: 1, cap: 1, roll: () => tRoll2D('Daily traffic') - 11 },
];

function trafficFor(importance) {
    return TRAFFIC.find((row) => importance >= row.min && importance <= row.max) || TRAFFIC[TRAFFIC.length - 1];
}

function dockingTons(baseTons, factor, importance, weekly, pop, efficiency) {
    const imp = importance < 1 ? 1 : importance;
    const die = tRoll1D('Docking');
    const raw = baseTons + imp * weekly * factor * pop * (1 + (die + efficiency) / 5);
    return roundUp100(raw);
}

const DOCK = {
    A: { base: 100000, factor: 500 },
    B: { base: 50000, factor: 500 },
    C: { base: 20000, factor: 200 },
    D: { base: 500, factor: 100 },
    E: { base: 400, factor: 100 },
};

const YARD_LISTED = { A: 25000, B: 10000, C: 200 };

function yardBuild(kind, { tl, industrial, nonIndustrial, efficiency, infrastructure, population }) {
    const die = tRoll1D('Yard capacity');
    let dm = 0;
    if (tl <= 8) { tDM('TL 0-8', -4); dm -= 4; }
    else if (tl >= 15) { tDM('TL 15+', 4); dm += 4; }
    else if (tl >= 12) { tDM('TL 12-14', 2); dm += 2; }
    if (nonIndustrial) { tDM('Non-Industrial', -2); dm -= 2; }
    if (industrial) { tDM('Industrial', 2); dm += 2; }
    const dieTerm = kind === 'C' ? die - 3 : die;
    const denom = kind === 'A' ? 20000 : kind === 'B' ? 100000 : 15000;
    const raw = (efficiency + infrastructure + dieTerm + dm) * (population / denom);
    let cap = roundUp100(raw);
    if (kind === 'A' && cap < 10000) cap = 9000 + tRoll1D('Yard shortfall') * 500;
    else if (kind === 'B' && cap < 5000) cap = 4000 + tRoll2D('Yard shortfall') * 100;
    else if (kind === 'C' && cap < 0) cap = 0;
    return cap;
}

/**
 * Daily arrivals from the traffic table, docking from the class formula,
 * and yard build capacity. A highport's downport size is a referee choice
 * and is not rolled. Uncharted and unexplored rows are not used.
 */
export function rollPortFacilities({
    starport, highport, downport, importance, trafficImportance,
    efficiency, infrastructure, pop, totalWorldPop, tl, industrial, nonIndustrial, atmCode,
}) {
    const row = trafficFor(trafficImportance);
    const rolled = row.roll();
    const dailyTraffic = Math.max(0, Math.min(row.cap, rolled));
    const expectedWeekly = row.weekly;
    tResult('Daily Traffic', dailyTraffic);
    tResult('Expected Weekly', expectedWeekly);

    const out = { dailyTraffic, expectedWeekly };
    const spec = DOCK[starport];
    if (highport && spec && starport !== 'E') {
        out.highportDocking = dockingTons(spec.base, spec.factor, importance, expectedWeekly, pop, efficiency);
        if (starport !== 'D') {
            out.highportInternalMax = out.highportDocking * 0.1;
            out.highportBay = out.highportDocking * 0.01;
        }
        tResult('Highport Docking', out.highportDocking);
    }
    if (downport && !highport && spec) {
        out.downportDocking = dockingTons(spec.base, spec.factor, importance, expectedWeekly, pop, efficiency);
        const sealed = atmCode === 11 || atmCode === 12 || atmCode === 'B' || atmCode === 'C';
        out.downportEnclosed = sealed ? out.downportDocking : out.downportDocking * 0.1;
        tResult('Downport Docking', out.downportDocking);
    }

    if (YARD_LISTED[starport] != null) {
        const yardBuildCapacity = yardBuild(starport, {
            tl, industrial, nonIndustrial, efficiency, infrastructure, population: totalWorldPop,
        });
        let yardAnnualOutput;
        if (starport === 'C') yardAnnualOutput = yardBuildCapacity * 10;
        else if (importance >= 1) yardAnnualOutput = yardBuildCapacity / importance;
        else yardAnnualOutput = yardBuildCapacity * (1 - importance);
        out.yardListedTons = YARD_LISTED[starport];
        out.yardBuildCapacity = yardBuildCapacity;
        out.yardAnnualOutput = yardAnnualOutput;
        out.yardLargestBay = yardBuildCapacity * 0.1;
        tResult('Yard Build Capacity', yardBuildCapacity);
        tResult('Yard Annual Output', yardAnnualOutput);
    }
    return out;
}
