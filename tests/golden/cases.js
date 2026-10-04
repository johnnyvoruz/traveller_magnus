import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { bordersElementOf, regionsElementOf, MetadataDOMParser } from '../oracle/xml_dom.js';

export const TSV = [
    'Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars\t{Ix}\t(Ex)\t[Cx]\tNobility\tW\tRU',
    '1910\tRegina\tA788899-C\tNS\tRi Pa Ph An Cp (Amindii)2 Varg0 Asla0 Sa\t\t703\tImDd\tF7 V BD M3 V\t{ 4 }\t(D7E+5)\t[9C6D]\tBcCeF\t8\t7000',
    '1912\tTannous\tC663A98-9\tN\tHi In Pa Cs\tA\t824\tImDd\tG3 V\t{ 2 }\t(B9C+1)\t[6B4A]\tBcCF\t5\t1000',
].join('\n');

export const settings = TRUTH_SETTINGS;
export const seed = 'TravellerMagnus';

// Each case returns a plain object. Legacy hex ids are "<sectorNum>-<subsectorLetter>-<hhhh>"
// (core.js:348-360, io_manager.js:2025); parseT5Tab takes the slot as a STRING ('1', io_manager.js:1974).
// Regina 1910 is subsector C of sector 1: column 19 → floor(18/8) = 2, row 10 → floor(9/10) = 0 → 'C'.
export const cases = {
    mgt2e_topdown_bare:   (ctx) => ctx.generateMgT2ESystemTopDown('1-A-0101', null),
    mgt2e_bottomup:       (ctx) => ctx.generateMgT2ESystemBottomUp('1-A-0102', null),
    mgt2e_flesh_from_tsv: (ctx) => {                           // the truth path: macro_orchestrator.js:340-351
        const rows = ctx.parseT5Tab(TSV, '1');
        for (const [id, state] of rows) ctx.hexStates.set(id, state);
        if (!ctx._buildOneMgtHex('1-C-1910')) throw new Error('_buildOneMgtHex returned false for 1-C-1910');
        return ctx.stripHexViewState(ctx.hexStates.get('1-C-1910'));
    },
    mgt2e_society_expand: (ctx) => {
        const sys = ctx.generateMgT2ESystemTopDown('1-A-0103', null);
        const state = { type: 'SYSTEM_PRESENT' };
        ctx._storeMgtBuild(state, sys);
        delete state.mgtSocio;
        return ctx.expandLoadedSocioeconomicsMgT2E('1-A-0103', state);
    },
    ct_bottomup:          (ctx) => ctx.System_Driver.generateSystem({ edition: 'CT', mode: 'bottom-up', hexId: '1-A-0104' }),
    ct_topdown:           (ctx) => {                           // macro_orchestrator.js:1059-1073
        const hexId = '1-A-0108';
        const mwData = ctx.CT_World_Engine.generateModularMainworld ? ctx.CT_World_Engine.generateModularMainworld(hexId) : ctx.generateCTMainworld(hexId);
        const sys = ctx.CT_Generator.generateSystem({ mode: 'top-down', mainworldUWP: mwData, hexId });
        return { mwData, sys };
    },
    t5_topdown:           (ctx) => {                           // macro_orchestrator.js:1578-1588
        const hexId = '1-A-0105';
        const mw = ctx.T5_World_Engine.generateT5Mainworld(hexId);
        const sys = ctx.System_Driver.generateSystem({ edition: 'T5', mode: 'top-down', mainworldUWP: mw, hexId });
        const socio = ctx.T5_Socio_Engine.generateT5Socioeconomics(sys.mainworld, hexId);
        return { sys, socio, name: ctx.getNextSystemName(hexId) };
    },
    rtt_bottomup:         (ctx) => {                           // macro_orchestrator.js:1335 and the steps runRTTMacro calls after it
        const sys = ctx.generateRTTSectorStep1('1-A-0106');
        return { sys, mainworld: ctx.extractRTTMainworld(sys) };
    },
    aow_bottomup:         (ctx) => ctx.AoWBottomUpGenerator.generateAoWSystemBottomUp('1-A-0107'),
    parse_t5tab:          (ctx) => Object.fromEntries(ctx.parseT5Tab(TSV, '1'))
};

const RAW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../universe/raw');
for (const slug of ['Spinward_Marches', 'Empty_Quarter', 'Solomani_Rim', 'Riftspan_Reaches', 'Verge', 'Gvurrdon']) {
    const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
    cases[`borders_${slug}`] = (ctx) => {
        ctx.hexBorderAssignments = new Map();
        delete ctx.borderDefinitions;
        ctx.importBordersFromXml(bordersElementOf(xml), 1);
        return {
            territories: ctx.borderDefinitions
                .filter(d => d.allegianceCodes && d.allegianceCodes.length)
                .map(d => ({
                    id: d.id, name: d.name, color: d.color, allegianceCodes: d.allegianceCodes,
                    hexes: [...ctx.hexBorderAssignments].filter(([, id]) => id === d.id)
                        .map(([hexId]) => hexId.split('-').pop()).sort(),
                })),
        };
    };
}

