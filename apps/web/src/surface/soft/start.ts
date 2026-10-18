/** Starts the software disc worker (soft/disc.worker.ts). Throws where workers are not available. */
export function startSoftDiscWorker(): Worker {
    return new Worker(new URL('./disc.worker.ts', import.meta.url), { type: 'module' });
}
