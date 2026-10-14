/**
 * The hybrid surface map's generator (design §5–§7, with the tuning recorded in the design
 * doc's "As built" section). Pure and deterministic: the same HybridWorld gives the same hexes.
 *
 *   S1 height    the vanilla continent field (vanilla/map_fields.ts), seeded by the world's
 *                name-independent key
 *   S2 sampling  seven height samples per hex; water when at least half are under sea level
 *   S3 hydro     boundary hexes flipped until the sea's share of the area is the world's
 *   S4 climate   one temperature field from the engine's mean, low and high
 *   S5 ice       on sea and on land, from that field and the liquid's melting point
 *   S6 terrain   moisture, then the terrain table; accents (mountains, volcanoes, craters)
 *   S7 people    after ice and climate: starport, bases, cities, towns, farmland, resources
 *
 * Random streams, each its own: 'ph' and 'cn' (height, shared with vanilla), 'ic' (ice-edge
 * noise), 'tr' (moisture texture), 'ft' (accents), 'pp' (people). The day and night overlay
 * draws from none of them.
 */
import { hashString, mulberry32 } from '../vanilla/map.ts';
import { edgeTemp } from '../ice_edge.ts';
import { buildCDF, buildContinentSeeds, buildGrid3D, continentHeight, fbm3D, remapHeight } from '../vanilla/map_fields.ts';
import { VANILLA_MASTER_SEED } from '../identity.ts';
import type { AccentCode, FeatureCode, TerrainCode } from './codes.ts';
import { dot, gridOf, hexSpacing, norm, sphere, type Grid, type V3 } from './grid.ts';
import type { HybridWorld } from './inputs.ts';
import { latitudeTiltFactor } from '../tilt_latitude.ts';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Land bakes above this, whatever the liquid (design said max(Tb, 340); tuned, see the doc). */
export const BAKED_K = 340;
/** Lapse rate at full land height for a 288 K world, scaled by mean / 288. */
export const LAPSE_K = 28;
/** Angular wobble of a locked world's ice edge, in degrees. */
export const LOCKED_EDGE_WOBBLE_DEG = 7;
/** Default substellar longitude of a locked world: the sheet is centred on the night side. */
export const LOCKED_NIGHT_CENTRED_LON = -162;

export type IceKind = 'none' | 'seaIce' | 'iceField' | 'iceCap' | 'frost';
export type Layout = 'normal' | 'locked' | 'frozen' | 'scorched' | 'molten';

export type HexRecord = {
    id: number;
    row: number;
    col: number;
    lat: number;
    lon: number;
    area: number;
    /** Mean of the seven height samples, 0..1 rank. */
    height: number;
    heightMax: number;
    waterFrac: number;
    water: boolean;
    /** Land height above sea level, 0..1. */
    elevation: number;
    /** Sea depth below sea level, 0..1. */
    depth: number;
    tempK: number;
    moisture: number;
    ice: IceKind;
    seasonal: boolean;
    twilight: boolean;
    /** Angle from the substellar point, degrees (locked worlds), else 0. */
    theta: number;
    terrain: TerrainCode;
    /** What the hex would be as land (paints the shore blend under seas). */
    landTerrain: TerrainCode;
    accents: AccentCode[];
    features: FeatureCode[];
    /** Starport class when the hex holds the starport. */
    port: string | null;
    domed: boolean;
    habitability: number;
    coastal: boolean;
    /** Hop distance to the nearest water hex (99 when none). */
    waterHops: number;
};

export type HybridModel = {
    readonly world: HybridWorld;
    readonly grid: Grid;
    readonly seaRank: number;
    /** Melting and boiling points used: the liquid's, else water's for land rules. */
    readonly meltK: number;
    readonly boilK: number;
    /** False when the liquid is unknown: its sea never freezes or boils. */
    readonly phaseKnown: boolean;
    readonly layout: Layout;
    readonly life: boolean;
    readonly airless: boolean;
    /** Substellar point of a locked world, else null. */
    readonly sub: V3 | null;
    /** Half-width of a locked world's twilight ring, degrees. */
    readonly ringDeg: number;
    readonly hexes: readonly HexRecord[];
    readonly height: (p: V3) => number;
    readonly iceNoise: (p: V3) => number;
    readonly texture: (p: V3) => number;
    readonly tempAt: (p: V3, elevation: number) => number;
    readonly seasonalBand: (latDeg: number) => number;
    /** Sea share of the area after the hydro correction. */
    readonly seaShare: number;
    /** Longitude of the starport hex, degrees, or null. */
    readonly starportLon: number | null;
    readonly starportHex: number | null;
};

