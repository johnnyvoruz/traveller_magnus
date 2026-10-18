/**
 * The orbit picture's line when this browser has no WebGL. The discs are then
 * painted in software from the dossier's sheets (surface/soft), without the
 * layers only the WebGL disc draws. The dossier map is a 2D canvas and loses
 * nothing without WebGL.
 */
export const SURFACE_WEBGL_NOTICE = 'Planet surfaces are simpler because WebGL is turned off in this browser: they have no clouds, city lights, sun glint, or haze. To see them, turn on hardware acceleration in your browser\'s settings, and then reload.';

/** The same line for a narrow picture (a phone), where the full one would cover it. */
export const SURFACE_WEBGL_NOTICE_SHORT = 'Planet surfaces are simpler because WebGL is turned off.';

export type WebglState = 'unknown' | 'ok' | 'missing';

/** Something that answers like the probe worker (surface/webgl_probe.worker.ts). Tests pass a fake. */
export type WebglProbe = {
    addEventListener(type: 'message', listener: (event: { data: { webgl: boolean | null } }) => void): void;
    addEventListener(type: 'error', listener: () => void): void;
    terminate(): void;
};

let state: WebglState | null = null;
let spawnProbe: (() => WebglProbe) | null = null;
const listeners = new Set<(next: WebglState) => void>();

/** Tests: a fake probe, or null for the real worker. Forgets the answer so the next ask probes again. */
export function configureWebglProbe(spawn: (() => WebglProbe) | null): void {
    spawnProbe = spawn;
    state = null;
}

function settle(next: WebglState): void {
    state = next;
    for (const listener of [...listeners]) listener(next);
}

/** The page's own answer, for a browser that cannot start the probe worker. Makes a context on the page. */
function probeOnPage(): WebglState {
    try {
        const canvas = document.createElement('canvas');
        return canvas.getContext('webgl2') || canvas.getContext('webgl') ? 'ok' : 'missing';
    } catch {
        return 'missing';
    }
}

function startProbe(): void {
    try {
        const probe = spawnProbe ? spawnProbe() : (new Worker(new URL('./webgl_probe.worker.ts', import.meta.url), { type: 'module' }) as unknown as WebglProbe);
        probe.addEventListener('message', (event) => {
            const webgl = event.data ? event.data.webgl : null;
            settle(webgl === null ? probeOnPage() : webgl ? 'ok' : 'missing');
            probe.terminate();
        });
        probe.addEventListener('error', () => {
            settle(probeOnPage());
            probe.terminate();
        });
    } catch {
        settle(probeOnPage());
    }
}

/**
 * Whether this browser gives a worker a WebGL context, asked once in a small worker so no page task
 * makes a context. 'unknown' until the answer comes (a few frames); 'ok' where there is no document.
 */
export function webglState(): WebglState {
    if (state !== null) return state;
    if (typeof document === 'undefined') {
        state = 'ok';
        return state;
    }
    state = 'unknown';
    startProbe();
    return state;
}

/** Called once when the probe answers. Returns a function that stops listening. */
export function onWebglState(listener: (next: WebglState) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** True once the probe has found no WebGL. False while it is still asking, and where there is no document. */
export function webglMissing(): boolean {
    return webglState() === 'missing';
}
