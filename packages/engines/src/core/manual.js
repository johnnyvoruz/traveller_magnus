export function markManual(obj, field) {
    if (!obj) return;
    if (!Array.isArray(obj._manualFields)) obj._manualFields = [];
    if (!obj._manualFields.includes(field)) obj._manualFields.push(field);
}

/**
 * Returns true if a field on a body/star object has been manually set.
 * @param {Object} obj - The body or star object.
 * @param {string} field - The field name to check.
 * @returns {boolean}
 */
export function isManual(obj, field) {
    if (!obj || !Array.isArray(obj._manualFields)) return false;
    return obj._manualFields.includes(field);
}

/**
 * Clears the manual flag for a specific field, or all fields if none specified.
 * @param {Object} obj - The body or star object.
 * @param {string} [field] - The field to clear. Omit to clear all manual flags.
 */
export function clearManual(obj, field) {
    if (!obj || !Array.isArray(obj._manualFields)) return;
    if (field === undefined) {
        obj._manualFields = [];
    } else {
        obj._manualFields = obj._manualFields.filter(f => f !== field);
    }
}

/**
 * Counts all manually-overridden bodies/stars across a CT system.
 * Used by the re-expansion warning dialog.
 * @param {Object} ctSystem - The sys object from stateObj.ctSystem.
 * @returns {number} Total count of stars/bodies with at least one manual field.
 */
export function countManualCTBodies(ctSystem) {
    let count = 0;
    if (!ctSystem) return 0;
    (ctSystem.stars || []).forEach(star => {
        if (Array.isArray(star._manualFields) && star._manualFields.length > 0) count++;
    });
    (ctSystem.orbits || []).forEach(slot => {
        const body = slot.contents;
        if (!body) return;
        if (Array.isArray(body._manualFields) && body._manualFields.length > 0) count++;
        (body.satellites || []).forEach(sat => {
            if (Array.isArray(sat._manualFields) && sat._manualFields.length > 0) count++;
        });
    });
    (ctSystem.capturedPlanets || []).forEach(cp => {
        if (Array.isArray(cp._manualFields) && cp._manualFields.length > 0) count++;
    });
    return count;
}

/**
 * Counts all manually-overridden bodies across a T5 system.
 * Used by the re-expansion warning dialog.
 * @param {Object} t5System - The sys object from stateObj.t5System.
 * @returns {number} Total count of bodies with at least one manual field.
 */
export function countT5ManualBodies(t5System) {
    let count = 0;
    if (!t5System || !t5System.stars) return 0;
    t5System.stars.forEach(star => {
        if (Array.isArray(star._manualFields) && star._manualFields.length > 0) count++;
        if (!star.orbits) return;
        star.orbits.forEach(o => {
            const body = o.contents;
            if (!body || body.type === 'Empty') return;
            if (Array.isArray(body._manualFields) && body._manualFields.length > 0) count++;
            (body.satellites || []).forEach(sat => {
                if (Array.isArray(sat._manualFields) && sat._manualFields.length > 0) count++;
            });
        });
    });
    return count;
}

/**
 * Counts all manually-overridden bodies across an RTT system.
 * Used by the re-expansion warning dialog.
 * @param {Object} rttSystem - The sys object from stateObj.rttSystem.
 * @returns {number} Total count of bodies with at least one manual field.
 */
export function countManualBodies(rttSystem) {
    let count = 0;
    if (!rttSystem || !rttSystem.stars) return 0;
    rttSystem.stars.forEach(star => {
        if (!star.planetarySystem) return;
        star.planetarySystem.orbits.forEach(body => {
            if (Array.isArray(body._manualFields) && body._manualFields.length > 0) count++;
            (body.satellites || []).forEach(sat => {
                if (Array.isArray(sat._manualFields) && sat._manualFields.length > 0) count++;
            });
        });
    });
    return count;
}

/**
 * Counts all manually-overridden bodies across a MgT2E system.
 * Used by the re-expansion warning dialog.
 * @param {Object} mgtSystem - The sys object from stateObj.mgtSystem.
 * @returns {number} Total count of bodies with at least one manual field.
 */
export function countManualMgt2eBodies(mgtSystem) {
    let count = 0;
    if (!mgtSystem) return 0;
    (mgtSystem.stars || []).forEach(star => {
        if (Array.isArray(star._manualFields) && star._manualFields.length > 0) count++;
    });
    (mgtSystem.worlds || []).forEach(world => {
        if (Array.isArray(world._manualFields) && world._manualFields.length > 0) count++;
        (world.moons || []).forEach(m => {
            if (Array.isArray(m._manualFields) && m._manualFields.length > 0) count++;
        });
        (world.significantBodies || []).forEach(sb => {
            if (Array.isArray(sb._manualFields) && sb._manualFields.length > 0) count++;
        });
    });
    return count;
}
