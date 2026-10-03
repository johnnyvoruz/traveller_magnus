import { generateMgT2ESystemTopDown, expandLoadedSocioeconomicsMgT2E } from './mgt2e_topdown_generator.js';

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

function profileOf(state) {
    if (!state) return null;
    return state.mgt2eData || state.t5Data || state.ctData || state.rttData || null;
}

function systemReady(state) {
    const sys = state && state.mgtSystem;
    return !!(sys && sys.stars && sys.stars.length && sys.worlds && sys.worlds.length);
}

function buildStage(state) {
    if (!state || state.type === 'EMPTY') return null;
    const profile = profileOf(state);
    if (state.type !== 'SYSTEM_PRESENT' && !profile) return null;
    if (systemReady(state)) return state.mgtSocio ? null : 'society';
    if (profile) return 'flesh';
    return state.type === 'SYSTEM_PRESENT' ? 'generate' : null;
}

function storeBuild(state, sys) {
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

function buildOne(state, hexKey) {
    const stage = buildStage(state);
    if (!stage) return false;
    const sys = stage === 'society'
        ? expandLoadedSocioeconomicsMgT2E(hexKey, state)
        : stage === 'flesh'
            ? generateMgT2ESystemTopDown(hexKey, profileOf(state), state.t5Socio)
            : generateMgT2ESystemTopDown(hexKey, null);
    if (!sys) return false;
    storeBuild(state, sys);
    return true;
}

export { computeSystemCounts, profileOf, systemReady, buildStage, storeBuild, buildOne };
