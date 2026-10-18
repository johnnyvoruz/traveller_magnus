/**
 * Asks once, off the page, whether this browser gives a worker a WebGL context: the disc worker
 * (vanilla/gl.worker.ts) paints on an OffscreenCanvas, so that is the question that matters, and
 * making a context on the page cost a long task (70 ms at 4x throttling) as the orbit view opened.
 * Posts { webgl: true | false }, or { webgl: null } where there is no OffscreenCanvas.
 */
type ProbeScope = { postMessage(message: unknown): void; document?: unknown };

const scope = globalThis as unknown as ProbeScope;
if (typeof scope.postMessage === 'function' && typeof scope.document === 'undefined') {
    let webgl: boolean | null = null;
    if (typeof OffscreenCanvas === 'function') {
        try {
            const canvas = new OffscreenCanvas(1, 1);
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            webgl = !!gl;
            if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {
            webgl = false;
        }
    }
    scope.postMessage({ webgl });
}
