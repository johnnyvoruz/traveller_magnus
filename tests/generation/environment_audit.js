/**
 * Read-only defect ledger for one generated tree.
 * Plan §2 rows only, and only where the stored values show the stated
 * contradiction. Nothing is rewritten. ASK rows are not emitted: section 0
 * says those picks are not adopted. RULE rows other than R01 need a
 * generation rule this pass does not apply.
 *
 * B04 uses the exotic-liquids window the selector already uses (mp and bp,
 * inclusive). It fires only when every finite final temperature is outside
 * that window. A mean outside the window with a low or a high still inside
 * is Q3, which is not adopted, so it is not flagged.
 */
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';

const EHEX = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const TEMP_LOCKS = ['meanTempK', 'highTempK', 'lowTempK'];

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ehexDigit(char) {
    if (typeof char !== 'string' || char.length === 0) return null;
    const c = char.charAt(0).toUpperCase();
    if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
    const index = EHEX.indexOf(c);
    return index >= 0 ? index + 10 : null;
}

function uwpDigit(uwp, index) {
    return typeof uwp === 'string' && uwp.length > index ? ehexDigit(uwp.charAt(index)) : null;
}

function liquidRow(name) {
    if (typeof name !== 'string') return null;
    return MgT2EData.atmosphereExtended.exoticLiquids.find((row) => row.name === name) ?? null;
}

function waterMeltingK() {
    const water = liquidRow('Water');
    return water ? water.mp : null;
}

function toScale(value) {
    return value < 1 ? 10 * value : value + 9;
}

/** packages/engines/src/mgt2e_world_engine.js getTempBand, DATA temperatureBands. */
function orbitalBand(orbitId, hzco) {
    const orbit = finite(orbitId);
    const center = finite(hzco);
    if (orbit == null || center == null) return null;
    const diff = toScale(orbit) - toScale(center);
    const table = MgT2EData.temperatureBands;
    let band = table[table.length - 1].band;
    for (const entry of table) {
        if (entry.maxDeviation === undefined || diff <= entry.maxDeviation) {
            band = entry.band;
            break;
        }
    }
    return band;
}

function isMainworld(body) {
    return body.type === 'Mainworld' || body.isLunarMainworld === true || body.targetWorld === 'Mainworld';
}

function laterLum(stars) {
    const primary = stars && stars[0];
    const lum = primary && finite(primary.lum);
    return lum == null ? 1 : lum;
}

/**
 * Preliminary luminosity from W:765-768 against the later primary luminosity
 * from W:1746 and W:2374. Returns the pair when they differ.
 */
function illuminationSplit(body, stars) {
    if (!Array.isArray(stars) || stars.length === 0 || finite(body.meanTempK) == null) return null;
    const later = laterLum(stars);
    let preliminary;
    if (body.orbitType === 'P-Type') {
        preliminary = stars.reduce((sum, star) => {
            return star && star.orbitId < body.orbitId ? sum + (finite(star.lum) ?? 0) : sum;
        }, 0);
    } else {
        const index = body.parentStarIdx !== undefined ? body.parentStarIdx : 0;
        const star = stars[index] || stars[0];
        const lum = star && finite(star.lum);
        preliminary = lum == null ? 1 : lum;
    }
    if (preliminary === later) return null;
    return {
        parentStarIdx: body.parentStarIdx ?? null,
        orbitType: body.orbitType ?? null,
        preliminaryLum: preliminary,
        laterLum: later,
    };
}

function chartSplit(body) {
    const atmCode = finite(body.atmCode);
    const hydroCode = finite(body.hydroCode);
    const atm = finite(body.atm);
    const hydro = finite(body.hydro);
    const uwpAtm = uwpDigit(body.uwp, 2);
    const uwpHydro = uwpDigit(body.uwp, 3);
    const secondaryAtm = uwpDigit(body.uwpSecondary, 2);
    const secondaryHydro = uwpDigit(body.uwpSecondary, 3);
    const codeConflict = (atm != null && atmCode != null && atm !== atmCode)
        || (hydro != null && hydroCode != null && hydro !== hydroCode)
        || (uwpAtm != null && atmCode != null && uwpAtm !== atmCode)
        || (uwpHydro != null && hydroCode != null && uwpHydro !== hydroCode);
    const secondaryConflict = (secondaryAtm != null && uwpAtm != null && secondaryAtm !== uwpAtm)
        || (secondaryHydro != null && uwpHydro != null && secondaryHydro !== uwpHydro);
    return {
        atm, hydro, atmCode, hydroCode, uwpAtm, uwpHydro, secondaryAtm, secondaryHydro,
        codeConflict, secondaryConflict,
    };
}