function stream(seed: string, tag: string): () => number {
    return mulberry32(hashString(VANILLA_MASTER_SEED + '-' + seed + '-' + tag));
}

const heights = new Map<string, (p: V3) => number>();

/** The continent field for a seed, as rank 0..1 (an equal-area share of the sphere is below h). */
export function heightField(seed: string, continental: number, coastline: number): (p: V3) => number {
    const key = seed + '|' + continental + '|' + coastline;
    let field = heights.get(key);
    if (!field) {
        const grid = buildGrid3D(stream(seed, 'ph'));
        const seeds = buildContinentSeeds(stream(seed, 'cn'));
        const cdf = buildCDF(grid, seeds, 2048, continental, coastline);
        field = (p: V3) => remapHeight(continentHeight(grid, seeds, p[0], p[1], p[2], continental, coastline), cdf);
        if (heights.size > 16) heights.clear();
        heights.set(key, field);
    }
    return field;
}

/**
 * The model's cached parts as separate steps (grid, continent field), so a page that paints
 * without a worker can build them in turns before buildHybridModel, each well under a frame.
 */
export function modelPreparation(world: HybridWorld): (() => void)[] {
    return [
        () => { gridOf(world.size); },
        () => { heightField(world.seed, world.continental, world.coastline); },
    ];
}

const has = (world: HybridWorld, code: string): boolean => world.trade.includes(code);

export type BuildOptions = {
    /** Substellar longitude of a locked world, degrees. Default: night-centred. */
    readonly lockedSubLonDeg?: number;
};

/** Hexes sampled, hydro flips, or climates classified in one page-path step. */
const MODEL_BATCH = 32;

export type HybridBuild = {
    /** One slice. True when the model is complete. */
    step(): boolean;
    /** The finished model. Drains any slices still waiting. */
    model(): HybridModel;
};

/**
 * The same build as buildHybridModel, in slices a page can run one per turn. Sampling, the
 * hydro correction and the climate pass are the long parts; each slice does MODEL_BATCH of
 * them. The hex data at the end matches a single buildHybridModel call.
 */
