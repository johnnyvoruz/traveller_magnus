import type { SurfaceCandidate, SurfaceMapInputs } from './types.ts';

type RealmWindow = Window & {
    renderSurface?: (inputs: SurfaceMapInputs) => HTMLCanvasElement;
};

/** The legacy renderer running in an isolated iframe realm. */
export function legacyRealmRenderer(frame: HTMLIFrameElement | null): SurfaceCandidate {
    const render = (frame?.contentWindow as RealmWindow | null)?.renderSurface;
    if (!render) throw new Error('Surface realm is not loaded.');
    return (inputs) => render(inputs);
}
