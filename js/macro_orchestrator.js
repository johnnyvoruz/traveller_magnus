// ============================================================================
// MACRO_ORCHESTRATOR.JS - Bulk Generation & Validation Rules
// ============================================================================

// ============================================================================
// SYSTEM COUNT HELPER
// Computes beltCount and gasGiantCount once at generation/import time and
// stores them on the stateObj so the filter engine can read them cheaply.
// ============================================================================
function computeSystemCounts(stateObj) {
    if (stateObj.t5Data) {
        stateObj.beltCount     = stateObj.t5Data.planetoidBelts || 0;
        stateObj.gasGiantCount = stateObj.t5Data.gasGiantsCount !== undefined
            ? stateObj.t5Data.gasGiantsCount
            : (stateObj.t5Data.gasGiant ? 1 : 0);
    } else if (stateObj.mgtSystem) {
        stateObj.beltCount     = stateObj.mgtSystem.planetoidBelts || 0;
        stateObj.gasGiantCount = stateObj.mgtSystem.gasGiants || 0;
    } else if (stateObj.ctSystem) {
        const orbits = stateObj.ctSystem.orbits || [];
        stateObj.beltCount     = orbits.filter(o => o.contents?.type === 'Planetoid Belt').length;
        stateObj.gasGiantCount = orbits.filter(o => o.contents?.type === 'Gas Giant').length;
    } else if (stateObj.rttSystem) {
        let belts = 0, ggs = 0;
        (stateObj.rttSystem.stars || []).forEach(s => {
            (s.planetarySystem?.orbits || []).forEach(b => {
                if (b.type === 'Asteroid Belt') belts++;
                if (b.type === 'Jovian Planet' || b.type === 'Helian Planet') ggs++;
            });
        });
        stateObj.beltCount     = belts;
        stateObj.gasGiantCount = ggs;
    } else if (stateObj.aowSystem) {
        const aowWorlds = stateObj.aowSystem.worlds || [];
        stateObj.beltCount     = aowWorlds.filter(w => w.type === 'Planetoid Belt').length;
        stateObj.gasGiantCount = aowWorlds.filter(w => w.type === 'Gas Giant').length;
    } else {
        stateObj.beltCount     = 0;
        stateObj.gasGiantCount = 0;
    }
}
window.computeSystemCounts = computeSystemCounts;

// ============================================================================
// LUMINOSITY CLASS TALLY — shared across all macro engines
// Reads star.sClass (CT/MgT2E/T5/AoW) or star.luminosityClass (RTT) and
// prints a sorted summary to the console at the end of each bulk macro.
// ============================================================================
function _printLumTally(label, targetHexes, sysKey) {
    const tally = {};
    targetHexes.forEach(hexId => {
        const sys = (hexStates.get(hexId) || {})[sysKey];
        if (!sys || !sys.stars) return;
        sys.stars.forEach(star => {
            const key = star.sClass || star.luminosityClass || star.size || 'unknown';
            tally[key] = (tally[key] || 0) + 1;
        });
    });
    const tallyStr = Object.keys(tally).sort().map(k => `${k}: ${tally[k]}`).join(' | ');
    if (tallyStr) console.log(`[${label} Lum Tally] ${tallyStr}`);
}