export function startHybridBuild(world: HybridWorld, options: BuildOptions = {}): HybridBuild {
    let phase = 0;
    let id = 0;
    let grid!: Grid;
    let seed!: string;
    let height!: (p: V3) => number;
    let iceNoise!: (p: V3) => number;
    let texture!: (p: V3) => number;
    let liquid!: string | null;
    let phaseKnown!: boolean;
    let meltK!: number;
    let boilK!: number;
    let airless!: boolean;
    let life!: boolean;
    let seaRank!: number;
    let sub!: V3 | null;
    let ringDeg!: number;
    let tempAt!: (p: V3, e: number) => number;
    let seasonalBand!: (latDeg: number) => number;
    let layout!: Layout;
    let rr!: number;
    let hexes!: HexRecord[];
    let seaShare = 0;
    let model!: HybridModel;
    let hydroOrder: HexRecord[] | null = null;
    let hydroTarget = 0;
    let hydroTol = 0;
    let hydroCurrent = 0;
    let hydroGuard = 0;

    const sampleHex = (hexId: number): void => {
        const p = grid.P[hexId];
        let t1: V3 = [p[2], 0, -p[0]];
        if (Math.hypot(t1[0], t1[1], t1[2]) < 1e-6) t1 = [1, 0, 0];
        t1 = norm(t1);
        const t2: V3 = [p[1] * t1[2] - p[2] * t1[1], p[2] * t1[0] - p[0] * t1[2], p[0] * t1[1] - p[1] * t1[0]];
        const hs = [height(p)];
        for (let a = 0; a < 6; a += 1) {
            const c = Math.cos(a * Math.PI / 3) * rr;
            const s = Math.sin(a * Math.PI / 3) * rr;
            hs.push(height(norm([p[0] + c * t1[0] + s * t2[0], p[1] + c * t1[1] + s * t2[1], p[2] + c * t1[2] + s * t2[2]])));
        }
        let sum = 0;
        let wet = 0;
        let top = -Infinity;
        for (const v of hs) {
            sum += v;
            if (v < seaRank) wet += 1;
            if (v > top) top = v;
        }
        const waterFrac = wet / 7;
        hexes.push({
            id: hexId, row: grid.row[hexId], col: grid.col[hexId], lat: grid.lat[hexId], lon: grid.lon[hexId], area: grid.area[hexId],
            height: sum / 7, heightMax: top, waterFrac, water: waterFrac >= 0.5,
            elevation: 0, depth: 0, tempK: 0, moisture: 0, ice: 'none', seasonal: false, twilight: false, theta: 0,
            terrain: 'RK', landTerrain: 'RK', accents: [], features: [], port: null, domed: false, habitability: 0, coastal: false, waterHops: 99,
        });
    };

    const climateHex = (x: HexRecord): void => {
        const p = grid.P[x.id];
        x.elevation = x.water ? 0 : clamp((x.height - seaRank) / (1 - seaRank || 1), 0, 1);
        x.depth = x.water ? clamp((seaRank - x.height) / Math.max(seaRank, 1e-6), 0, 1) : 0;
        x.tempK = tempAt(p, x.elevation);
        x.coastal = !x.water && grid.nb[x.id].some((k) => hexes[k].water);
        if (sub) {
            x.theta = Math.acos(clamp(dot(p, sub), -1, 1)) * R2D;
            x.twilight = Math.abs(x.theta - 90) <= ringDeg;
        }
        x.moisture = moistureAt(model, p, x.lat, x.elevation, x.waterHops);
        const hasCoast = seaShare > 0.02 && seaShare < 0.98;
        const noise = model.iceNoise(p);
        const iceT = edgeTemp(x.tempK, model.meltK, noise, x.water, x.elevation, hasCoast, model.layout);
        const c = classify(model, x.water, x.tempK, x.elevation, x.moisture, x.lat, x.depth, iceT);
        x.ice = c.ice;
        x.seasonal = c.seasonal;
        x.terrain = c.terrain;
        const landT = x.water ? edgeTemp(x.tempK, model.meltK, noise, false, 0, hasCoast, model.layout) : iceT;
        x.landTerrain = x.water ? classify(model, false, x.tempK, 0, x.moisture, x.lat, 0, landT).terrain : x.terrain;
    };

    const step = (): boolean => {
        if (phase === 7) return true;
        if (phase === 0) {
            grid = gridOf(world.size);
            seed = world.seed;
            height = heightField(seed, world.continental, world.coastline);
            const gic = buildGrid3D(stream(seed, 'ic'));
            const gtr = buildGrid3D(stream(seed, 'tr'));
            iceNoise = (p: V3): number => clamp((fbm3D(gic, p[0] * 1.3 + 3.1, p[1] * 1.3, p[2] * 1.3, 4, 0.55) - 0.5) * 4.5, -1, 1);
            texture = (p: V3): number => clamp((fbm3D(gtr, p[0] * 0.9, p[1] * 0.9 + 5.3, p[2] * 0.9, 3, 0.5) - 0.5) * 4, -1, 1);
            liquid = world.liquid;
            phaseKnown = world.meltK !== null && world.boilK !== null;
            meltK = world.meltK ?? 273;
            boilK = world.boilK ?? 373;
            airless = world.atm <= 1;
            life = !has(world, 'Va') && world.atm >= 4 && world.atm <= 9 && world.hydro >= 2 && world.meanK >= 248 && world.meanK <= 323;
            const molten = world.hydro >= 15 || (!liquid && world.meanK > 1000);
            seaRank = liquid ? world.hydroPercent / 100 : 0;
            const mean = world.meanK;
            const A = Math.max(0, Math.min(1.5 * (mean - world.lowK), 3 * (world.highK - mean)));
            // Same factor the disc bake uses. +1 at a folded tilt of 45 or less, 0 at 54, -1 at 63 or more.
            const Aeff = A * latitudeTiltFactor(world.tilt);
            let tp = Math.abs(Math.sin(world.tilt * D2R));
            if (world.yearHours < 36.5 * 24) tp /= 2;
            if (world.yearHours > 2 * 8760) tp *= 1.5;
            const S = (world.highK - world.lowK) / 2;
            const width = 0.2 + 0.3 * Math.min(1, world.pressure / 3);
            ringDeg = 5 + 20 * Math.min(1, world.pressure / 3);
            sub = world.locked ? sphere(0, (options.lockedSubLonDeg ?? LOCKED_NIGHT_CENTRED_LON) * D2R) : null;
            const g = (c: number): number => Math.tanh(c / width) / Math.tanh(1 / width);
            const gamma = LAPSE_K * Math.min(1, mean / 288);
            tempAt = (p: V3, e: number): number => {
                const base = sub
                    ? mean + S * g(Math.cos(Math.acos(clamp(dot(p, sub), -1, 1)) + LOCKED_EDGE_WOBBLE_DEG * D2R * iceNoise([p[0] * 1.7, p[1] * 1.7, p[2] * 1.7])))
                    : mean + Aeff * (1 / 3 - p[1] * p[1]);
                return base - gamma * Math.max(0, e) + 3 * iceNoise(p);
            };
            seasonalBand = (latDeg: number): number => (sub ? 0 : 0.5 * tp * Math.abs(Math.sin(latDeg * D2R)) * (world.highK - world.lowK) / 2);
            layout = molten ? 'molten'
                : world.locked ? 'locked'
                    : liquid && phaseKnown && world.highK < meltK ? 'frozen'
                        : world.lowK > BAKED_K ? 'scorched' : 'normal';
            rr = Math.tan(0.45 * hexSpacing(grid.n));
            hexes = [];
            id = 0;
            phase = 1;
            return false;
        }
        if (phase === 1) {
            const end = Math.min(grid.count, id + MODEL_BATCH);
            for (; id < end; id += 1) sampleHex(id);
            if (id >= grid.count) phase = 2;
            return false;
        }
        if (phase === 2) {
            if (!liquid) {
                for (const x of hexes) x.water = false;
                phase = 3;
                return false;
            }
            if (!hydroOrder) {
                hydroTarget = world.hydroPercent / 100;
                hydroTol = Math.max(0.015, grid.area[0]);
                hydroCurrent = 0;
                for (const x of hexes) if (x.water) hydroCurrent += x.area;
                hydroOrder = [...hexes].sort((a, b) => Math.abs(a.waterFrac - 0.5) - Math.abs(b.waterFrac - 0.5) || a.id - b.id);
                hydroGuard = 0;
            }
            const order = hydroOrder;
            let n = 0;
            let finished = false;
            while (n < MODEL_BATCH) {
                if (!(hydroGuard < grid.count && Math.abs(hydroCurrent - hydroTarget) > hydroTol)) { finished = true; break; }
                const want = hydroCurrent < hydroTarget;
                const pick = order.find((x) => x.water !== want);
                if (!pick) { finished = true; break; }
                pick.water = want;
                hydroCurrent += want ? pick.area : -pick.area;
                order.splice(order.indexOf(pick), 1);
                hydroGuard += 1;
                n += 1;
            }
            if (finished) phase = 3;
            return false;
        }
        if (phase === 3) {
            seaShare = 0;
            for (const x of hexes) if (x.water) seaShare += x.area;
            const queue: number[] = [];
            for (const x of hexes) if (x.water) { x.waterHops = 0; queue.push(x.id); }
            for (let head = 0; head < queue.length; head += 1) {
                const c = queue[head];
                for (const k of grid.nb[c]) {
                    if (hexes[k].waterHops > hexes[c].waterHops + 1) {
                        hexes[k].waterHops = hexes[c].waterHops + 1;
                        queue.push(k);
                    }
                }
            }
            model = {
                world, grid, seaRank, meltK, boilK, phaseKnown, layout, life, airless, sub, ringDeg, hexes,
                height, iceNoise, texture, tempAt, seasonalBand, seaShare, starportLon: null, starportHex: null,
            };
            id = 0;
            phase = 4;
            return false;
        }
        if (phase === 4) {
            const end = Math.min(hexes.length, id + MODEL_BATCH);
            for (; id < end; id += 1) climateHex(hexes[id]);
            if (id >= hexes.length) phase = 5;
            return false;
        }
        if (phase === 5) {
            const rft = stream(seed, 'ft');
            const land = hexes.filter((x) => !x.water);
            for (const x of land) if (x.elevation >= 0.7) x.accents.push('MT');
            const volcanoes = Math.min(Math.round(world.seismic / 3), Math.ceil(0.05 * land.length));
            const peaks = land.filter((x) => x.accents.includes('MT') && x.ice === 'none');
            for (let i = 0; i < volcanoes && peaks.length; i += 1) {
                const k = Math.floor(rft() * peaks.length);
                peaks[k].accents.push('VO');
                peaks.splice(k, 1);
            }
            if (world.atm <= 1 || has(world, 'Va')) {
                const craters = world.size + 1 + Math.floor(rft() * 6);
                const pool = [...land];
                for (let i = 0; i < craters && pool.length; i += 1) {
                    const k = Math.floor(rft() * pool.length);
                    pool[k].accents.push('CR');
                    pool.splice(k, 1);
                }
            }
            phase = 6;
            return false;
        }
        placePeople(model);
        phase = 7;
        return true;
    };

    return {
        step,
        model: () => {
            while (phase < 7) step();
            return model;
        },
    };
}