// importRegionsFromXml writes state.cluster only when the hex already exists (js/borders.js:1337, 1486-1503).
function fillSlotOne(ctx) {
    ctx.hexStates.clear();
    for (let col = 1; col <= 32; col++) {
        for (let row = 1; row <= 40; row++) {
            const code = String(col).padStart(2, '0') + String(row).padStart(2, '0');
            const subX = Math.floor((col - 1) / 8);
            const subY = Math.floor((row - 1) / 10);
            const sub = String.fromCharCode(65 + (subY * 4 + subX));
            ctx.hexStates.set(`1-${sub}-${code}`, {});
        }
    }
    delete ctx.regionDefinitions;
    delete ctx.regionPaths;
}

for (const slug of ['Riftspan_Reaches', 'Kalash', 'Afawahisa']) {
    const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
    cases[`regions_${slug}`] = (ctx) => {
        fillSlotOne(ctx);
        ctx.importRegionsFromXml(regionsElementOf(xml), 1);
        return {
            regions: ctx.regionDefinitions
                .map(d => ({
                    name: d.name,
                    color: d.color,
                    hexes: [...ctx.hexStates].filter(([, state]) => state.cluster === d.name)
                        .map(([hexId]) => hexId.split('-').pop()).sort(),
                }))
                .filter(d => d.hexes.length > 0),
        };
    };
}

// Colour left on each allegiance's route slot by parseAndAddOtuRoutes.
// An empty coord lookup skips offset routes, the same way a one-sector import does.
function routeColoursOf(ctx, xml, name) {
    ctx.addRoute = () => {};
    ctx.DOMParser = MetadataDOMParser;
    ctx.parseAndAddOtuRoutes(name, xml, 1, 0, 0, new Map(), { importBorders: false, importRegions: false });
    const colours = {};
    for (const def of ctx.routeDefinitions || []) {
        if (!def.groupId || !String(def.groupId).startsWith('otu-route:')) continue;
        colours[def.groupId.slice('otu-route:'.length)] = def.color;
    }
    return { colours };
}

for (const slug of ['Spinward_Marches', 'Gvurrdon', 'Tuglikki']) {
    const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
    cases[`routes_${slug}`] = (ctx) => routeColoursOf(ctx, xml, slug);
}

// Spinward Marches 0101. Flesh from this row yields a gas giant with moons and a planetoid belt.
export const ZEYCUDE_TSV = [
    'Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars\t{Ix}\t(Ex)\t[Cx]\tNobility\tW\tRU',
    '0101\tZeycude\tC430698-9\t\tDe Na Ni Po\t\t613\tZhIN\tK9 V\t{ -1 }\t(C53-1)\t[6559]\t\t8\t-180',
].join('\n');

function builtState(ctx, tsv, id) {
    const rows = ctx.parseT5Tab(tsv, '1');
    for (const [hexId, state] of rows) ctx.hexStates.set(hexId, state);
    if (!ctx._buildOneMgtHex(id)) throw new Error('_buildOneMgtHex returned false for ' + id);
    return ctx.stripHexViewState(ctx.hexStates.get(id));
}

// Stars, then each world, then that world's moons. starColor on stars; surfaceKind on the rest.
export function orbitTextOf(sys, api) {
    const rows = [];
    for (const star of sys.stars || []) {
        rows.push({ rotationText: api.rotationText(star), starColor: api.starColor(star) });
    }
    for (const world of sys.worlds || []) {
        rows.push({ rotationText: api.rotationText(world), surfaceKind: api.surfaceKind(world) });
        for (const moon of world.moons || []) {
            rows.push({ rotationText: api.rotationText(moon), surfaceKind: api.surfaceKind(moon) });
        }
    }
    return rows;
}

cases.orbit_normalize_1 = (ctx) => ctx.SystemViewer.normalizeSystem(builtState(ctx, TSV, '1-C-1910'));
cases.orbit_text_1 = (ctx) => orbitTextOf(ctx.SystemViewer.normalizeSystem(builtState(ctx, TSV, '1-C-1910')), ctx.SystemViewer);
cases.orbit_normalize_2 = (ctx) => ctx.SystemViewer.normalizeSystem(builtState(ctx, ZEYCUDE_TSV, '1-A-0101'));
cases.orbit_text_2 = (ctx) => orbitTextOf(ctx.SystemViewer.normalizeSystem(builtState(ctx, ZEYCUDE_TSV, '1-A-0101')), ctx.SystemViewer);

// Not a case: the legacy metadata XML parser (io_manager.js:2279 parseXmlRouteGroups) needs a browser
// DOMParser, which Node does not have. The new parser (§8) is verified against TravellerMap's documented
// schema and hand-counted values from universe/raw/Spinward_Marches.xml instead.
export const skipped = ['parse_metadata_xml'];