function _printWetWorldPct(label, targetHexes) {
    const toNum = (v) => {
        if (v === undefined || v === null) return 0;
        if (typeof v === 'number') return v;
        return (typeof UniversalMath !== 'undefined') ? UniversalMath.fromEHex(v) : (parseInt(v, 16) || 0);
    };
    let wetCount = 0;
    let totalCount = 0;
    targetHexes.forEach(hexId => {
        const state = hexStates.get(hexId) || {};
        if (state.type !== 'SYSTEM_PRESENT') return;
        const w = state.rttData || state.t5Data || state.mgt2eData || state.ctData;
        if (!w) return;
        totalCount++;
        const atm = toNum(w.atm ?? w.atmosphere ?? w.atmCode ?? w.Atm);
        const hydro = toNum(w.hydro ?? w.hydrographics ?? w.hydroCode ?? w.Hydro);
        if ((atm === 5 || atm === 6 || atm === 8) && hydro > 0) wetCount++;
    });
    if (totalCount === 0) return;
    const pct = ((wetCount / totalCount) * 100).toFixed(1);
    console.log(`[${label} Wet World] ${wetCount} / ${totalCount} (${pct}%)`);
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateSelection(actionType, skipPopCheck = false) {
    const hexes = currentActionHexes();
    if (hexes.length === 0) {
        alert("Please select one or more hexes first (Shift + Left Click).");
        document.getElementById('context-menu').classList.remove('visible');
        return false;
    }

    if (actionType !== 'clear' && hexes.length > 1280) {
        alert("We are currently limited to generating one sector (1280 hexes) at a time to prevent browser crashes. Please reduce your selection.");
        document.getElementById('context-menu').classList.remove('visible');
        return false;
    }

    // New logic: Check for at least one populated hex if we are updating existing systems
    if (!skipPopCheck && (actionType === 'generate' || actionType === 'socio' || actionType === 'physical')) {
        let hasPopulated = false;
        let popCount = 0;
        for (let hexId of hexes) {
            let state = hexStates.get(hexId);
            if (state && state.type === 'SYSTEM_PRESENT') {
                hasPopulated = true;
                popCount++;
            }
        }
        if (window.isLoggingEnabled) {
            writeLogLine(`[AUDIT] validateSelection: Checked ${hexes.length} selected hexes. Found ${popCount} populated hexes. hasPopulated=${hasPopulated}`);
        }
        if (!hasPopulated) {
            alert("No populated hexes to update. You must populate hexes first.");
            document.getElementById('context-menu').classList.remove('visible');
            return false;
        }
    }

    if (actionType === 'populate') {
        let willOverwrite = false;
        for (let hexId of hexes) {
            if (hexStates.has(hexId)) {
                willOverwrite = true;
                break;
            }
        }
        if (willOverwrite) {
            if (!confirm("Some selected hexes already contain data. Do you want to overwrite them?")) {
                document.getElementById('context-menu').classList.remove('visible');
                return false;
            }
        }
    } else if (actionType === 'generate') {
        let willOverwrite = false;
        for (let hexId of hexes) {
            let state = hexStates.get(hexId);
            if (state && (state.ctData || state.mgt2eData || state.t5Data || state.aowSystem)) {
                willOverwrite = true;
                break;
            }
        }
        if (willOverwrite) {
            if (!confirm("Some selected hexes already have generated Mainworld data. Do you want to overwrite them?")) {
                document.getElementById('context-menu').classList.remove('visible');
                return false;
            }
        }
    } else if (actionType === 'socio') {
        let willOverwrite = false;
        for (let hexId of hexes) {
            let state = hexStates.get(hexId);
            if (state && (state.t5Socio || state.mgtSocio)) {
                willOverwrite = true;
                break;
            }
        }
        if (willOverwrite) {
            if (!confirm("Some selected hexes already have generated Socioeconomic data. Generating new data will overwrite the existing socioeconomics. Are you sure?")) {
                document.getElementById('context-menu').classList.remove('visible');
                return false;
            }
        }
    } else if (actionType === 'physical') {
        let willOverwrite = false;
        for (let hexId of hexes) {
            let state = hexStates.get(hexId);
            if (state && state.t5Physical) {
                willOverwrite = true;
                break;
            }
        }
        if (willOverwrite) {
            if (!confirm("Some selected hexes already have generated Physical Stats. Generating new data will overwrite the existing physical stats. Are you sure?")) {
                document.getElementById('context-menu').classList.remove('visible');
                return false;
            }
        }
    }
    return true;
}

// ============================================================================
// ONE-CLICK MONGOOSE BUILD
// The action bar offers the remaining Mongoose 2e step for the current hexes.
// Imported profiles are kept and fleshed out. A blank present hex is generated.
// A system that already has stars and worlds only receives the society pass.
// ============================================================================

function mgtProfile(state) {
    if (!state) return null;
    return state.mgt2eData || state.t5Data || state.ctData || state.rttData || null;
}

function mgtSystemReady(state) {
    const sys = state && state.mgtSystem;
    return !!(sys && sys.stars && sys.stars.length && sys.worlds && sys.worlds.length);
}

function mgtBuildStage(state) {
    if (!state || state.type === 'EMPTY') return null;
    const profile = mgtProfile(state);
    if (state.type !== 'SYSTEM_PRESENT' && !profile) return null;
    if (mgtSystemReady(state)) return state.mgtSocio ? null : 'society';
    if (profile) return 'flesh';
    return state.type === 'SYSTEM_PRESENT' ? 'generate' : null;
}

function mgtBuildOffer(hexes) {
    const stages = [...new Set((hexes || []).map(id => mgtBuildStage(hexStates.get(id))).filter(Boolean))];
    if (!stages.length) return null;
    if (stages.length > 1) return {
        label: 'Finish systems',
        title: 'Finish each selected system from the stage it is in, using Mongoose 2e.'
    };
    const only = stages[0];
    if (only === 'flesh') return {
        label: 'Flesh out',
        title: 'Keep the imported profile and build the Mongoose 2e system around it.'
    };
    if (only === 'society') return {
        label: 'Expand society',
        title: 'Add Mongoose 2e society to the system that is already here.'
    };
    return {
        label: 'Generate',
        title: 'Roll a Mongoose 2e mainworld and build the full system.'
    };
}

function _storeMgtBuild(state, sys) {
    let mainworld = null;
    const findMW = (list) => {
        for (const world of list || []) {
            if (world.type === 'Mainworld' || world.isLunarMainworld || world.targetWorld === 'Mainworld') {
                mainworld = world;
                return true;
            }
            if (world.moons && findMW(world.moons)) return true;
        }
        return false;
    };
    findMW(sys.worlds);
    if (!mainworld) mainworld = sys.mainworld || sys.worlds[0];
    if (mainworld && mainworld.isLunarMainworld) mainworld.gasGiant = sys.gasGiants > 0;
    else if (mainworld) mainworld.gasGiant = mainworld.gasGiant || (sys.gasGiants > 0);
    state.mgtSystem = sys;
    state.mgt2eData = mainworld;
    state.mgtSocio = mainworld;
    if (!state.name && mainworld && mainworld.name) state.name = mainworld.name;
    state.type = 'SYSTEM_PRESENT';
    computeSystemCounts(state);
}

function runMgtBuild() {
    const hexes = currentActionHexes();
    if (hexes.length > 1280) {
        showToast('Build up to one sector (1280 hexes) at a time.', 4000);
        return;
    }
    const work = hexes
        .map(id => ({ id, stage: mgtBuildStage(hexStates.get(id)) }))
        .filter(item => item.stage);
    if (!work.length) return;
    const offer = mgtBuildOffer(work.map(item => item.id));
    saveHistoryState('Mongoose build', { hexIds: work.map(item => item.id) });
    if (window.isLoggingEnabled) window.batchLogData = [];
    let count = 0;
    work.forEach(({ id, stage }) => {
        try {
            const state = hexStates.get(id);
            const sys = stage === 'society'
                ? expandLoadedSocioeconomicsMgT2E(id, state)
                : generateMgT2ESystemTopDown(id, stage === 'flesh' ? mgtProfile(state) : null);
            if (!sys) return;
            _storeMgtBuild(state, sys);
            hexStates.set(id, state);
            count++;
        } catch (err) {
            console.error(`Mongoose build failed for ${id}:`, err);
        }
    });
    if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
    if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();
    const openHex = window.SystemViewer?.currentHexId?.();
    if (openHex && work.some(item => item.id === openHex)) window.SystemViewer.refresh(openHex);
    window.SystemInspector?.refresh?.(true);
    requestAnimationFrame(draw);
    window.syncMapActionBar?.();
    if (!count) return;
    const verb = !offer || offer.label === 'Finish systems' ? 'Finished'
        : offer.label === 'Flesh out' ? 'Fleshed out'
        : offer.label === 'Expand society' ? 'Expanded society for'
        : 'Generated';
    showToast(`${verb} ${count} Mongoose system${count === 1 ? '' : 's'}.`, 4000);
}
window.mgtBuildOffer = mgtBuildOffer;
window.runMgtBuild = runMgtBuild;

// ============================================================================
// BACKGROUND MONGOOSE BUILD
// Import the Imperium / Import the Universe queue every world that still needs
// a full Mongoose system. One sector at a time, a few worlds per turn, so the
// map stays usable. Logging is off for the run: a trace per world would fill
// memory long before the build finished.
// ============================================================================

let _mgtBuildCancel = false;
let _mgtBuildRunning = false;
let _workStop = null;

function showWorkStatus({ title, detail, fraction, onStop, dismiss }) {
    _workStop = onStop || (dismiss ? hideWorkStatus : null);
    _paintBuildProgress({ title, detail, fraction: fraction || 0 });
    const stop = document.getElementById('mgt-build-progress-stop');
    if (!stop) return;
    stop.hidden = !_workStop;
    if (dismiss) {
        stop.hidden = false;
        stop.disabled = false;
        stop.textContent = 'Dismiss';
    }
}
function hideWorkStatus() {
    _workStop = null;
    _hideBuildProgress();
}
window.showWorkStatus = showWorkStatus;
window.hideWorkStatus = hideWorkStatus;

function _buildOneMgtHex(id) {
    const state = hexStates.get(id);
    const stage = mgtBuildStage(state);
    if (!stage) return false;
    const sys = stage === 'society'
        ? expandLoadedSocioeconomicsMgT2E(id, state)
        : generateMgT2ESystemTopDown(id, stage === 'flesh' ? mgtProfile(state) : null);
    if (!sys) return false;
    _storeMgtBuild(state, sys);
    hexStates.set(id, state);
    return true;
}

function _mgtSectorsToBuild(preferred) {
    const groups = new Map();
    hexStates.forEach((state, id) => {
        if (!mgtBuildStage(state)) return;
        const key = String(id).split('-')[0];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(id);
    });
    groups.forEach(ids => ids.sort());
    const ordered = [];
    const seen = new Set();
    (preferred || []).forEach(sector => {
        const key = String(sector.key);
        if (seen.has(key) || !groups.has(key)) return;
        seen.add(key);
        ordered.push({ key, name: sector.name || window.sectorNames?.[key] || `Sector ${key}`, hexes: groups.get(key) });
    });
    [...groups.keys()].sort((a, b) => Number(a) - Number(b)).forEach(key => {
        if (seen.has(key)) return;
        ordered.push({ key, name: window.sectorNames?.[key] || `Sector ${key}`, hexes: groups.get(key) });
    });
    return ordered;
}

function _paintBuildProgress({ title, detail, fraction }) {
    const root = document.getElementById('mgt-build-progress');
    if (!root) return;
    root.hidden = false;
    document.body.classList.add('mgt-build-active');
    const titleEl = document.getElementById('mgt-build-progress-title');
    const detailEl = document.getElementById('mgt-build-progress-detail');
    const fill = document.getElementById('mgt-build-progress-fill');
    const stop = document.getElementById('mgt-build-progress-stop');
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
    if (stop) {
        stop.hidden = false;
        stop.textContent = 'Stop';
        stop.disabled = false;
    }
}

function _hideBuildProgress() {
    const root = document.getElementById('mgt-build-progress');
    if (root) root.hidden = true;
    document.body.classList.remove('mgt-build-active');
}

function _mgtCensus() {
    let present = 0, needs = 0, withWtn = 0, chartOnly = 0;
    let sample = null;
    hexStates.forEach((state, id) => {
        if (!state || state.type !== 'SYSTEM_PRESENT') return;
        present++;
        if (mgtBuildStage(state)) needs++;
        if (state.mgt2eData && Number.isFinite(state.mgt2eData.WTN)) withWtn++;
        else if (state.t5Data && !state.mgt2eData) chartOnly++;
        if (!sample) {
            sample = {
                id,
                stage: mgtBuildStage(state),
                hasMgt: !!state.mgt2eData,
                mgtWtn: state.mgt2eData ? state.mgt2eData.WTN : null,
                hasChart: !!state.t5Data
            };
        }
    });
    return { present, needs, withWtn, chartOnly, sample };
}

function startBackgroundMgtBuild(options) {
    const census = _mgtCensus();
    console.log('[MgtBuild] requested', census);
    if (_mgtBuildRunning) {
        console.warn('[MgtBuild] already running');
        showToast('A Mongoose build is already running.', 2500);
        return;
    }
    const sectors = _mgtSectorsToBuild(options && options.sectors);
    const total = sectors.reduce((sum, sector) => sum + sector.hexes.length, 0);
    if (!total) {
        const msg = census.present
            ? 'Every world on the map already has a Mongoose system. No build was started.'
            : 'There are no worlds on the map to build.';
        console.warn('[MgtBuild] nothing to do.', msg, census);
        showToast(msg, 6000);
        return;
    }
    console.log(`[MgtBuild] starting ${total} worlds across ${sectors.length} sectors`);
    _mgtBuildCancel = false;
    _mgtBuildRunning = true;
    const wasLogging = window.isLoggingEnabled;
    window.isLoggingEnabled = false;
    const yieldTurn = () => new Promise(resolve => setTimeout(resolve, 0));
    (async () => {
        let done = 0;
        let built = 0;
        let failed = 0;
        let stopped = false;
        _paintBuildProgress({
            title: 'Building Mongoose systems',
            detail: `${sectors[0].name} · 0 of ${total.toLocaleString()} worlds · sector 1 of ${sectors.length}`,
            fraction: 0
        });
        await yieldTurn();
        try {
            for (let s = 0; s < sectors.length; s++) {
                const sector = sectors[s];
                console.log(`[MgtBuild] sector ${s + 1}/${sectors.length} ${sector.name}: ${sector.hexes.length} worlds`);
                const saved = [];
                for (let i = 0; i < sector.hexes.length; i++) {
                    if (_mgtBuildCancel) { stopped = true; break; }
                    try {
                        if (_buildOneMgtHex(sector.hexes[i])) built++;
                    } catch (err) {
                        failed++;
                        console.error(`Mongoose build failed for ${sector.hexes[i]}:`, err);
                    }
                    saved.push(sector.hexes[i]);
                    done++;
                    if (done % 200 === 0) console.log(`[MgtBuild] ${done}/${total} ${sector.name}`);
                    if (i % 4 === 3 || i === sector.hexes.length - 1) {
                        _paintBuildProgress({
                            title: 'Building Mongoose systems',
                            detail: `${sector.name} · ${done.toLocaleString()} of ${total.toLocaleString()} worlds · sector ${s + 1} of ${sectors.length}`,
                            fraction: done / total
                        });
                        await yieldTurn();
                    }
                }
                if (saved.length && window.dbManager?.saveHexes) await window.dbManager.saveHexes(saved);
                requestAnimationFrame(draw);
                if (stopped) break;
                await yieldTurn();
            }
            if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
            if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();
            requestAnimationFrame(draw);
            const failNote = failed ? ` ${failed} failed.` : '';
            showToast(stopped
                ? `Stopped after ${built.toLocaleString()} Mongoose system${built === 1 ? '' : 's'}.${failNote}`
                : `Built ${built.toLocaleString()} Mongoose system${built === 1 ? '' : 's'}.${failNote}`, stopped ? 5000 : 6000);
        } finally {
            window.isLoggingEnabled = wasLogging;
            _mgtBuildRunning = false;
            _mgtBuildCancel = false;
            _hideBuildProgress();
        }
    })();
}
window.startBackgroundMgtBuild = startBackgroundMgtBuild;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('mgt-build-progress-stop')?.addEventListener('click', () => {
        _mgtBuildCancel = true;
        const stopFn = _workStop;
        const stop = document.getElementById('mgt-build-progress-stop');
        if (stop) { stop.disabled = true; stop.textContent = 'Stopping…'; }
        if (stopFn) stopFn();
    });
});