export function buildHybridModel(world: HybridWorld, options: BuildOptions = {}): HybridModel {
    return startHybridBuild(world, options).model();
}

type ClimateModel = Pick<HybridModel, 'world' | 'sub' | 'texture'>;

/** Moisture 0..1 from water nearby, circulation, texture and height (design 6.6). */
export function moistureAt(model: ClimateModel, p: V3, latDeg: number, elevation: number, waterHops: number): number {
    const world = model.world;
    const circ = model.sub ? 0.12 * dot(p, model.sub) : 0.17 * Math.cos(6 * latDeg * D2R);
    let m: number;
    if (!world.liquid) {
        m = 0.1 + 0.18 * model.texture(p) + circ * 0.5;
    } else {
        m = 0.12 + 0.35 * (world.hydro / 10) + 0.35 * Math.exp(-waterHops / 1.6) + circ + 0.2 * model.texture(p) - 0.15 * elevation;
        if (has(world, 'Po')) m -= 0.1;
        if ((has(world, 'Ga') || has(world, 'Ag')) && waterHops <= 1) m += 0.05;
    }
    return clamp(m, 0, 1);
}

type ClassModel = Pick<HybridModel, 'world' | 'layout' | 'meltK' | 'boilK' | 'phaseKnown' | 'airless' | 'life' | 'sub' | 'seasonalBand'>;

