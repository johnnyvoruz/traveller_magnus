/**
 * TravellerMap Second Survey tab parser.
 * State per hex matches js/io_manager.js importT5Tab. Keys are the four-digit hex
 * ("1910"), never the legacy "<sector>-<subsector>-<hhhh>" id.
 * A parser never rolls dice. Companion orbitID stays null; placement is
 * packages/engines/src/core/stars.js placeCompanionOrbits.
 */

export type HexRow = Record<string, unknown>;

const EHEX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function toEHex(val: number): string {
    const v = Math.floor(Number(val));
    if (isNaN(v) || v < 0) return '0';
    if (v < 10) return v.toString();
    return EHEX_CHARS[v - 10] || 'Z';
}

function fromEHex(char: string | undefined | null): number {
    if (char === undefined || char === null || char === '') return 0;
    const c = String(char).trim().toUpperCase();
    if (c === 'R') return 0.1;
    if (c === 'S') return 0.5;
    const ch = c.charAt(0);
    if (ch >= '0' && ch <= '9') return parseInt(ch, 10);
    const idx = EHEX_CHARS.indexOf(ch);
    return idx >= 0 ? idx + 10 : 0;
}

/** A chart digit of '?' is unknown. It is not decoded as 0. */
function uwpNumber(ch: string | undefined): number | null {
    if (ch === '?') return null;
    return fromEHex(ch);
}

const T5_COMPANION_AU = 0.05;

type ParsedStar = {
    role: string;
    name: string;
    rawName: string;
    type: string;
    decimal: number;
    size: string;
    orbitID: number | null;
    distAU: number | undefined;
    parentStarIdx: number | null;
};

function parseT5HomestarString(rawStarsString: string): ParsedStar[] {
    if (!rawStarsString || !rawStarsString.trim()) return [];
    const starStrings: string[] = [];
    const tokens = rawStarsString.trim().split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
        if (i > 0 && /^(Ia|Ib|II|III|IV|V|VI|VII|D|BD)$/i.test(tokens[i]) && !starStrings[starStrings.length - 1].includes(' ')) {
            starStrings[starStrings.length - 1] += ' ' + tokens[i];
        } else {
            starStrings.push(tokens[i]);
        }
    }
    // Token roles only. Companion orbits are not rolled here.
    const ROLE_SLOTS: { role: string; orbitID: number | null; distAU?: number; parentStarIdx: number | null }[] = [
        { role: 'Primary', orbitID: 0, parentStarIdx: null },
        { role: 'Close', orbitID: null, parentStarIdx: null },
        { role: 'Near', orbitID: null, parentStarIdx: null },
        { role: 'Far', orbitID: null, parentStarIdx: null },
        { role: 'Companion', orbitID: null, distAU: T5_COMPANION_AU, parentStarIdx: 0 },
        { role: 'Companion', orbitID: null, distAU: T5_COMPANION_AU, parentStarIdx: 1 },
        { role: 'Companion', orbitID: null, distAU: T5_COMPANION_AU, parentStarIdx: 2 },
        { role: 'Companion', orbitID: null, distAU: T5_COMPANION_AU, parentStarIdx: 3 },
    ];
    return starStrings.slice(0, ROLE_SLOTS.length).map((sStr, idx) => {
        const rawType = sStr.split(' ')[0] || '';
        let sType = rawType.length > 0 ? rawType[0] : 'M';
        const subTypeMatch = rawType.match(/\d/);
        let decimal = subTypeMatch ? parseInt(subTypeMatch[0], 10) : 0;
        let sClass = sStr.split(' ')[1] || 'V';
        if (sType === 'D') { sClass = 'D'; decimal = 0; }
        if (rawType === 'BD') { sType = 'BD'; sClass = 'V'; decimal = 0; }
        const slot = ROLE_SLOTS[idx];
        return {
            role: slot.role,
            name: `${sType}${rawType !== 'D' && rawType !== 'BD' ? decimal : ''} ${sClass}`,
            rawName: sStr,
            type: sType,
            decimal,
            size: sClass,
            orbitID: slot.orbitID,
            distAU: slot.distAU,
            parentStarIdx: slot.parentStarIdx,
        };
    });
}