function rowsFor(body, context) {
    const rows = [];
    const mainworld = isMainworld(body);
    const split = chartSplit(body);

    if (mainworld && split.codeConflict) {
        rows.push({
            id: 'B01',
            values: {
                atm: split.atm, atmCode: split.atmCode, hydro: split.hydro, hydroCode: split.hydroCode,
                uwp: body.uwp ?? null,
            },
        });
    }
    if (mainworld && split.codeConflict && (body.isMoon === true || body.isLunarMainworld === true)) {
        rows.push({
            id: 'B02',
            values: {
                isMoon: body.isMoon === true,
                isLunarMainworld: body.isLunarMainworld === true,
                type: body.type ?? null,
                atm: split.atm, atmCode: split.atmCode, hydro: split.hydro, hydroCode: split.hydroCode,
            },
        });
    }
    if (mainworld && (split.codeConflict || split.secondaryConflict)) {
        rows.push({
            id: 'B03',
            values: {
                uwp: body.uwp ?? null,
                uwpSecondary: body.uwpSecondary ?? null,
                atm: split.atm, atmCode: split.atmCode, hydro: split.hydro, hydroCode: split.hydroCode,
                tradeCodes: body.tradeCodes ?? null,
                chartTradeCodes: context.chartTradeCodes,
            },
        });
    }

    const substance = liquidRow(body.liquidType);
    const mean = finite(body.meanTempK);
    const high = finite(body.highTempK);
    const low = finite(body.lowTempK);
    if (substance && mean != null) {
        const temps = [mean, high, low].filter((value) => value != null);
        const outside = (value) => value < substance.mp || value > substance.bp;
        if (temps.length > 0 && temps.every(outside)) {
            rows.push({
                id: 'B04',
                values: {
                    liquidType: body.liquidType,
                    mp: substance.mp,
                    bp: substance.bp,
                    meanTempK: mean,
                    highTempK: high,
                    lowTempK: low,
                },
            });
        }
    }

    const melting = waterMeltingK();
    if (body.liquidType === 'Water' && high != null && melting != null && high < melting) {
        rows.push({
            id: 'B05',
            values: { liquidType: body.liquidType, highTempK: high, waterMp: melting },
        });
    }

    if (body.hydroPercent === 0 && typeof body.liquidType === 'string' && body.liquidType.length > 0) {
        rows.push({
            id: 'B06',
            values: { hydroPercent: 0, hydroCode: finite(body.hydroCode), liquidType: body.liquidType },
        });
    }

    const lights = illuminationSplit(body, context.stars);
    if (lights) rows.push({ id: 'B07', values: { ...lights, liquidType: body.liquidType ?? null, meanTempK: mean } });

    if (body.isMoon === true && mean != null) {
        const au = finite(body.au);
        const parentAu = finite(context.parent && context.parent.au);
        if (au == null || (parentAu != null && au !== parentAu)) {
            rows.push({ id: 'B08', values: { au, parentAu, meanTempK: mean } });
        }
    }

    if (typeof body.tempBand === 'string' && body.tempBand && mean != null) {
        const hzco = body.worldHzco || context.systemHzco;
        const band = orbitalBand(body.orbitId, hzco);
        if (band && band !== body.tempBand) {
            rows.push({
                id: 'B09',
                values: { tempBand: body.tempBand, orbitalBand: band, orbitId: finite(body.orbitId), hzco: finite(hzco), meanTempK: mean },
            });
        }
    }

    const manual = Array.isArray(body._manualFields)
        ? body._manualFields.filter((field) => TEMP_LOCKS.includes(field))
        : [];
    if (manual.length > 0 && mean != null) {
        rows.push({
            id: 'B10',
            values: { manualFields: manual, meanTempK: mean, highTempK: high, lowTempK: low },
        });
    }

    if (mainworld && context.baselineOrbit != null && Array.isArray(context.zones)) {
        const orbit = context.baselineOrbit;
        const zone = context.zones.find((item) => finite(item.min) != null && finite(item.max) != null
            && (orbit === item.min || orbit === item.max));
        if (zone) {
            rows.push({
                id: 'B11',
                values: { baselineOrbit: orbit, zoneMin: zone.min, zoneMax: zone.max },
            });
        }
    }

    const day = finite(body.solarDayHours);
    if (day != null && day > 50 && day <= 2500 && body.tidallyLocked !== true && high != null && low != null) {
        rows.push({
            id: 'R01',
            values: { solarDayHours: day, tidallyLocked: false, highTempK: high, lowTempK: low },
        });
    }

    return rows;
}

function walk(list, parent, path, context, bodies) {
    (list || []).forEach((body, index) => {
        if (!body || typeof body !== 'object') return;
        const here = `${path}[${index}]`;
        bodies.push({
            path: here,
            name: typeof body.name === 'string' ? body.name : here,
            type: body.type ?? null,
            mainworld: isMainworld(body),
            liquidType: body.liquidType ?? null,
            hydroPercent: finite(body.hydroPercent),
            rows: rowsFor(body, { ...context, parent }),
        });
        if (Array.isArray(body.moons)) walk(body.moons, body, `${here}.moons`, context, bodies);
    });
}

/**
 * @param {object} tree a generateHex envelope, or an object with mgtSystem
 * @returns {{ bodies: Array<{ path: string, name: string, type: string|null, mainworld: boolean, liquidType: string|null, hydroPercent: number|null, rows: Array<{ id: string, values: object }> }> }}
 */
export function auditTree(tree) {
    const root = tree && tree.body && tree.body.mgtSystem ? tree.body : tree;
    const system = root && root.mgtSystem;
    const bodies = [];
    if (!system || !Array.isArray(system.worlds)) return { bodies };
    const chartTradeCodes = tree && tree.body ? (tree.body.tradeCodes ?? null) : null;
    walk(system.worlds, null, 'worlds', {
        stars: system.stars || [],
        systemHzco: system.hzco,
        baselineOrbit: finite(system.baselineOrbit),
        zones: system.forbiddenZones || [],
        chartTradeCodes,
    }, bodies);
    return { bodies };
}

export const AUDIT_ROWS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'R01'];

export function countAudit(reports) {
    const all = Object.fromEntries(AUDIT_ROWS.map((id) => [id, 0]));
    const mainworld = Object.fromEntries(AUDIT_ROWS.map((id) => [id, 0]));
    let bodies = 0;
    let mainworlds = 0;
    for (const report of reports) {
        for (const body of report.bodies) {
            bodies += 1;
            if (body.mainworld) mainworlds += 1;
            for (const id of new Set(body.rows.map((row) => row.id))) {
                all[id] += 1;
                if (body.mainworld) mainworld[id] += 1;
            }
        }
    }
    return { bodies, mainworlds, all, mainworld };
}
