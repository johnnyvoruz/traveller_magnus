/**
 * CPU vanilla sheets off the page thread.
 * One job runs. At most two wait. A newer map pushes an older waiting job out.
 * Cancel removes a waiting job and drops the running result when it finishes.
 * The RGBA buffer is transferred.
 */
import {
    SURFACE_MESSAGE_VERSION,
    type SurfaceMode,
    type SurfaceWorkerMessage,
    type SurfaceWorkerReply,
    type VanillaPaintInputs,
} from './contracts.ts';
import { MAP_HEIGHT, MAP_WIDTH, renderFlatMapPixels, type DiamondMapInputs } from './vanilla/map.ts';

export type SurfacePort = {
    postMessage(data: SurfaceWorkerReply, transfer?: ArrayBuffer[]): void;
    addEventListener(type: 'message', listener: (event: { data: SurfaceWorkerMessage }) => void): void;
};

type Job = {
    requestId: string;
    generation: number;
    mode: SurfaceMode;
    inputs: VanillaPaintInputs;
    cancelled: boolean;
};

const QUEUE_CAP = 2;

export function attachSurfaceWorker(
    port: SurfacePort,
    options?: {
        render?: (inputs: DiamondMapInputs) => Uint8ClampedArray;
        schedule?: (fn: () => void) => void;
    },
): void {
    const render = options?.render ?? ((inputs: DiamondMapInputs) => renderFlatMapPixels(inputs));
    const schedule = options?.schedule ?? ((fn: () => void) => { setTimeout(fn, 0); });
    const queued: Job[] = [];
    let active: Job | null = null;
    let scheduled = false;

    function reply(message: SurfaceWorkerReply, transfer?: ArrayBuffer[]): void {
        port.postMessage(message, transfer);
    }

    function dropped(job: Job): void {
        reply({
            version: SURFACE_MESSAGE_VERSION,
            requestId: job.requestId,
            op: 'dropped',
            mode: job.mode,
            generation: job.generation,
        });
    }

    function trim(): void {
        while (queued.length > QUEUE_CAP) {
            const job = queued.shift();
            if (job) dropped(job);
        }
    }

    function kick(): void {
        if (scheduled || active || queued.length === 0) return;
        scheduled = true;
        schedule(() => {
            scheduled = false;
            run();
        });
    }

    function run(): void {
        if (active || queued.length === 0) return;
        const job = queued.shift();
        if (!job) return;
        active = job;
        const pixels = render(job.inputs);
        active = null;
        if (job.cancelled) {
            dropped(job);
        } else {
            reply({
                version: SURFACE_MESSAGE_VERSION,
                requestId: job.requestId,
                op: 'map',
                mode: job.mode,
                generation: job.generation,
                width: MAP_WIDTH,
                height: MAP_HEIGHT,
                pixels,
            }, [pixels.buffer as ArrayBuffer]);
        }
        kick();
    }

    port.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.version !== SURFACE_MESSAGE_VERSION) return;
        if (message.op === 'cancel') {
            for (let i = queued.length - 1; i >= 0; i -= 1) {
                if (queued[i].requestId === message.requestId) dropped(queued.splice(i, 1)[0]);
            }
            if (active && active.requestId === message.requestId) active.cancelled = true;
            return;
        }
        if (message.op !== 'map' || !message.inputs) return;
        queued.push({
            requestId: message.requestId,
            generation: message.generation,
            mode: message.mode,
            inputs: message.inputs,
            cancelled: false,
        });
        trim();
        kick();
    });

    reply({
        version: SURFACE_MESSAGE_VERSION,
        requestId: '',
        op: 'ready',
        mode: 'vanilla',
        generation: 0,
    });
}

type WorkerScope = {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    addEventListener(type: string, listener: (event: MessageEvent) => void): void;
    document?: Document;
};

const scope = globalThis as unknown as WorkerScope;
if (typeof scope.addEventListener === 'function' && typeof scope.postMessage === 'function' && typeof scope.document === 'undefined') {
    attachSurfaceWorker({
        postMessage(data, transfer) {
            scope.postMessage(data, transfer);
        },
        addEventListener(type, listener) {
            scope.addEventListener(type, (event) => {
                listener({ data: event.data as SurfaceWorkerMessage });
            });
        },
    });
}
