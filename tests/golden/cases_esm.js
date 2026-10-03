import { parseT5Tab } from '@voyage/shared';
import { TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { SYSTEM_NAMES } from '../../packages/engines/src/generated/names_data.js';
import { loadLegacy } from '../oracle/legacy.js';
import { TSV } from './cases.js';
import {
    configure, setRandomSeed, setNamePool, hexStates, stripHexViewState,
    generateMgT2ESystemTopDown, generateMgT2ESystemBottomUp,
    expandLoadedSocioeconomicsMgT2E, buildOne, storeBuild,
    generateCTSystem, generateModularMainworld, generateSystemSkeleton, processBottomUpSocial, auditCTSystem,
    generateSystem, generateT5Mainworld, generateT5Socioeconomics, getNextSystemName,
    generateRTTSectorStep1, extractRTTMainworld, generateAoWSystemBottomUp
} from '@voyage/engines';

function prepare() {
    configure(TRUTH_SETTINGS);
    const pool = [];
    for (const name of SYSTEM_NAMES) {
        const cleaned = name ? name.trim() : '';
        if (cleaned) pool.push(cleaned);
    }
    pool.sort();
    setNamePool(pool);
    setRandomSeed('TravellerMagnus');
    hexStates.clear();
}

export const pending = [];

export const cases = {
    mgt2e_topdown_bare: () => {
        prepare();
        return generateMgT2ESystemTopDown('1-A-0101', null);
    },
    mgt2e_bottomup: () => {
        prepare();
        return generateMgT2ESystemBottomUp('1-A-0102', null);
    },
    mgt2e_flesh_from_tsv: () => {
        prepare();
        const rows = loadLegacy().parseT5Tab(TSV, '1');
        const state = structuredClone(rows.get('1-C-1910'));
        if (!buildOne(state, '1-C-1910')) throw new Error('buildOne returned false for 1-C-1910');
        return stripHexViewState(state);
    },
    mgt2e_society_expand: () => {
        prepare();
        const sys = generateMgT2ESystemTopDown('1-A-0103', null);
        const state = { type: 'SYSTEM_PRESENT' };
        storeBuild(state, sys);
        delete state.mgtSocio;
        return expandLoadedSocioeconomicsMgT2E('1-A-0103', state);
    },
    ct_bottomup: () => {
        prepare();
        const hexId = '1-A-0104';
        const skeleton = generateSystemSkeleton(hexId, null);
        const sys = processBottomUpSocial(skeleton);
        sys.audit = auditCTSystem(sys);
        return sys;
    },
    ct_topdown: () => {
        prepare();
        const hexId = '1-A-0108';
        const mwData = generateModularMainworld(hexId);
        const sys = generateCTSystem({ mode: 'top-down', mainworldUWP: mwData, hexId });
        return { mwData, sys };
    },
    t5_topdown: () => {
        prepare();
        const hexId = '1-A-0105';
        const mw = generateT5Mainworld(hexId);
        const sys = generateSystem({ edition: 'T5', mode: 'top-down', mainworldUWP: mw, hexId });
        const socio = generateT5Socioeconomics(sys.mainworld, hexId);
        return { sys, socio, name: getNextSystemName(hexId) };
    },
    rtt_bottomup: () => {
        prepare();
        const sys = generateRTTSectorStep1('1-A-0106');
        return { sys, mainworld: extractRTTMainworld(sys) };
    },
    aow_bottomup: () => {
        prepare();
        return generateAoWSystemBottomUp('1-A-0107');
    },
    // Keys are the four-digit hex. The harness maps each fixture key's last segment
    // ("1-C-1910" → "1910") before comparing. Values are not rewritten.
    parse_t5tab: () => Object.fromEntries(parseT5Tab(TSV))
};