/** The terrain table (design §5.4). First match wins. */
export function classify(model: ClassModel, water: boolean, T: number, e: number, m: number, latDeg: number, depth: number, iceT: number = T): { ice: IceKind; seasonal: boolean; terrain: TerrainCode } {
    const world = model.world;
    const Tm = model.meltK;
    if (model.layout === 'molten') return { ice: 'none', seasonal: false, terrain: 'LV' };
    if (water) {
        if (model.phaseKnown) {
            const icy = has(world, 'Ic');
            if (iceT < Tm) return { ice: icy ? 'iceField' : 'seaIce', seasonal: false, terrain: icy ? 'IF' : 'SI' };
            // A stored liquid draws ice only below its melting point. An assumed liquid
            // (no liquidType on the body) keeps the seasonal band, so those sheets do not move.
            if (world.liquidAssumed && iceT < Tm + model.seasonalBand(latDeg)) return { ice: 'seaIce', seasonal: true, terrain: 'SI' };
            if (T > model.boilK) return { ice: 'none', seasonal: false, terrain: 'EV' };
        }
        return { ice: 'none', seasonal: false, terrain: depth > 0.35 ? 'OC' : 'SH' };
    }
    if (model.phaseKnown && iceT < Tm - 5 && world.hydro > 0) {
        if (model.airless) {
            // Frost wherever it is cold enough. A latitude cut drew a ruler across the sheet.
            return { ice: 'frost', seasonal: false, terrain: 'FR' };
        } else {
            let kind: IceKind = world.hydro >= 4 || m > 0.5 ? 'iceCap' : 'frost';
            // Cold trap: a locked world's night side gathers ice when it is far below melting.
            if (model.sub && kind === 'frost' && world.meanK - (world.highK - world.lowK) / 2 < Tm - 40) kind = 'iceCap';
            return { ice: kind, seasonal: false, terrain: kind === 'iceCap' ? 'IC' : 'FR' };
        }
    }
    if (T > BAKED_K) return { ice: 'none', seasonal: false, terrain: 'BK' };
    if (model.airless) return { ice: 'none', seasonal: false, terrain: 'RG' };
    const dry = has(world, 'De') ? 0.35 : 0.22;
    if (model.life) {
        if (T >= Tm - 5 && T < Tm + 5) return { ice: 'none', seasonal: false, terrain: 'TU' };
        if (m < dry && T >= Tm + 5) return { ice: 'none', seasonal: false, terrain: 'DE' };
        if (m > 0.8 && e < 0.08 && T > Tm + 2) return { ice: 'none', seasonal: false, terrain: 'SW' };
        if (T > 295 && m > 0.65) return { ice: 'none', seasonal: false, terrain: 'JU' };
        if (T > 278 && T <= 295 && m > 0.5) return { ice: 'none', seasonal: false, terrain: 'FO' };
        if (T >= Tm + 5 && T <= 278 && m > 0.4) return { ice: 'none', seasonal: false, terrain: 'TA' };
        return { ice: 'none', seasonal: false, terrain: 'GR' };
    }
    if (m < dry && T >= 278) return { ice: 'none', seasonal: false, terrain: 'DE' };
    if (world.atm >= 10 && world.atm <= 12) return { ice: 'none', seasonal: false, terrain: 'XR' };
    return { ice: 'none', seasonal: false, terrain: 'RK' };
}