// ============================================================================
// AUTO POPULATE
// ============================================================================

function autoPopulate(chanceOutOfSix) {
    if (!validateSelection('populate')) return;
    saveHistoryState('Auto Populate', { hexIds: currentActionHexes() });
    currentActionHexes().forEach(hexId => {
        reseedForHex(hexId);
        const roll = roll1D();
        if (roll <= chanceOutOfSix) {
            hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
        } else {
            hexStates.set(hexId, { type: 'EMPTY' });
        }
    });
    document.getElementById('context-menu').classList.remove('visible');
    
    // Sean Protocol: Sync Rule Engine and Filters with new data
    if (typeof writeLogLine === 'function') writeLogLine(`Auto-Populate: Refreshing rules for sector.`);
    if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
    if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

    selectedHexes.clear();
    requestAnimationFrame(draw);
}

// ============================================================================
// BULK MACRO EXECUTION
// ============================================================================

async function runMgT2EMacro(skipPop = false) {
    if (!validateSelection('generate', !skipPop)) return;

    const targetHexes = currentActionHexes();
    saveHistoryState('Mongoose Macro', { hexIds: targetHexes });
    if (window.isLoggingEnabled) window.batchLogData = [];

    console.log("Bulk Generating MgT2E Full System...");
    await ensureNamesLoaded();

    // Warn if any selected hex has manually-overridden MgT2E fields
    let _mgtManualCount = 0;
    targetHexes.forEach(hexId => {
        const s = hexStates.get(hexId);
        if (s && s.mgtSystem) _mgtManualCount += countManualMgt2eBodies(s.mgtSystem);
    });
    const _mgtManualWarning = _mgtManualCount > 0
        ? `\n\nNOTE: ${_mgtManualCount} body/bodies in this selection have manual field overrides. These will be preserved where world positions match the regenerated structure.`
        : '';

    if (!confirm(`This will completely overwrite ANY existing data in the selected hexes with a Full Mongoose 2E Generation sequence.${_mgtManualWarning}\n\nProceed?`)) {
        return;
    }

    // v0.6.1.0: Statistical auditor for this generation run
    const _auditor_mgt2e = (typeof StatisticalAuditor !== 'undefined')
        ? new StatisticalAuditor('mgt2e', targetHexes.length <= 80)
        : null;

    // Auto Populate
    if (!skipPop) {
        targetHexes.forEach(hexId => {
            reseedForHex(hexId + "-pop");
            const roll = roll1D();
            if (roll <= 3) {
                hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
            } else {
                hexStates.set(hexId, { type: 'EMPTY' });
            }
        });
        requestAnimationFrame(draw);
        showToast(`Populated ${targetHexes.length} hex(es)...`, 1000);
    }


    // Generate Full Systems (Modular Top-Down)
    setTimeout(() => {
        let count = 0;
        let lunarCount = 0;
        let populatedTotal = 0;

        targetHexes.forEach(hexId => {
            try {
                let stateObj = hexStates.get(hexId);
                if (stateObj && stateObj.type === 'SYSTEM_PRESENT') {
                    // 1. Call the new Orchestrator, preserving any manual field overrides
                    const _oldMgtSys = stateObj.mgtSystem || null;
                    let newSys = (window.System_Driver && window.System_Driver.generateMgt2eSystemPreservingManuals && _oldMgtSys)
                        ? window.System_Driver.generateMgt2eSystemPreservingManuals(hexId, _oldMgtSys)
                        : generateMgT2ESystemTopDown(hexId);

                    // 2. Find the Mainworld recursively to account for Lunar demotions
                    let mainworld = null;
                    const findMW = (wList) => {
                        for (let w of wList) {
                            if (w.type === 'Mainworld' || w.isLunarMainworld || w.targetWorld === 'Mainworld') {
                                mainworld = w;
                                return true;
                            }
                            if (w.moons && w.moons.length > 0) {
                                if (findMW(w.moons)) return true;
                            }
                        }
                        return false;
                    };
                    findMW(newSys.worlds);
                    
                    // Critical fallback: if no Mainworld found in tree, use system-level mainworld if defined, else first world
                    if (!mainworld) mainworld = newSys.mainworld || newSys.worlds[0]; 

                    // 3. Map the data back to stateObj so the Hex Editor UI doesn't break
                    stateObj.mgtSystem = newSys;
                    
                    // Sean Protocol: Propagate gasGiant flag to Lunar Mainworlds.
                    // The renderer reads stateObj.mgt2eData for the ringed GG icon.
                    // Lunar Mainworlds are moons of Gas Giants — the gasGiant flag lives
                    // on the sys object but must be surfaced to the UI state object.
                    if (mainworld && mainworld.isLunarMainworld) {
                        mainworld.gasGiant = newSys.gasGiants > 0;
                    } else if (mainworld) {
                        mainworld.gasGiant = mainworld.gasGiant || (newSys.gasGiants > 0);
                    }

                    stateObj.mgt2eData = mainworld;
                    stateObj.mgtSocio = mainworld;
                    stateObj.name = mainworld.name;

                    // v0.6.1.0: Record system in statistical auditor
                    if (_auditor_mgt2e && mainworld) {
                        _auditor_mgt2e.recordSystem({
                            stars:          newSys.stars ? newSys.stars.length : 1,
                            isMoonMainworld: !!(mainworld.isLunarMainworld || mainworld.isMoon),
                            size:           mainworld.size || 0,
                            atmosphere:     mainworld.atmCode !== undefined ? mainworld.atmCode : (mainworld.atm || 0),
                            hydrosphere:    mainworld.hydroCode !== undefined ? mainworld.hydroCode : (mainworld.hydro || 0),
                            population:     mainworld.popCode !== undefined ? mainworld.popCode : (mainworld.pop || 0),
                            starport:       mainworld.starport || 'X',
                            techLevel:      mainworld.tl || 0
                        });
                        // Record temperatures for every body (mainworld + non-mainworld)
                        const _walkTemps = (bodies) => {
                            bodies.forEach(w => {
                                if (w.meanTempK !== undefined)
                                    _auditor_mgt2e.recordWorldTemp(w.meanTempK, hexId, w.orbitId, w.name || w.type || 'World', w.type);
                                if (w.moons) _walkTemps(w.moons);
                            });
                        };
                        if (newSys && newSys.worlds) _walkTemps(newSys.worlds);

                        // Record biological (life) data — planets and moons only, no Gas Giants or belts
                        let _lifeSystemHasLife = false;
                        let _lifeTotalWorlds   = 0;
                        let _lifeWorldsWithLife = 0;
                        const _walkLife = (bodies) => {
                            bodies.forEach(w => {
                                if (w.type !== 'Gas Giant' && w.type !== 'Planetoid Belt') {
                                    _lifeTotalWorlds++;
                                    if ((w.biomass || 0) > 0) { _lifeWorldsWithLife++; _lifeSystemHasLife = true; }
                                }
                                if (w.moons) _walkLife(w.moons);
                            });
                        };
                        if (newSys && newSys.worlds) _walkLife(newSys.worlds);
                        _auditor_mgt2e.recordLifeData(_lifeSystemHasLife, _lifeTotalWorlds, _lifeWorldsWithLife);
                    }

                    // 4. Clear old variant data to prevent UI ghosting
                    stateObj.ctData = null;
                    stateObj.t5Data = null;
                    stateObj.ctSystem = null;
                    stateObj.t5System = null;
                    stateObj.ctPhysical = null;
                    stateObj.t5Socio = null;

                    // Action: AUDIT Trace (Verify Presence & Tags)
                    if (window.isLoggingEnabled) {
                        let mwInfo = mainworld ? `MW: ${mainworld.name || 'Unnamed'} (Sa: ${mainworld.tradeCodes?.includes('Sa') ? 'YES' : 'NO'})` : "MW NOT FOUND";
                        let parentInfo = mainworld?.parentType ? `Parent: ${mainworld.parentType}` : "Parent: Parent Star";
                        writeLogLine(`[WBH AUDIT DETAIL] Hex ${hexId}: ${mwInfo}, ${parentInfo}, Codes: [${mainworld?.tradeCodes?.join(' ')}]`);
                    }

                    // Check if Lunar Mainworld was found
                    if (mainworld && (mainworld.isMoon || mainworld.isSatellite || mainworld.tradeCodes?.includes('Sa'))) {
                        lunarCount++;
                    }

                    computeSystemCounts(stateObj);
                    hexStates.set(hexId, stateObj);
                    count++;
                }
            } catch (err) {
                console.error(`MgT2E Modular Macro failed for hex ${hexId}:`, err);
            }
        });

        _printLumTally('MgT2E', targetHexes, 'mgtSystem');
        _printWetWorldPct('MgT2E', targetHexes);

        if (window.isLoggingEnabled && window.batchLogData.length > 0) {
            downloadBatchLog('MgT2E_Full_Macro', targetHexes.length);
        }
        requestAnimationFrame(draw);
        if (count > 0) {
            const lunarPercent = ((lunarCount / count) * 100).toFixed(1);
            let msg = `Full MgT2E Generation Complete! (${count} systems)`;

            // Sean Protocol: Reporting Detail Decoupled from core success message.
            // Detailed lunar statistics are only shown when Development View is enabled.
            if (typeof devView !== 'undefined' && devView) {
                msg = `Full MgT2E Generation Complete! (${count} systems, ${lunarCount} Lunar Mainworlds: ${lunarPercent}%)`;
            }

            showToast(msg, 6000);
            if (window.isLoggingEnabled) {
                writeLogLine(`[WBH AUDIT] Sector Frequency: ${lunarCount}/${count} (${lunarPercent}%) Lunar Mainworlds generated.`);
            }
        } else {
            showToast("No populated hexes were updated.", 4000);
        }
        // Refresh both visibility and styling rules for the new systems
        if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
        if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

        // v0.6.1.0: Emit deviation report
        if (_auditor_mgt2e && count > 0) _auditor_mgt2e.generateDeviationReport();

        selectedHexes.clear();
        requestAnimationFrame(draw);
    }, 500);
}

