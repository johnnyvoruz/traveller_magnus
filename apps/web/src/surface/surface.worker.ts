/**
 * CPU sheets off the page thread: the vanilla sheet, and the enhanced one when the request
 * carries its inputs: the hybrid map (surface/hybrid) when it carries a world, else the
 * enhanced-seas sheet when it carries a sea.
 * One job runs. At most two wait. A newer map pushes an older waiting job out.
 * Cancel removes a waiting job and drops the running result when it finishes.
 * The RGBA buffer is transferred.
 */
import {
    SURFACE_MESSAGE_VERSION,
    type EnhancedPaintInputs,
    type HybridPaintInputs,
    type SurfaceMode,
    type SurfaceWorkerMessage,
    type SurfaceWorkerReply,
    type VanillaPaintInputs,
} from './contracts.ts';
import { renderEnhancedMapPixels } from './enhanced/map.ts';
import { LARGE_SHEET, SHEET_LAYOUT, type SheetLayout } from './hybrid/field.ts';
import { renderHybridPixels } from './hybrid/index.ts';
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
    enhanced: EnhancedPaintInputs | null;
    hybrid: HybridPaintInputs | null;
    /** Hybrid sheet layout. Null keeps the 800 × 400 sheet. */
    layout: SheetLayout | null;
    cancelled: boolean;
};

function layoutOf(message: SurfaceWorkerMessage): SheetLayout | null {
    const spec = message.sheet;
    if (!spec || message.mode !== 'enhanced' || !message.hybrid) return null;
    if (spec.width === LARGE_SHEET.width && spec.height === LARGE_SHEET.height && spec.side === LARGE_SHEET.side) return LARGE_SHEET;
    if (spec.width === SHEET_LAYOUT.width && spec.height === SHEET_LAYOUT.height && spec.side === SHEET_LAYOUT.side) return SHEET_LAYOUT;
    return null;
}

const QUEUE_CAP = 2;

export function attachSurfaceWorker(
    port: SurfacePort,
    options?: {
        render?: (inputs: DiamondMapInputs) => Uint8ClampedArray;
        renderEnhanced?: (inputs: EnhancedPaintInputs) => Uint8ClampedArray;
        renderHybrid?: (inputs: HybridPaintInputs, layout?: SheetLayout) => Uint8ClampedArray;
        schedule?: (fn: () => void) => void;
    },
): void {
    const render = options?.render ?? ((inputs: DiamondMapInputs) => renderFlatMapPixels(inputs));
    const renderEnhanced = options?.renderEnhanced ?? ((inputs: EnhancedPaintInputs) => renderEnhancedMapPixels(inputs));
    const renderHybrid = options?.renderHybrid ?? ((inputs: HybridPaintInputs, layout?: SheetLayout) => renderHybridPixels(inputs, layout ?? SHEET_LAYOUT));
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
        const pixels = job.hybrid ? renderHybrid(job.hybrid, job.layout ?? undefined) : job.enhanced ? renderEnhanced(job.enhanced) : render(job.inputs);
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
                width: job.layout?.width ?? MAP_WIDTH,
                height: job.layout?.height ?? MAP_HEIGHT,
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
            enhanced: message.mode === 'enhanced' && message.enhanced ? message.enhanced : null,
            hybrid: message.mode === 'enhanced' && message.hybrid ? message.hybrid : null,
            layout: layoutOf(message),
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
