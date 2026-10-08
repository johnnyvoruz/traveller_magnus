/**
 * Step 4b looks. A is step 4. B is the same network, brighter, and it
 * reaches farther across settled land. C adds B's low sheet on a
 * high-population, high-tech world. Johnny changes CITY_LOOK.
 */

export type CityLookId = 'A' | 'B' | 'C';

export type CityLook = {
    readonly id: CityLookId;
    readonly index: 0 | 1 | 2;
    /** Direct coefficient on cube C. A is the design's 1.8. */
    readonly direct: number;
    readonly tight: number;
    readonly broad: number;
    /** CSS pixels. Tight glow fades in across this span. */
    readonly tightFrom: number;
    readonly tightTo: number;
    readonly broadFrom: number;
    readonly broadTo: number;
    /** Core gate on the extra taps. A is 0.01 to 0.12. */
    readonly coreFrom: number;
    readonly coreTo: number;
    /**
     * Gain at population 9. Population 5 and below stays at 1.
     * The mix runs from population 5 to 9, so Cantrel is not boosted.
     */
    readonly gain: number;
    /** Added arterial weight in the bake. 0 leaves the step-4 fabric. */
    readonly arterial: number;
    /**
     * Feather of the baked city mask onto nearby land, for population 8
     * and above. 0 leaves the mask alone. Oceans are not feathered.
     */
    readonly spread: number;
    /**
     * Low sheet under cube C energy. Drawn only when population is at
     * least 9 and the tech neon is on (tech level 12 and above).
     */
    readonly sheet: number;
};

/** Step 4 as accepted. */
export const CITY_LOOK_A: CityLook = {
    id: 'A',
    index: 0,
    direct: 1.8,
    tight: 1.15,
    broad: 0.55,
    tightFrom: 60,
    tightTo: 96,
    broadFrom: 120,
    broadTo: 160,
    coreFrom: 0.01,
    coreTo: 0.12,
    gain: 1,
    arterial: 0,
    spread: 0,
    sheet: 0,
};

/**
 * Brighter and fuller. The glow is admitted from a 20 px disc, the
 * arterials are heavier, and population 8 and 9 feather the network
 * onto neighbouring land.
 */
export const CITY_LOOK_B: CityLook = {
    id: 'B',
    index: 1,
    direct: 2.8,
    tight: 2.4,
    broad: 1.6,
    tightFrom: 8,
    tightTo: 20,
    broadFrom: 12,
    broadTo: 36,
    coreFrom: 0.004,
    coreTo: 0.07,
    gain: 1.85,
    arterial: 0.12,
    spread: 1,
    sheet: 0,
};

/** B, plus a low carpet where cube C already has energy, on Rhylanor-class worlds. */
export const CITY_LOOK_C: CityLook = {
    id: 'C',
    index: 2,
    direct: 2.8,
    tight: 2.6,
    broad: 1.85,
    tightFrom: 8,
    tightTo: 20,
    broadFrom: 12,
    broadTo: 36,
    coreFrom: 0.004,
    coreTo: 0.07,
    gain: 1.85,
    arterial: 0.12,
    spread: 1,
    sheet: 1.4,
};

const LOOKS: readonly CityLook[] = [CITY_LOOK_A, CITY_LOOK_B, CITY_LOOK_C];

/** Johnny's pick. One line. */
export const CITY_LOOK: CityLook = CITY_LOOK_C;

let active: CityLook = CITY_LOOK;

export function cityLook(): CityLook {
    return active;
}

export function setCityLook(id: CityLookId): void {
    const next = LOOKS.find((look) => look.id === id);
    if (next) active = next;
}

export function cityLookFromIndex(index: number): CityLook {
    if (index >= 1.5) return CITY_LOOK_C;
    if (index >= 0.5) return CITY_LOOK_B;
    return CITY_LOOK_A;
}