async function runMgT2EBottomUpMacro(skipPop = false) {
    if (!validateSelection('generate', !skipPop)) return;

    console.log("Bulk Generating MgT2E Bottom-Up Full System...");
    await ensureNamesLoaded();

    if (!confirm("This will completely overwrite ANY existing data in the selected hexes with a Bottom-Up Mongoose 2E Generation sequence. Proceed?")) {
        return;
    }

    const targetHexes = currentActionHexes();
    saveHistoryState('MgT2E Bottom-Up Macro', { hexIds: targetHexes });

    // v0.6.1.0: Statistical auditor
    const _auditor_mgt2e_bu = (typeof StatisticalAuditor !== 'undefined')
        ? new StatisticalAuditor('mgt2e', targetHexes.length <= 80)
        : null;

    // 1. Auto Populate
    // Use "-pop" salt so the populate check doesn't share a seed with the first
    // generation roll — without it, SYSTEM_PRESENT hexes are exactly those where
    // rng() < 0.5, biasing the first roll in every generated system.
    if (!skipPop) {
        targetHexes.forEach(hexId => {
            if (typeof reseedForHex === 'function') reseedForHex(hexId + "-pop");
            const roll = typeof roll1D === 'function' ? roll1D() : Math.floor(Math.random() * 6) + 1;
            if (roll <= 3) {
                hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
            } else {
                hexStates.set(hexId, { type: 'EMPTY' });
            }
        });
        if (typeof draw === 'function') requestAnimationFrame(draw);
        if (typeof showToast === 'function') showToast(`Populated ${targetHexes.length} hex(es)...`, 1000);
    }

    // 2. Generate
    setTimeout(() => {
        if (window.isLoggingEnabled) window.batchLogData = [];
        let count = 0;
        targetHexes.forEach(hexId => {
            try {
                let stateObj = hexStates.get(hexId);
                if (window.isLoggingEnabled) {
                    writeLogLine(`[PROBE] Target Hex ${hexId}: stateObj exists? ${!!stateObj}, type: ${stateObj?.type}`);
                }
                if (stateObj && stateObj.type === 'SYSTEM_PRESENT') {
                    if (window.isLoggingEnabled && typeof startTrace === 'function') {
                        startTrace(hexId, 'Bottom-Up MgT2E Generation', hexId);
                    }

                    if (typeof MgT2EBottomUpGenerator !== 'undefined') {
                        if (window.isLoggingEnabled) writeLogLine(`[PROBE] Calling MgT2EBottomUpGenerator.generateSystem for ${hexId}...`);
                        const sys = MgT2EBottomUpGenerator.generateSystem(hexId);
                        if (window.isLoggingEnabled) writeLogLine(`[PROBE] ${hexId} generator returned: ${sys ? 'SYSTEM_OBJECT' : 'NULL'}`);

                        // Ensure Mainworld exists and has a name
                        if (sys) {
                            // Find the Mainworld - explicitly check for lunar mainworlds if not at top level
                            let mainworld = sys.worlds.find(w => w.type === 'Mainworld' || w.isLunarMainworld);
                            
                            if (!mainworld) {
                                // Search moons
                                for (let w of sys.worlds) {
                                    if (w.moons) {
                                        let foundMoon = w.moons.find(m => m.type === 'Mainworld' || m.isLunarMainworld);
                                        if (foundMoon) {
                                            mainworld = foundMoon;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            mainworld = mainworld || sys.mainworld || sys.worlds[0];
                            if (window.isLoggingEnabled) writeLogLine(`[PROBE] ${hexId} mapped mainworld: ${mainworld?.name || 'Unnamed'}`);

                            // Sean Protocol: sys.gasGiants is authoritative in bottom-up;
                            // override the socio engine's independent gasGiant roll.
                            mainworld.gasGiant = sys.gasGiants > 0;

                            // Map resulting data to stateObj (Sean Protocol: Orchestrator maps generated data to UI state)
                            stateObj.mgtSystem = sys;
                            stateObj.mgt2eData = mainworld;
                            stateObj.mgtSocio = mainworld;
                            stateObj.name = mainworld.name;

                            // v0.6.1.0: Statistical auditor
                            if (_auditor_mgt2e_bu && mainworld) {
                                _auditor_mgt2e_bu.recordSystem({
                                    stars:          sys.stars ? sys.stars.length : 1,
                                    isMoonMainworld: !!(mainworld.isLunarMainworld || mainworld.isMoon),
                                    size:           mainworld.size || 0,
                                    atmosphere:     mainworld.atmCode !== undefined ? mainworld.atmCode : (mainworld.atm || 0),
                                    hydrosphere:    mainworld.hydroCode !== undefined ? mainworld.hydroCode : (mainworld.hydro || 0),
                                    population:     mainworld.popCode !== undefined ? mainworld.popCode : (mainworld.pop || 0),
                                    starport:       mainworld.starport || 'X',
                                    techLevel:      mainworld.tl || 0
                                });
                                // Record temperatures for every body (mainworld + non-mainworld)
                                const _walkTemps = (bodies) => {
                                    bodies.forEach(w => {
                                        if (w.meanTempK !== undefined)
                                            _auditor_mgt2e_bu.recordWorldTemp(w.meanTempK, hexId, w.orbitId, w.name || w.type || 'World', w.type);
                                        if (w.moons) _walkTemps(w.moons);
                                    });
                                };
                                if (sys && sys.worlds) _walkTemps(sys.worlds);

                                // Record biological (life) data — planets and moons only, no Gas Giants or belts
                                let _lifeSystemHasLife = false;
                                let _lifeTotalWorlds   = 0;
                                let _lifeWorldsWithLife = 0;
                                const _walkLife = (bodies) => {
                                    bodies.forEach(w => {
                                        if (w.type !== 'Gas Giant' && w.type !== 'Planetoid Belt') {
                                            _lifeTotalWorlds++;
                                            if ((w.biomass || 0) > 0) { _lifeWorldsWithLife++; _lifeSystemHasLife = true; }
                                        }
                                        if (w.moons) _walkLife(w.moons);
                                    });
                                };
                                if (sys && sys.worlds) _walkLife(sys.worlds);
                                _auditor_mgt2e_bu.recordLifeData(_lifeSystemHasLife, _lifeTotalWorlds, _lifeWorldsWithLife);
                            }

                            // Clean up old data variants to prevent UI ghosting
                            stateObj.ctData = null;
                            stateObj.t5Data = null;
                            stateObj.ctSystem = null;
                            stateObj.t5System = null;
                            stateObj.ctPhysical = null;
                            stateObj.t5Socio = null;
                            stateObj.rttData = null;
                            stateObj.aowSystem = null;

                            computeSystemCounts(stateObj);
                            hexStates.set(hexId, stateObj);
                            count++;
                        }
                    } else {
                        console.error(`MgT2EBottomUpGenerator object not globally available.`);
                    }

                    if (window.isLoggingEnabled && typeof endTrace === 'function') {
                        endTrace();
                    }
                }
            } catch (err) {
                console.error(`Bottom-Up MgT2E Macro failed for hex ${hexId}:`, err);
            }
        });

        _printLumTally('MgT2E BU', targetHexes, 'mgtSystem');
        _printWetWorldPct('MgT2E BU', targetHexes);

        if (window.isLoggingEnabled && window.batchLogData && window.batchLogData.length > 0) {
            if (typeof downloadBatchLog === 'function') downloadBatchLog('MgT2E_BottomUp_Full_Macro', targetHexes.length);
        }

        if (typeof draw === 'function') {
            requestAnimationFrame(draw);
        }

        if (count > 0) {
            if (typeof showToast === 'function') {
                showToast(`Full Bottom-Up MgT2E Generation Complete for ${count} system(s)!`, 4000);
            }
        } else {
            console.warn("No populated hexes were updated.");
            if (typeof showToast === 'function') {
                showToast("No populated hexes to update. Ensure selection contains populated hexes.", 4000);
            }
        }
        // Refresh both visibility and styling rules for the new systems
        if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
        if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

        // v0.6.1.0: Emit deviation report
        if (_auditor_mgt2e_bu && count > 0) _auditor_mgt2e_bu.generateDeviationReport();

        selectedHexes.clear();
        requestAnimationFrame(draw);
    }, 500);
}

// ============================================================================
// CT MANUAL FIELD MERGE
// After CT_Generator produces a fresh sys object, this function walks the old
// ctSystem (if any) and copies manually-edited fields onto matching bodies in
// the new system.  Matching keys: stars by sidx, orbits by orbit number,
// captured planets by orbit float, satellites by satIdx.
// Manual edits survive regeneration; only an explicit hex clear wipes them.
// ============================================================================
function _mergeCTManualFields(oldSys, newSys) {
    if (!oldSys || !newSys || typeof isManual !== 'function') return;

    function _copyManual(src, dst) {
        if (!src || !dst || !Array.isArray(src._manualFields) || src._manualFields.length === 0) return;
        if (!Array.isArray(dst._manualFields)) dst._manualFields = [];
        src._manualFields.forEach(function (field) {
            dst[field] = src[field];
            if (!dst._manualFields.includes(field)) dst._manualFields.push(field);
        });
    }

    // Stars — matched by index
    (oldSys.stars || []).forEach(function (oldStar, sidx) {
        var newStar = (newSys.stars || [])[sidx];
        if (newStar) _copyManual(oldStar, newStar);
    });

    // Orbit bodies — matched by orbit number; satellites by satIdx
    (newSys.orbits || []).forEach(function (newSlot) {
        if (!newSlot || !newSlot.contents) return;
        var oldSlot = (oldSys.orbits || []).find(function (o) { return o.orbit === newSlot.orbit; });
        if (!oldSlot || !oldSlot.contents) return;
        _copyManual(oldSlot.contents, newSlot.contents);
        (newSlot.contents.satellites || []).forEach(function (newSat, satIdx) {
            var oldSat = (oldSlot.contents.satellites || [])[satIdx];
            if (oldSat) _copyManual(oldSat, newSat);
        });
    });

    // Captured Planets — matched by orbit float
    (newSys.capturedPlanets || []).forEach(function (newCP) {
        var oldCP = (oldSys.capturedPlanets || []).find(function (p) { return p.orbit === newCP.orbit; });
        if (oldCP) _copyManual(oldCP, newCP);
    });
}

async function runCTNewMacro(skipPop = false) {
    if (!validateSelection('generate', !skipPop)) return;

    console.log("Bulk Generating CT (New Modular) Full System...");
    await ensureNamesLoaded();

    const targetHexes = currentActionHexes();
    saveHistoryState('CT New Macro', { hexIds: targetHexes });

    // Warn if any selected hex has manually-overridden CT fields
    let _ctManualCount = 0;
    targetHexes.forEach(hexId => {
        const s = hexStates.get(hexId);
        if (s && s.ctSystem) _ctManualCount += countManualCTBodies(s.ctSystem);
    });
    const _ctManualWarning = _ctManualCount > 0
        ? `\n\nNOTE: ${_ctManualCount} body/bodies in this selection have manual field overrides. These will be preserved where orbit positions match the regenerated structure.`
        : '';

    if (!confirm(`This will completely overwrite ANY existing data in the selected hexes with the NEW Modular Classic Traveller Generation sequence.${_ctManualWarning}\n\nProceed?`)) {
        return;
    }

    // v0.6.1.0: Statistical auditor
    const _auditor_ct = (typeof StatisticalAuditor !== 'undefined')
        ? new StatisticalAuditor('ct', targetHexes.length <= 80)
        : null;

    // 1. Auto Populate
    // Use "-pop" salt so the populate check doesn't share a seed with the first
    // generation roll — without it, SYSTEM_PRESENT hexes are exactly those where
    // rng() < 0.5, biasing the first roll in every generated system.
    if (!skipPop) {
        targetHexes.forEach(hexId => {
            reseedForHex(hexId + "-pop");
            const roll = roll1D();
            if (roll <= 3) {
                hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
            } else {
                hexStates.set(hexId, { type: 'EMPTY' });
            }
        });
        requestAnimationFrame(draw);
        showToast(`Populated ${targetHexes.length} hex(es)...`, 1000);
    }


    // 2. Generate and Expand
    setTimeout(() => {
        if (window.isLoggingEnabled) window.batchLogData = [];
        let count = 0;
        targetHexes.forEach(hexId => {
            try {
                let stateObj = hexStates.get(hexId);
                if (stateObj && stateObj.type === 'SYSTEM_PRESENT') {
                    // Start trace if logging
                    if (window.isLoggingEnabled) startTrace(hexId, 'Modular CT Generation', hexId);

                    // Step A: Generate Mainworld UWP (Port, size, atm, hyd, pop, gov, law, tl)
                    let mwData = null;
                    if (window.CT_World_Engine) {
                        mwData = window.CT_World_Engine.generateModularMainworld(hexId);
                    } else {
                        // Fallback to legacy if world engine is somehow not globally available, though it should be.
                        mwData = generateCTMainworld(hexId);
                    }
                    // Step B: Modular Expansion (Top-Down)
                    if (window.CT_Generator) {
                        const _oldCtSys = stateObj.ctSystem;
                        const sys = window.CT_Generator.generateSystem({
                            mode: 'top-down',
                            mainworldUWP: mwData,
                            hexId: hexId
                        });
                        if (sys && _oldCtSys) _mergeCTManualFields(_oldCtSys, sys);
                        stateObj.ctSystem = sys;
                        stateObj.ctData = sys.mainworld; // Sean Protocol: Map finalized world to UI state

                        // v0.6.1.0: Statistical auditor
                        if (_auditor_ct && sys.mainworld) {
                            const mw = sys.mainworld;
                            _auditor_ct.recordSystem({
                                stars:          sys.stars ? sys.stars.length : 1,
                                isMoonMainworld: !!(mw.isLunarMainworld || mw.isMoon),
                                size:           mw.size || 0,
                                atmosphere:     mw.atm || 0,
                                hydrosphere:    mw.hydro || 0,
                                population:     mw.pop || 0,
                                starport:       mw.starport || 'X',
                                techLevel:      mw.tl || 0
                            });
                        }
                    }

                    // Clean up variants
                    stateObj.rttData = null;
                    stateObj.mgt2eData = null;
                    stateObj.t5Data = null;
                    stateObj.mgtSystem = null;
                    stateObj.t5System = null;
                    stateObj.ctPhysical = null;
                    stateObj.aowSystem = null;
                    computeSystemCounts(stateObj);
                    hexStates.set(hexId, stateObj);

                    count++;
                    if (window.isLoggingEnabled) endTrace();
                }
            } catch (err) {
                console.error(`Modular CT Macro failed for hex ${hexId}:`, err);
                alert(`CT Macro Error for hex ${hexId}:\n${err.message}\nCheck console for full trace.`);
            }
        });

        _printLumTally('CT', targetHexes, 'ctSystem');
        _printWetWorldPct('CT', targetHexes);

        if (window.isLoggingEnabled && window.batchLogData.length > 0) {
            downloadBatchLog('CT_Modular_Full_Macro', targetHexes.length);
        }
        requestAnimationFrame(draw);
        if (count > 0) {
            showToast(`Full Modular CT Generation Complete for ${count} system(s)!`, 4000);
        } else {
            alert("No populated hexes to update. Ensure selection contains populated hexes.");
        }
        // Refresh both visibility and styling rules for the new systems
        if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
        if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

        // v0.6.1.0: Emit deviation report
        if (_auditor_ct && count > 0) _auditor_ct.generateDeviationReport();

        selectedHexes.clear();
        requestAnimationFrame(draw);
    }, 500);
}

async function runCTBottomUpMacro(skipPop = false) {
    if (!validateSelection('generate', !skipPop)) return;

    console.log("Bulk Generating CT Bottom-Up Full System...");
    await ensureNamesLoaded();

    const targetHexes = currentActionHexes();
    saveHistoryState('CT Bottom-Up Macro', { hexIds: targetHexes });

    // Warn if any selected hex has manually-overridden CT fields
    let _ctManualCount = 0;
    targetHexes.forEach(hexId => {
        const s = hexStates.get(hexId);
        if (s && s.ctSystem) _ctManualCount += countManualCTBodies(s.ctSystem);
    });
    const _ctManualWarning = _ctManualCount > 0
        ? `\n\nNOTE: ${_ctManualCount} body/bodies in this selection have manual field overrides. These will be preserved where orbit positions match the regenerated structure.`
        : '';

    if (!confirm(`This will completely overwrite ANY existing data in the selected hexes with a Bottom-Up Classic Traveller Generation sequence.${_ctManualWarning}\n\nProceed?`)) {
        return;
    }

    // v0.6.1.0: Statistical auditor
    const _auditor_ct_bu = (typeof StatisticalAuditor !== 'undefined')
        ? new StatisticalAuditor('ct', targetHexes.length <= 80)
        : null;

    // 1. Auto Populate
    // Use "-pop" salt so the populate check doesn't share a seed with the first
    // generation roll — without it, SYSTEM_PRESENT hexes are exactly those where
    // rng() < 0.5, biasing the first roll in every generated system.
    if (!skipPop) {
        targetHexes.forEach(hexId => {
            reseedForHex(hexId + "-pop");
            const roll = roll1D();
            if (roll <= 3) {
                hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
            } else {
                hexStates.set(hexId, { type: 'EMPTY' });
            }
        });
        requestAnimationFrame(draw);
        showToast(`Populated ${targetHexes.length} hex(es)...`, 1000);
    }


    // 2. Generate
    setTimeout(() => {
        if (window.isLoggingEnabled) window.batchLogData = [];
        let count = 0;
        targetHexes.forEach(hexId => {
            try {
                let stateObj = hexStates.get(hexId);
                if (stateObj && stateObj.type === 'SYSTEM_PRESENT') {
                    if (window.isLoggingEnabled) startTrace(hexId, 'Bottom-Up CT Generation', hexId);

                    if (window.CT_Generator) {
                        const _oldCtSys = stateObj.ctSystem;
                        const sys = window.CT_Generator.generateSystem({
                            mode: 'bottom-up',
                            hexId: hexId
                        });

                        // Ensure Mainworld exists and has a name
                        if (sys && sys.mainworld) {
                            if (!sys.mainworld.name) {
                                sys.mainworld.name = (typeof getNextSystemName !== 'undefined') ? getNextSystemName(hexId) : 'Unknown';
                            }
                            if (_oldCtSys) _mergeCTManualFields(_oldCtSys, sys);
                            stateObj.ctSystem = sys;
                            stateObj.ctData = sys.mainworld;

                            // v0.6.1.0: Statistical auditor
                            if (_auditor_ct_bu) {
                                const mw = sys.mainworld;
                                _auditor_ct_bu.recordSystem({
                                    stars:          sys.stars ? sys.stars.length : 1,
                                    isMoonMainworld: !!(mw.isLunarMainworld || mw.isMoon),
                                    size:           mw.size || 0,
                                    atmosphere:     mw.atm || 0,
                                    hydrosphere:    mw.hydro || 0,
                                    population:     mw.pop || 0,
                                    starport:       mw.starport || 'X',
                                    techLevel:      mw.tl || 0
                                });
                            }

                            // Clean up variants
                            stateObj.rttData = null;
                            stateObj.mgt2eData = null;
                            stateObj.t5Data = null;
                            stateObj.mgtSystem = null;
                            stateObj.t5System = null;
                            stateObj.ctPhysical = null;
                            stateObj.aowSystem = null;
                            computeSystemCounts(stateObj);
                            hexStates.set(hexId, stateObj);
                            count++;
                        }
                    }

                    if (window.isLoggingEnabled) endTrace();
                }
            } catch (err) {
                console.error(`Bottom-Up CT Macro failed for hex ${hexId}:`, err);
            }
        });

        _printLumTally('CT BU', targetHexes, 'ctSystem');
        _printWetWorldPct('CT BU', targetHexes);

        if (window.isLoggingEnabled && window.batchLogData.length > 0) {
            downloadBatchLog('CT_BottomUp_Full_Macro', targetHexes.length);
        }
        requestAnimationFrame(draw);
        if (count > 0) {
            showToast(`Full Bottom-Up CT Generation Complete for ${count} system(s)!`, 4000);
        } else {
            alert("No populated hexes to update. Ensure selection contains populated hexes.");
        }
        // Refresh both visibility and styling rules for the new systems
        if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
        if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

        // v0.6.1.0: Emit deviation report
        if (_auditor_ct_bu && count > 0) _auditor_ct_bu.generateDeviationReport();

        selectedHexes.clear();
        requestAnimationFrame(draw);
    }, 500);
}

async function runRTTMacro(skipPop = false) {
    if (!validateSelection('generate', !skipPop)) return;

    if (window.isLoggingEnabled) window.batchLogData = [];

    console.log("Bulk Generating RTT Full System...");
    await ensureNamesLoaded();

    const targetHexes = currentActionHexes();
    saveHistoryState('RTT Macro', { hexIds: targetHexes });

    // Warn if any selected hex has manually-overridden fields that will be lost
    let totalManualBodies = 0;
    targetHexes.forEach(hexId => {
        const s = hexStates.get(hexId);
        if (s && s.rttSystem) totalManualBodies += countManualBodies(s.rttSystem);
    });
    const manualWarning = totalManualBodies > 0
        ? `\n\nWARNING: ${totalManualBodies} body/bodies in this selection have manual field overrides. These will be permanently lost.`
        : '';

    if (!confirm(`This will completely overwrite ANY existing data in the selected hexes with a Full RTT Generation sequence.${manualWarning}\n\nProceed?`)) {
        return;
    }

    // v0.6.1.0: Statistical auditor
    const _auditor_rtt = (typeof StatisticalAuditor !== 'undefined')
        ? new StatisticalAuditor('rtt', targetHexes.length <= 80)
        : null;

    // 1. Auto Populate (Standard 3 in 6)
    // Use "-pop" salt so the populate check doesn't share a seed with the first
    // generation roll — without it, SYSTEM_PRESENT hexes are exactly those where
    // rng() < 0.5, biasing the first roll in every generated system.
    if (!skipPop) {
        targetHexes.forEach(hexId => {
            reseedForHex(hexId + "-pop");
            const roll = roll1D();
            if (roll <= 3) {
                hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
            } else {
                hexStates.set(hexId, { type: 'EMPTY' });
            }
        });
        requestAnimationFrame(draw);
        showToast(`Populated ${targetHexes.length} hex(es)...`, 1000);
    }


    // 2. Generate Systems
    setTimeout(() => {
        let count = 0;
        let noWorldCount = 0;
        targetHexes.forEach(hexId => {
            try {
                let stateObj = hexStates.get(hexId);
                if (stateObj && stateObj.type === 'SYSTEM_PRESENT') {
                    // Start RTT Generation Pipeline
                    stateObj.rttSystem = generateRTTSectorStep1(hexId);

                    // Extract UW for display
                    if (stateObj.rttSystem) {
                        stateObj.rttData = extractRTTMainworld(stateObj.rttSystem);

                        // v0.6.1.0: Statistical auditor
                        if (_auditor_rtt && stateObj.rttData) {
                            const mw = stateObj.rttData;
                            _auditor_rtt.recordSystem({
                                stars:          stateObj.rttSystem.stars ? stateObj.rttSystem.stars.length : 1,
                                isMoonMainworld: !!(mw.isLunarMainworld || mw.isMoon),
                                size:           mw.size || 0,
                                atmosphere:     mw.atm || 0,
                                hydrosphere:    mw.hydro || 0,
                                population:     mw.pop || 0,
                                starport:       mw.starport || 'X',
                                techLevel:      mw.tl || 0
                            });
                        }

                        // Track systems with no planetary bodies
                        const hasAnyOrbits = stateObj.rttSystem.stars.some(
                            s => s.planetarySystem && s.planetarySystem.orbits.length > 0
                        );
                        if (!hasAnyOrbits) noWorldCount++;

                        // Clear other data
                        stateObj.ctData = null;
                        stateObj.mgt2eData = null;
                        stateObj.t5Data = null;
                        stateObj.ctSystem = null;
                        stateObj.mgtSystem = null;
                        stateObj.t5System = null;
                        stateObj.ctPhysical = null;
                        stateObj.mgtPhysical = null;
                        stateObj.t5Physical = null;
                        stateObj.mgtSocio = null;
                        stateObj.t5Socio = null;
                        stateObj.aowSystem = null;
                        computeSystemCounts(stateObj);
                        hexStates.set(hexId, stateObj);
                        count++;
                    }
                }
            } catch (err) {
                console.error(`RTT Macro Step 2 failed for hex ${hexId}:`, err);
            }
        });

        if (window.isLoggingEnabled && count > 0) {
            const noWorldPct = ((noWorldCount / count) * 100).toFixed(1);
            window.batchLogData.push(`========================================================`);
            window.batchLogData.push(`RTT GENERATION SUMMARY`);
            window.batchLogData.push(`  Systems generated : ${count}`);
            window.batchLogData.push(`  No-world systems  : ${noWorldCount} (${noWorldPct}%)`);
            window.batchLogData.push(`========================================================`);
        }

        _printLumTally('RTT', targetHexes, 'rttSystem');
        _printWetWorldPct('RTT', targetHexes);

        if (window.isLoggingEnabled && window.batchLogData.length > 0) {
            downloadBatchLog('RTT_Full_Macro', targetHexes.length);
        }

        if (window.isLoggingEnabled && count > 0) {
            const noWorldPct = ((noWorldCount / count) * 100).toFixed(1);
            alert(`RTT Generation Summary\n\nSystems generated: ${count}\nNo-world systems: ${noWorldCount} (${noWorldPct}%)`);
        }

        requestAnimationFrame(draw);
        if (count > 0) {
            showToast(`Full RTT Generation Complete for ${count} system(s)!`, 4000);
        } else {
            alert("No populated hexes to update. Ensure selection contains populated hexes.");
        }
        // Refresh both visibility and styling rules for the new systems
        if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
        if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

        // v0.6.1.0: Emit deviation report
        if (_auditor_rtt && count > 0) _auditor_rtt.generateDeviationReport();

        selectedHexes.clear();
        requestAnimationFrame(draw);
    }, 500);
}

// ============================================================================
// AoW BOTTOM-UP MACRO
// ============================================================================

async function runAoWMacro(skipPop = false) {
    if (!validateSelection('generate', !skipPop)) return;

    if (window.isLoggingEnabled) window.batchLogData = [];

    console.log("Bulk Generating AoW Bottom-Up Full System...");
    await ensureNamesLoaded();

    const targetHexes = currentActionHexes();
    saveHistoryState('AoW Macro', { hexIds: targetHexes });

    if (!confirm(`This will completely overwrite ANY existing data in the selected hexes with a Full Architect of Worlds (Bottom-Up) generation sequence.\n\nProceed?`)) {
        return;
    }

    // 1. Auto Populate (Standard 3 in 6)
    // Use "-pop" salt so the populate check doesn't share a seed with the stellar
    // engine's first roll — without it, SYSTEM_PRESENT hexes are exactly those
    // where rng() < 0.5, causing rollD100() in generation to always be ≤ 50.
    if (!skipPop) {
        targetHexes.forEach(hexId => {
            reseedForHex(hexId + "-pop");
            const roll = roll1D();
            if (roll <= 3) {
                hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
            } else {
                hexStates.set(hexId, { type: 'EMPTY' });
            }
        });
        requestAnimationFrame(draw);
        showToast(`Populated ${targetHexes.length} hex(es)...`, 1000);
    }

    // 2. Generate Systems
    setTimeout(() => {
        let count = 0;

        targetHexes.forEach(hexId => {
            try {
                let stateObj = hexStates.get(hexId);
                if (stateObj && stateObj.type === 'SYSTEM_PRESENT') {
                    const newSys = (window.AoWBottomUpGenerator && window.AoWBottomUpGenerator.generateAoWSystemBottomUp)
                        ? window.AoWBottomUpGenerator.generateAoWSystemBottomUp(hexId)
                        : (typeof generateAoWSystemBottomUp === 'function' ? generateAoWSystemBottomUp(hexId) : null);

                    if (newSys) {
                        stateObj.aowSystem = newSys;

                        // Bridge the mainworld to the MgT2E display fields (AoW uses MgT2E socio)
                        const mainworld = newSys.mainworld || null;
                        stateObj.mgt2eData = mainworld;
                        stateObj.mgtSocio  = mainworld;
                        stateObj.name      = mainworld ? mainworld.name : null;

                        // Clear all other engine data
                        stateObj.ctData      = null;
                        stateObj.t5Data      = null;
                        stateObj.rttData     = null;
                        stateObj.ctSystem    = null;
                        stateObj.mgtSystem   = null;
                        stateObj.t5System    = null;
                        stateObj.rttSystem   = null;
                        stateObj.ctPhysical  = null;
                        stateObj.mgtPhysical = null;
                        stateObj.t5Physical  = null;
                        stateObj.t5Socio     = null;

                        computeSystemCounts(stateObj);
                        hexStates.set(hexId, stateObj);
                        count++;
                    }
                }
            } catch (err) {
                console.error(`AoW Macro failed for hex ${hexId}:`, err);
            }
        });

        _printLumTally('AoW', targetHexes, 'aowSystem');
        _printWetWorldPct('AoW', targetHexes);

        if (window.isLoggingEnabled && window.batchLogData.length > 0) {
            downloadBatchLog('AoW_Full_Macro', targetHexes.length);
        }

        requestAnimationFrame(draw);
        if (count > 0) {
            showToast(`Full AoW Generation Complete for ${count} system(s)!`, 4000);
        } else {
            alert("No populated hexes to update. Ensure selection contains populated hexes.");
        }
        if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
        if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

        selectedHexes.clear();
        requestAnimationFrame(draw);
    }, 500);
}

async function runT5Macro(skipPop = false) {
    if (!validateSelection('generate', !skipPop)) return;

    if (window.isLoggingEnabled) window.batchLogData = [];

    console.log("Bulk Generating T5 Full System...");
    await ensureNamesLoaded();

    if (!confirm("This will completely overwrite ANY existing data in the selected hexes with a Full T5 Generation sequence. Proceed?")) {
        return;
    }

    const targetHexes = currentActionHexes();
    saveHistoryState('T5 Macro', { hexIds: targetHexes });

    // v0.6.1.0: Statistical auditor
    const _auditor_t5 = (typeof StatisticalAuditor !== 'undefined')
        ? new StatisticalAuditor('t5', targetHexes.length <= 80)
        : null;

    // 1. Auto Populate (Standard 3 in 6)
    // Use "-pop" salt so the populate check doesn't share a seed with the first
    // generation roll — without it, SYSTEM_PRESENT hexes are exactly those where
    // rng() < 0.5, biasing the first roll in every generated system.
    if (!skipPop) {
        targetHexes.forEach(hexId => {
            reseedForHex(hexId + "-pop");
            const roll = roll1D();
            if (roll <= 3) {
                hexStates.set(hexId, { type: 'SYSTEM_PRESENT' });
            } else {
                hexStates.set(hexId, { type: 'EMPTY' });
            }
        });
        requestAnimationFrame(draw);
        showToast(`Populated ${targetHexes.length} hex(es)...`, 1000);
    }


    // 2. Generate T5 Mainworlds
    setTimeout(() => {
        targetHexes.forEach(hexId => {
            try {
                let stateObj = hexStates.get(hexId);
                if (stateObj && stateObj.type === 'SYSTEM_PRESENT') {
                    if (window.System_Driver) {
                        const sys = window.System_Driver.generateSystem({
                            edition: 'T5',
                            mode: 'top-down',
                            mainworldUWP: window.T5_World_Engine.generateT5Mainworld(hexId),
                            hexId: hexId
                        });
                        stateObj.t5System = sys;
                        stateObj.t5Data = sys.mainworld;
                        stateObj.name = getNextSystemName(hexId);
                        if (stateObj.t5Data) stateObj.t5Data.name = stateObj.name;
                        stateObj.t5Socio = (window.T5_Socio_Engine) ? window.T5_Socio_Engine.generateT5Socioeconomics(sys.mainworld, hexId) : null;

                        // v0.6.1.0: Statistical auditor
                        if (_auditor_t5 && sys.mainworld) {
                            const mw = sys.mainworld;
                            _auditor_t5.recordSystem({
                                stars:          sys.stars ? sys.stars.length : 1,
                                isMoonMainworld: !!(mw.isLunarMainworld || mw.isMoon),
                                size:           mw.size || 0,
                                atmosphere:     mw.atmCode !== undefined ? mw.atmCode : (mw.atm || 0),
                                hydrosphere:    mw.hydroCode !== undefined ? mw.hydroCode : (mw.hydro || 0),
                                population:     mw.popCode !== undefined ? mw.popCode : (mw.pop || 0),
                                starport:       mw.starport || 'X',
                                techLevel:      mw.tl || 0
                            });
                        }
                    } else {
                        // Legacy Fallback
                        stateObj.t5Data = generateT5Mainworld(hexId);
                        stateObj.name = getNextSystemName(hexId);
                    }

                    // Clear variants to ensure fresh generation
                    stateObj.ctData = null;
                    stateObj.mgt2eData = null;
                    stateObj.ctSystem = null;
                    stateObj.mgtSystem = null;
                    stateObj.ctPhysical = null;
                    stateObj.mgtPhysical = null;
                    stateObj.t5Physical = null;
                    stateObj.mgtSocio = null;
                    computeSystemCounts(stateObj);
                    hexStates.set(hexId, stateObj);
                }
            } catch (err) {
                console.error(`T5 Macro Step 2 failed for hex ${hexId}:`, err);
            }
        });
        _printLumTally('T5', targetHexes, 't5System');
        _printWetWorldPct('T5', targetHexes);

        requestAnimationFrame(draw);
        showToast(`Generated T5 Systems (Top-Down)...`, 1000);

        if (window.isLoggingEnabled && window.batchLogData.length > 0) {
            downloadBatchLog('T5_Full_Macro', targetHexes.length);
        }

        // Count how many hexes are actually populated now
        let count = 0;
        targetHexes.forEach(hx => {
            if (hexStates.get(hx)?.type === 'SYSTEM_PRESENT') count++;
        });

        if (count > 0) {
            if (typeof showToast === 'function') {
                showToast(`Full T5 Generation Complete!`, 4000);
            }
        } else {
            alert("No populated hexes to update. Ensure selection contains populated hexes.");
        }
        // Refresh both visibility and styling rules for the new systems
        if (typeof window.reapplyAllRules === 'function') window.reapplyAllRules();
        if (typeof window.applyActiveFilters === 'function') window.applyActiveFilters();

        // v0.6.1.0: Emit deviation report
        if (_auditor_t5 && count > 0) _auditor_t5.generateDeviationReport();

        selectedHexes.clear();
        requestAnimationFrame(draw);
    }, 500);
}