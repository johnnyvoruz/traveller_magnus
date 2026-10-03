import {
    configure, setRandomSeed, reseedForHex, buildOne, stripHexViewState, toEHex, placeCompanionOrbits,
    generateSystem, generateRTTSectorStep1, generateAoWSystemBottomUp, setNamePool, SYSTEM_NAMES,
} from '@voyage/engines';
import { parseT5Tab, parseMetadataXml, stable, sha256Hex } from '@voyage/shared';

// One pool for the Worker and the local truth build. Trim, keep non-empty, sort.
const namePool = [];
for (const name of SYSTEM_NAMES) {
    const cleaned = name ? name.trim() : '';
    if (cleaned) namePool.push(cleaned);
}
namePool.sort();
setNamePool(namePool);

export type Pinned = { seed: string; settings: Record<string, unknown>; engineVersion: string };
export type Edition = 'MgT2E' | 'CT' | 'T5' | 'RTT' | 'AoW';

export type GenerateHexInput = {
    hexKey: string;
    edition: Edition | string;
    mode: string;
    stage?: string;
    summary: Record<string, any>;
    pinned: Pinned;
    priorBody?: Record<string, any>;
};

/**
 * One hex. The seed id passed to the engines is hexKey ("Spinward_Marches/1910"),
 * not the legacy "<sector>-<letter>-<hhhh>" id. setRandomSeed clears usedNames
 * on every call, so a sector build restarts the name cursor at each hex.
 */
export function generateHex(input: GenerateHexInput) {
    const { hexKey, edition, mode, stage, summary, pinned, priorBody } = input;
    if (summary && summary.partial != null) {
        throw new Error(`generateHex: refusing partial UWP ${summary.uwp ?? ''} (${summary.partial}) for ${hexKey}`);
    }
    configure(pinned.settings);
    setRandomSeed(pinned.seed);
    reseedForHex(hexKey);
    const state: Record<string, any> = priorBody ? structuredClone(priorBody) : structuredClone(summary);
    if (state.t5System && state.t5System.stars) placeCompanionOrbits(state.t5System.stars, hexKey);
    const ed = String(edition);
    if (ed === 'MgT2E') {
        if (!buildOne(state, hexKey)) throw new Error(`buildOne returned false for ${hexKey}`);
    } else if (ed === 'CT' || ed === 'T5') {
        const sys = generateSystem({
            edition: ed,
            mode: mode === 'bottom-up' ? 'bottom-up' : 'top-down',
            hexId: hexKey,
            mainworldUWP: state.t5Data || state.ctData || state,
        });
        if (ed === 'CT') state.ctSystem = sys;
        else state.t5System = sys;
    } else if (ed === 'RTT') {
        state.rttSystem = generateRTTSectorStep1(hexKey);
    } else if (ed === 'AoW') {
        state.aowSystem = generateAoWSystemBottomUp(hexKey);
    } else {
        throw new Error(`unknown edition ${edition}`);
    }
    return {
        kind: 'tree' as const,
        engineVersion: pinned.engineVersion,
        derivation: {
            edition: ed,
            mode,
            seed: pinned.seed,
            settings: pinned.settings,
            inputs: { stage: stage ?? null, summary, priorBody: priorBody ?? null },
        },
        hexKey,
        body: stripHexViewState(state),
    };
}

const TRUTH_VERSION = 'v1';

function zoneCode(travelZone: unknown): string {
    if (travelZone === 'Amber') return 'A';
    if (travelZone === 'Red') return 'R';
    return '';
}

function pbgOf(data: Record<string, any> | undefined): string {
    if (!data) return '';
    return `${toEHex(data.popDigit)}${toEHex(data.planetoidBelts)}${toEHex(data.gasGiantsCount)}`;
}

/**
 * Mongoose staged path for every SYSTEM_PRESENT row. Coordinates come from the
 * metadata XML. Missing coordinates throw. truthVersion is the data_model.md
 * example tag "v1".
 */
export async function buildSector(input: { slug: string; tsv: string; metadataXml?: string; pinned: Pinned }) {
    const meta = input.metadataXml ? parseMetadataXml(input.metadataXml) : null;
    if (!meta || meta.x === null || meta.y === null || Number.isNaN(meta.x) || Number.isNaN(meta.y)) {
        throw new Error(`buildSector ${input.slug}: metadata XML has no sector coordinates`);
    }
    const rows = parseT5Tab(input.tsv);
    const hexes: Record<string, unknown> = {};
    const objects = new Map<string, string>();
    let systems = 0;
    let built = 0;
    let partial = 0;
    for (const [hhhh, summary] of rows) {
        if (summary.type !== 'SYSTEM_PRESENT') continue;
        const row = summary as Record<string, any>;
        systems += 1;
        const data = row.t5Data as Record<string, any> | undefined;
        const socio = row.t5Socio as Record<string, any> | undefined;
        const projection = {
            type: row.type,
            name: row.name,
            uwp: row.uwp,
            allegiance: row.allegiance,
            zone: zoneCode(row.travelZone),
            bases: row.bases,
            tradeCodes: row.tradeCodes,
            pbg: typeof row.pbg === 'string' ? row.pbg : pbgOf(data),
            ix: socio ? socio.Ix : undefined,
            partial: row.partial ?? null,
        };
        if (row.partial != null) {
            partial += 1;
            hexes[hhhh] = { tree: null, ...projection, summary: projection };
            continue;
        }
        built += 1;
        const hexKey = `${input.slug}/${hhhh}`;
        const envelope = generateHex({
            hexKey, edition: 'MgT2E', mode: 'flesh', summary: row, pinned: input.pinned,
        });
        const json = stable(envelope);
        const hash = await sha256Hex(json);
        objects.set(hash, json);
        hexes[hhhh] = { tree: hash, ...projection, summary: projection };
    }
    const index = {
        slug: input.slug,
        name: meta.name,
        x: meta.x,
        y: meta.y,
        truthVersion: TRUTH_VERSION,
        hexes,
        metadata: { routes: meta.routes, borders: meta.borders, names: meta.names },
    };
    return { index, objects, counts: { systems, built, partial } };
}
