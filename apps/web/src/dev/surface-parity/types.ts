/** Explicit inputs for one flat-map render. Both realms receive the same object. */
export type SurfaceMapInputs = {
    id: string;
    worldData: {
        name: string;
        atmosphere: number;
        hydrographics: number;
        temperature: string;
        temperatureK: number;
        size: number;
        uwp: string;
    };
    hexId: string;
    masterSeed: string;
    continentalDefinition: number;
    coastlineComplexity: number;
    printMode: boolean;
    projection: string;
    numLobes?: number;
};

/** (inputs) => 800×400 canvas. The port will replace the legacy realm behind this. */
export type SurfaceCandidate = (inputs: SurfaceMapInputs) => HTMLCanvasElement;

export type WorldParity = {
    id: string;
    mismatches: number;
    maxChannelError: number;
    meanChannelError: number;
    width: number;
    height: number;
    differenceImage: string;
    /** Distinct RGB triples on the legacy canvas. A blank frame has one. */
    legacyDistinctColours: number;
    /** True when any legacy pixel has alpha above 0. Diamond corners stay clear. */
    legacyAlpha: boolean;
};

export type ParityResult = {
    status: 'running' | 'done' | 'error';
    ok: boolean;
    message?: string;
    worlds: WorldParity[];
    /** Same world, different masterSeed on the port. Mismatches must be above 0. */
    negativeControl?: WorldParity;
    /** Main-thread renderFlatMapPixels for Regina, milliseconds. */
    reginaPixelsMs?: number;
};