/** Parse a Second Survey TSV into hex rows keyed by "1910". */
export function parseT5Tab(text: string): Map<string, HexRow> {
    const sink = new Map<string, HexRow>();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return sink;
    const header = lines[0].split('\t');
    const getIndex = (label: string) => header.indexOf(label);
    const idxHex = getIndex('Hex');
    const idxName = getIndex('Name');
    const idxUWP = getIndex('UWP');
    const idxBases = getIndex('Bases');
    const idxRemarks = getIndex('Remarks');
    const idxZone = getIndex('Zone');
    const idxPBG = getIndex('PBG');
    const idxStars = getIndex('Stars');
    const idxAlleg = getIndex('Allegiance');
    const idxIx = getIndex('{Ix}');
    const idxEx = getIndex('(Ex)');
    const idxCx = getIndex('[Cx]');
    const idxW = getIndex('W.') !== -1 ? getIndex('W.') : getIndex('W');
    const idxNotes = getIndex('Notes');
    const idxNobility = getIndex('Nobility');
    const idxRU = getIndex('RU');
    if (idxHex === -1 || idxUWP === -1) {
        throw new Error("Invalid file format. 'Hex' and 'UWP' columns (tab-separated) are required.");
    }
    const imported = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split('\t');
        if (row.length < header.length) continue;
        let hexNum = row[idxHex]?.trim();
        if (hexNum?.length === 3) hexNum = '0' + hexNum;
        const uwp = row[idxUWP]?.trim();
        if (!hexNum || !uwp || hexNum.length !== 4 || uwp.length < 7) continue;
        const name = idxName !== -1 ? row[idxName].trim() : 'Unnamed';
        const starport = uwp[0] || 'C';
        const tlChar = uwp.split('-')[1]?.[0];
        const size = uwpNumber(uwp[1]);
        const atm = uwpNumber(uwp[2]);
        const hydro = uwpNumber(uwp[3]);
        const pop = uwpNumber(uwp[4]);
        const gov = uwpNumber(uwp[5]);
        const law = uwpNumber(uwp[6]);
        const tl = uwpNumber(tlChar || '7');
        const uwpDigits = [uwp[0], uwp[1], uwp[2], uwp[3], uwp[4], uwp[5], uwp[6], tlChar ?? ''];
        const unknownDigits = uwpDigits.filter(ch => ch === '?').length;
        const partial = unknownDigits === 0 ? null : (unknownDigits === uwpDigits.length ? 'full' : 'partial');
        const pbgStr = idxPBG !== -1 ? row[idxPBG].trim() : '000';
        const popMultiplier = uwpNumber(pbgStr[0]);
        const belts = uwpNumber(pbgStr[1]);
        const gG = pbgStr[2] !== undefined && pbgStr[2] !== null ? uwpNumber(pbgStr[2]) : 0;
        const ixRaw = idxIx !== -1 ? row[idxIx].replace(/[{}]/g, '') : '0';
        const exRaw = idxEx !== -1 ? row[idxEx].replace(/[()]/g, '') : '000+0';
        const cxRaw = idxCx !== -1 ? row[idxCx].replace(/[\[\]]/g, '') : '0000';
        const Ix = parseInt(ixRaw, 10) || 0;
        const R = fromEHex(exRaw[0]);
        const L = fromEHex(exRaw[1]);
        const I_val = fromEHex(exRaw[2]);
        const E_val = parseInt(exRaw.substring(3), 10) || 0;
        const H = fromEHex(cxRaw[0]);
        const A = fromEHex(cxRaw[1]);
        const S = fromEHex(cxRaw[2]);
        const Sym = fromEHex(cxRaw[3]);
        const ruText = idxRU !== -1 ? (row[idxRU] || '').trim() : '';
        const RU = /^-?\d+$/.test(ruText) ? parseInt(ruText, 10) : Math.abs((R === 0 ? 1 : R) * (L === 0 ? 1 : L) * (I_val === 0 ? 1 : I_val) * (E_val === 0 ? 1 : E_val));
        const nobleCodes = idxNobility !== -1 ? (row[idxNobility] || '').trim() : '';
        const baseCodes = idxBases !== -1 ? (row[idxBases] || '').trim() : '';
        const zoneRaw = (idxZone !== -1 ? row[idxZone] : '').trim().toUpperCase();
        const travelZone = zoneRaw === 'A' ? 'Amber' : (zoneRaw === 'R' ? 'Red' : 'Green');
        const t5Data: Record<string, unknown> = {
            name, uwp, starport, size, atm, hydro, pop, gov, law, tl,
            tradeCodes: idxRemarks !== -1 ? row[idxRemarks].split(/\s+/) : [],
            travelZone,
            popDigit: popMultiplier,
            planetoidBelts: belts,
            gasGiantsCount: gG,
            gasGiant: gG === null ? null : gG > 0,
            baseCodes,
            navalBase: baseCodes.includes('N'),
            scoutBase: baseCodes.includes('S'),
            nobleCodes,
            worldCount: idxW !== -1 ? parseInt(row[idxW], 10) : undefined,
        };
        if (t5Data.worldCount === undefined) delete t5Data.worldCount;
        const t5Socio: Record<string, unknown> = {
            Ix, R, L, I: I_val, E: E_val, RU, H, A, S, Sym,
            importance: Ix,
            resourceUnits: RU,
            ecoResources: R,
            ecoLabor: L,
            ecoInfrastructure: I_val,
            ecoEfficiency: E_val,
            popMultiplier,
            belts,
            gasGiants: gG,
            worlds: idxW !== -1 ? parseInt(row[idxW], 10) : 1,
            ixString: idxIx !== -1 ? row[idxIx] : `{${Ix >= 0 ? '+' : ''}${Ix}}`,
            exString: idxEx !== -1 ? row[idxEx] : `(${toEHex(R)}${toEHex(L)}${toEHex(I_val)}${E_val >= 0 ? '+' : ''}${E_val})`,
            cxString: idxCx !== -1 ? row[idxCx] : `[${toEHex(H)}${toEHex(A)}${toEHex(S)}${toEHex(Sym)}]`,
            nobleCodes,
        };
        t5Socio.displayString = `${t5Socio.ixString} ${t5Socio.exString} ${t5Socio.cxString} RU:${RU}${nobleCodes ? ' ' + nobleCodes : ''}`;
        const t5System: Record<string, unknown> = { totalWorlds: idxW !== -1 ? parseInt(row[idxW], 10) : 1 };
        if (idxStars !== -1 && row[idxStars] !== '-') {
            const rawStars = row[idxStars].trim();
            t5Data.homestar = rawStars;
            const parsedStars = parseT5HomestarString(rawStars);
            t5System.stars = parsedStars.map(s => {
                const star = { ...s, name: s.rawName || s.name, orbits: [] };
                if (star.distAU === undefined) delete star.distAU;
                return star;
            });
            t5System.orbits = [];
        } else {
            t5Data.homestar = '';
            t5System.stars = [];
            t5System.orbits = [];
        }
        t5System.mainworld = {
            ...t5Data,
            tradeCodes: [...(t5Data.tradeCodes as unknown[])],
            type: 'Mainworld',
            isMainworld: true,
            parentStarIdx: 0,
        };
        const state: HexRow = {
            type: 'SYSTEM_PRESENT',
            name,
            allegiance: idxAlleg !== -1 ? row[idxAlleg].trim() : 'Im',
            notes: idxNotes !== -1 ? row[idxNotes].trim() : '',
            beltCount: belts,
            gasGiantCount: gG,
            t5Data,
            t5Socio,
            t5System,
            uwp,
            tradeCodes: t5Data.tradeCodes,
            travelZone,
            bases: baseCodes,
        };
        if (pbgStr.includes('?')) state.pbg = pbgStr;
        if (partial) state.partial = partial;
        sink.set(hexNum, state);
        imported.add(hexNum);
    }
    for (let q = 1; q <= 32; q++) {
        for (let r = 1; r <= 40; r++) {
            const hexNum = q.toString().padStart(2, '0') + r.toString().padStart(2, '0');
            if (imported.has(hexNum)) continue;
            sink.set(hexNum, { type: 'EMPTY' });
        }
    }
    return sink;
}