const UNLIVABLE: ReadonlySet<TerrainCode> = new Set(['IC', 'SI', 'IF', 'BK', 'EV', 'LV']);

/** True for a hex no city may stand on. Frost counts: a city never sits on ice. */
export function unlivable(x: HexRecord): boolean {
    return x.water || x.ice !== 'none' || UNLIVABLE.has(x.terrain);
}

/** S7, design §7. Runs after ice and climate, so nothing is placed on ice. */
function placePeople(model: HybridModel & { starportLon: number | null; starportHex: number | null }): void {
    const world = model.world;
    const grid = model.grid;
    const H = model.hexes as HexRecord[];
    const rpp = stream(world.seed, 'pp');
    const unbreathable = world.atm <= 3 || world.atm >= 10;
    for (const x of H) {
        if (x.water) continue;
        const dT = Math.abs(x.tempK - 293);
        let h = clamp(1 - dT / 40, 0, 1) * (x.moisture >= 0.2 ? 1 : 0.5) + 0.2 * (x.coastal ? 1 : 0) + 0.3 * (x.twilight ? 1 : 0)
            + 0.05 * (1 - Math.min(1, dT / 400)) - 0.02 * x.elevation;
        if (x.ice === 'frost') h *= 0.5;
        if (unlivable(x)) h = -1;
        x.habitability = h;
    }
    const livable = H.filter((x) => !x.water && x.habitability >= 0);
    const byH = [...livable].sort((a, b) => b.habitability - a.habitability || a.id - b.id);
    // A world with no ice-free land still has its port and small settlements: domed, on its
    // land ice. Cities, arcologies, farms and rural land never go on ice.
    const onIce = byH.length === 0;
    const small = onIce
        ? H.filter((x) => !x.water && x.terrain !== 'LV' && x.terrain !== 'BK' && x.terrain !== 'EV')
            .sort((a, b) => Math.abs(a.tempK - 293) - Math.abs(b.tempK - 293) || a.id - b.id)
        : byH;
    const taken = new Set<number>();
    const free = (x: HexRecord): boolean => !taken.has(x.id) && !grid.nb[x.id].some((k) => taken.has(k));
    const put = (x: HexRecord, f: FeatureCode): void => {
        x.features.push(f);
        taken.add(x.id);
        if ((unbreathable || onIce) && f !== 'farm' && f !== 'rural' && f !== 'resource') x.domed = true;
    };
    let port: HexRecord | null = null;
    if (world.port !== 'X' && small.length) {
        let pool = model.sub ? small.filter((x) => x.twilight) : small.filter((x) => x.coastal);
        if (!pool.length) pool = small;
        port = pool[0];
        put(port, 'starport');
        port.port = world.port;
        model.starportLon = port.lon;
        model.starportHex = port.id;
    }
    // Bases stand next to the starport (or on the nearest livable hex to it).
    if (port) {
        const origin = grid.P[port.id];
        const near = [...small].filter((x) => !x.features.length)
            .sort((a, b) => dot(grid.P[b.id], origin) - dot(grid.P[a.id], origin) || a.id - b.id);
        for (const base of world.bases) {
            const spot = near.find((x) => !x.features.length);
            if (!spot) break;
            spot.features.push(base);
            taken.add(spot.id);
            if (unbreathable || onIce) spot.domed = true;
        }
    }
    const P = world.pop;
    const cities: HexRecord[] = [];
    if (P >= 8) {
        const faceBest = new Map<number, HexRecord>();
        for (const x of byH) if (!faceBest.has(grid.face[x.id])) faceBest.set(grid.face[x.id], x);
        let faces = [...faceBest.values()].sort((a, b) => b.habitability - a.habitability || a.id - b.id);
        if (P === 8) faces = faces.slice(0, Math.ceil(faces.length / 2));
        for (const f of faces) {
            const spot = byH.find((x) => grid.face[x.id] === grid.face[f.id] && free(x));
            if (spot) {
                put(spot, 'city');
                cities.push(spot);
            }
        }
    }
    if (P >= 10) {
        for (let i = 0; i < Math.floor(cities.length / 2); i += 1) {
            const c = cities[i];
            const spot = grid.nb[c.id].map((k) => H[k]).filter((x) => !x.water && x.habitability >= 0 && !x.features.length)
                .sort((a, b) => b.habitability - a.habitability || a.id - b.id)[0];
            if (spot) put(spot, 'arcology');
        }
    }
    const towns: HexRecord[] = [];
    const townCount = P >= 4 && P <= 7 ? P - 3 : P >= 1 && P <= 3 ? 1 : 0;
    for (let i = 0; i < townCount; i += 1) {
        const spot = small.find(free);
        if (!spot) break;
        put(spot, P <= 3 ? 'outpost' : 'town');
        towns.push(spot);
    }
    // T5 data only: noble estates and a penal colony, on good free land.
    for (let i = 0; i < world.estates; i += 1) {
        const spot = byH.find(free);
        if (!spot) break;
        put(spot, 'estate');
    }
    if (world.penal) {
        const spot = [...byH].reverse().find(free);
        if (spot) put(spot, 'penal');
    }
    if (P >= 6) {
        const cap = Math.floor(0.15 * livable.length);
        let k = 0;
        for (const c of [...cities, ...towns]) {
            for (const id of grid.nb[c.id]) {
                const x = H[id];
                if (k < cap && !x.water && x.habitability >= 0.3 && !x.features.length) {
                    x.features.push('rural');
                    k += 1;
                }
            }
        }
    }
    if (model.life && !has(world, 'Na')) {
        const share = has(world, 'Ag') ? 0.15 : (has(world, 'Ga') || has(world, 'Ri') || P >= 6) ? 0.06 : 0;
        const pool = byH.filter((x) => x.tempK >= model.meltK + 5 && x.tempK <= model.meltK + 35 && x.moisture >= 0.3
            && !['DE', 'BK', 'EV', 'IC', 'FR'].includes(x.terrain) && !x.features.some((f) => f !== 'rural'));
        const count = Math.round(share * livable.length);
        const settled = H.filter((x) => x.features.some((f) => f === 'city' || f === 'town' || f === 'starport' || f === 'outpost'));
        const reach = (x: HexRecord): number => {
            let best = 9;
            for (const s of settled) best = Math.min(best, Math.acos(clamp(dot(grid.P[x.id], grid.P[s.id]), -1, 1)));
            return best;
        };
        const ranked = pool.map((x) => ({ x, d: reach(x) })).sort((a, b) => a.d - b.d || a.x.id - b.x.id);
        for (const { x } of ranked.slice(0, count)) x.features.push('farm');
    }
    const resources = Math.max(0, Math.floor((world.resource - 4) / 2));
    const pool = H.filter((x) => !x.water && (x.accents.includes('MT') || x.accents.includes('VO') || x.accents.includes('CR')) && !x.features.length && !unlivable(x));
    for (let i = 0; i < resources && pool.length; i += 1) {
        const k = Math.floor(rpp() * pool.length);
        pool[k].features.push('resource');
        pool.splice(k, 1);
    }
}
