/**
 * Page side of the software disc worker (soft/disc.worker.ts), used instead of the WebGL disc
 * worker when the browser has no WebGL (service.ts prepareDiscs). It posts one watch a frame
 * and returns; tiles arrive later and enhanced/delivery.ts settles them into disc_hold, so
 * drawDisc paints them as it paints WebGL tiles.
 *
 * Each disc's globe comes from the sheet the dossier makes for that body in that mode: the
 * vanilla diamond sheet's inputs, or the hybrid map's world (enhanced). A gas giant has no
 * sheet; its globe is the profile's bands. A body with neither gets no tile and stays flat.
 * The recipe is worked out once per body, mode and key.
 */
import type { DiscBatchRequest, DiscRequest, SurfaceMode } from '../contracts.ts';
import type { DiscEnvelope } from '../enhanced/delivery.ts';
import { settleDiscDelivery } from '../enhanced/delivery.ts';
import { hybridWorld, worldDigest } from '../hybrid/inputs.ts';
import { LOCKED_NIGHT_CENTRED_LON } from '../hybrid/model.ts';
import { CONTINENTAL_DEFINITION, COASTLINE_COMPLEXITY, VANILLA_MASTER_SEED, diamondMapSpec } from '../identity.ts';
import type { WorkerState, WorkerTiles } from '../vanilla/gl_messages.ts';
import type { ShadeRequest } from '../vanilla/gl_shade.ts';
import type { GlobeRecipe } from './globe.ts';
import { SOFT_DISC_VERSION, SOFT_MAX_RADIUS, type SoftDisc, type SoftWatch } from './messages.ts';
import { startSoftDiscWorker } from './start.ts';

type WorkerLike = {
    postMessage(message: SoftWatch): void;
    addEventListener(type: 'message', listener: (event: { data: WorkerState | WorkerTiles }) => void): void;
    terminate(): void;
};

type Recipe = { key: string; recipe: GlobeRecipe; lonOffset: number };
type Profile = ShadeRequest['profile'] & Record<string, any>;

let spawnOverride: (() => WorkerLike) | null = null;
let worker: WorkerLike | null = null;
let failed = false;
let ready = false;
let live: DiscEnvelope | null = null;
let keys = new Set<string>();
const recipes = new WeakMap<object, Map<string, Recipe | null>>();

/** The envelope version tiles from this path carry. */
export function softEnvelope(mode: SurfaceMode, generation: number): DiscEnvelope {
    return { mode, version: SOFT_DISC_VERSION, generation };
}

function adapt(port: Worker): WorkerLike {
    return {
        postMessage(message) { port.postMessage(message); },
        addEventListener(_type, listener) {
            port.addEventListener('message', (event) => listener({ data: event.data as WorkerState | WorkerTiles }));
            port.addEventListener('error', () => {
                failed = true;
                ready = false;
            });
        },
        terminate() { port.terminate(); },
    };
}

function open(): WorkerLike | null {
    if (worker) return worker;
    if (failed) return null;
    try {
        const made = spawnOverride ? spawnOverride() : adapt(startSoftDiscWorker());
        made.addEventListener('message', (event) => {
            const data = event.data;
            if (!data) return;
            if (data.op === 'state' || data.op === 'tiles') {
                ready = data.ready;
                failed = data.failed;
            }
            if (data.op === 'tiles') void settleDiscDelivery(data, () => live, () => keys);
        });
        worker = made;
        return made;
    } catch {
        failed = true;
        return null;
    }
}

