import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseT5Tab, parseMetadataXml } from '@voyage/shared';
import { sectorTerritories, sectorRegions, routeColour, routeStylesheetRules } from '@voyage/generation';
import { TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { SYSTEM_NAMES } from '../../packages/engines/src/generated/names_data.js';
import { loadLegacy } from '../oracle/legacy.js';
import { TSV, ZEYCUDE_TSV, orbitTextOf, profileRows, PROFILE_EXTRAS } from './cases.js';
import { normalizeSystem, rotationText, starColor, surfaceKind } from '../../apps/web/src/orbit/system.ts';
import { halo, surfaceProfile } from '../../apps/web/src/surface/profile.ts';
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

const RAW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../universe/raw');
for (const slug of ['Spinward_Marches', 'Empty_Quarter', 'Solomani_Rim', 'Riftspan_Reaches', 'Verge', 'Gvurrdon']) {
    const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
    cases[`borders_${slug}`] = () => {
        const meta = parseMetadataXml(xml);
        return {
            territories: sectorTerritories({
                borders: meta.borders,
                allegiances: meta.allegiances,
                stylesheet: meta.stylesheet,
            }),
        };
    };
}

for (const slug of ['Riftspan_Reaches', 'Kalash', 'Afawahisa']) {
    const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
    cases[`regions_${slug}`] = () => {
        const meta = parseMetadataXml(xml);
        return { regions: sectorRegions({ regions: meta.regions }) };
    };
}

// Same allegiance colour the legacy slot keeps: last non-empty resolution wins.
// Offset routes are skipped because the golden case passes an empty coord lookup.
for (const slug of ['Spinward_Marches', 'Gvurrdon', 'Tuglikki']) {
    const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
    cases[`routes_${slug}`] = () => {
        const meta = parseMetadataXml(xml);
        const rules = routeStylesheetRules(meta.stylesheet);
        const colours = {};
        for (const route of meta.routes) {
            if (!route.Start || !route.End) continue;
            const startOff = parseInt(route.StartOffsetX || '0', 10) !== 0 || parseInt(route.StartOffsetY || '0', 10) !== 0;
            const endOff = parseInt(route.EndOffsetX || '0', 10) !== 0 || parseInt(route.EndOffsetY || '0', 10) !== 0;
            if (startOff || endOff) continue;
            const color = routeColour(route, rules);
            const alleg = (route.Allegiance || '').trim();
            if (!alleg || !color) continue;
            colours[alleg] = color;
        }
        return { colours };
    };
}

function orbitState(tsv, id) {
    prepare();
    const rows = loadLegacy().parseT5Tab(tsv, '1');
    const state = structuredClone(rows.get(id));
    if (!buildOne(state, id)) throw new Error('buildOne returned false for ' + id);
    return stripHexViewState(state);
}

const portApi = { rotationText, starColor, surfaceKind };
const profilePort = { kind: surfaceKind, of: surfaceProfile, halo };
cases.orbit_normalize_1 = () => normalizeSystem(orbitState(TSV, '1-C-1910'));
cases.orbit_text_1 = () => orbitTextOf(normalizeSystem(orbitState(TSV, '1-C-1910')), portApi);
cases.orbit_normalize_2 = () => normalizeSystem(orbitState(ZEYCUDE_TSV, '1-A-0101'));
cases.orbit_text_2 = () => orbitTextOf(normalizeSystem(orbitState(ZEYCUDE_TSV, '1-A-0101')), portApi);
cases.profile_regina = () => profileRows(normalizeSystem(orbitState(TSV, '1-C-1910')), profilePort, '1910');
cases.profile_zeycude = () => profileRows(normalizeSystem(orbitState(ZEYCUDE_TSV, '1-A-0101')), profilePort, '0101');
cases.profile_extra = () => PROFILE_EXTRAS.map((row) => ({
    key: row.key,
    kind: surfaceKind(row.body),
    halo: halo(row.body),
    profile: surfaceProfile(row.body, row.id),
}));