/** The sheet a disc's globe is painted from, or null when the body has none. */
export function globeRecipe(mode: SurfaceMode, disc: DiscRequest, profile: Profile): Recipe | null {
    const body = disc.body as Record<string, any>;
    const slot = mode + '|' + disc.hexKey + '|' + disc.dossierKey;
    let rows = recipes.get(body);
    if (rows?.has(slot)) return rows.get(slot) ?? null;
    let found: Recipe | null = null;
    if (profile.kind === 'gas') {
        const gas = profile.gas as Record<string, any> | null;
        if (gas) {
            const colours = { zone: gas.zone, belt: gas.belt, pole: gas.pole, bands: gas.bands };
            found = {
                key: 'g|' + String(profile.id) + '|' + JSON.stringify(colours),
                recipe: { kind: 'gas', gas: colours, offsets: [...(profile.offsets as number[])] },
                lonOffset: 0,
            };
        }
    } else if (mode === 'enhanced') {
        const world = hybridWorld(disc.hexKey, disc.dossierKey, body, { continental: CONTINENTAL_DEFINITION, coastline: COASTLINE_COMPLEXITY });
        if (world) {
            found = {
                key: 'h|' + world.seed + '|' + worldDigest(world),
                recipe: { kind: 'hybrid', world },
                // The hybrid sheet puts a locked world's star side at this longitude; the disc keeps
                // planet +x toward the star (disc_batch.ts turnOf), so the sheet is turned to match.
                lonOffset: world.locked ? LOCKED_NIGHT_CENTRED_LON * Math.PI / 180 : 0,
            };
        }
    } else {
        const spec = diamondMapSpec(body, disc.hexKey);
        if (spec) {
            const inputs = {
                worldData: spec.worldData,
                imageSeed: spec.seed,
                masterSeed: VANILLA_MASTER_SEED,
                continentalDefinition: CONTINENTAL_DEFINITION,
                coastlineComplexity: COASTLINE_COMPLEXITY,
                printMode: false,
            };
            found = { key: 'v|' + spec.seed + '|' + JSON.stringify(spec.worldData), recipe: { kind: 'vanilla', inputs }, lonOffset: 0 };
        }
    }
    if (!rows) {
        rows = new Map();
        recipes.set(body, rows);
    }
    rows.set(slot, found);
    return found;
}

/** One disc of the watch, from the batch's request and the shade pass's request for it. */
export function softDisc(mode: SurfaceMode, disc: DiscRequest, shade: ShadeRequest): SoftDisc | null {
    const profile = shade.profile as Profile;
    const recipe = globeRecipe(mode, disc, profile);
    if (!recipe) return null;
    const rings = profile.rings as Record<string, any> | undefined;
    const ring = disc.ring && rings
        ? {
            inner: disc.ring.inner,
            outer: disc.ring.outer,
            opacity: (rings.opacity as number) * disc.ring.fill,
            gaps: [...(rings.gaps as number[])],
            seed: rings.seed as number,
            inside: [...(rings.inner as number[])],
            outside: [...(rings.outer as number[])],
        }
        : null;
    return {
        key: disc.key,
        radiusPx: Math.min(disc.radiusPx, SOFT_MAX_RADIUS),
        spin: disc.spin,
        sweep: disc.sweep,
        tiltDeg: disc.tiltDeg,
        axisAzimuth: profile.axisAzimuth,
        lonOffset: recipe.lonOffset,
        light: [disc.light[0], disc.light[1]],
        sun: [disc.sun[0], disc.sun[1], disc.sun[2]],
        casters: disc.casters.map((row) => row.slice()),
        lightMode: disc.lightMode,
        air: Number((profile.air as Record<string, any> | undefined)?.strength) || 0,
        gas: profile.kind === 'gas',
        ring,
        globe: { key: recipe.key, recipe: recipe.recipe },
    };
}

/**
 * Posts this frame's watch. 'pending' until the worker says it is up, 'unavailable' when it
 * cannot start, else 'ready': tiles may be drawn, and come a frame or more later.
 */
export function prepareSoftDiscs(
    request: DiscBatchRequest,
    shades: readonly ShadeRequest[],
    generation: number,
    frameKeys: ReadonlySet<string>,
): 'unavailable' | 'pending' | 'ready' {
    const port = open();
    live = softEnvelope(request.mode, generation);
    keys = new Set(frameKeys);
    if (!port || failed) return 'unavailable';
    const byKey = new Map(request.discs.map((disc) => [disc.key, disc]));
    const discs: SoftDisc[] = [];
    for (const shade of shades) {
        const disc = byKey.get(shade.key);
        if (!disc) continue;
        const soft = softDisc(request.mode, disc, shade);
        if (soft) discs.push(soft);
    }
    port.postMessage({ op: 'watch', discs, mode: request.mode, version: SOFT_DISC_VERSION, generation });
    return ready ? 'ready' : 'pending';
}

export function disposeSoftDiscs(): void {
    if (worker) worker.terminate();
    worker = null;
    failed = false;
    ready = false;
    live = null;
    keys = new Set();
}
