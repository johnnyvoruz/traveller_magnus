/**
 * Runs one line-up search at a time. The search can take a while on a large system (legacy
 * ran it on the page, 16 probes with a breath between them), and a frame must stay under
 * 16 ms, so it runs on a worker where there is one and on the page, pausing between probes,
 * where there is not. A new search replaces the one in flight; a replaced or cancelled
 * search answers null, as the legacy run counter made it. Pure but for the worker it is
 * handed: it runs under Node with none.
 */
import { searchAlignments, type AlignmentBodies, type AlignmentResult } from './alignment.ts';

/** The part of a Worker this needs. */
export type WorkerLike = {
    postMessage(message: unknown): void;
    addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
    terminate(): void;
};

export type RunOptions = {
    startDays: number;
    tolerance?: number | null;
    strict?: boolean;
    sameSide?: boolean;
    horizonDays?: number;
};

/** What the page posts to the worker, and what the worker posts back. */
export type SearchRequest = { id: number; found: AlignmentBodies; options: RunOptions };
export type SearchReply = { id: number; result: AlignmentResult | null };

function breath(): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, 0); });
}

export class AlignmentRunner {
    private spawn: (() => WorkerLike) | null;
    private worker: WorkerLike | null = null;
    private run_ = 0;
    private settle: ((result: AlignmentResult | null) => void) | null = null;

    constructor(spawn: (() => WorkerLike) | null) {
        this.spawn = spawn;
    }

    /** True while a search is in flight. */
    get busy(): boolean {
        return this.settle !== null;
    }

    /** Stops the search in flight, if any: it answers null. */
    cancel(): void {
        this.run_ += 1;
        const settle = this.settle;
        this.settle = null;
        // A worker cannot be interrupted mid-probe; stopping it is the only cancel that frees the core.
        if (settle && this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (settle) settle(null);
    }

    dispose(): void {
        this.cancel();
        if (this.worker) this.worker.terminate();
        this.worker = null;
    }

    private open(): WorkerLike | null {
        if (this.worker) return this.worker;
        if (!this.spawn) return null;
        try {
            const worker = this.spawn();
            worker.addEventListener('message', (event) => {
                const reply = event.data as SearchReply;
                if (!reply || reply.id !== this.run_ || !this.settle) return;
                const settle = this.settle;
                this.settle = null;
                settle(reply.result);
            });
            this.worker = worker;
            return worker;
        } catch {
            // No workers here: the page does the work.
            this.spawn = null;
            return null;
        }
    }

    run(found: AlignmentBodies, options: RunOptions): Promise<AlignmentResult | null> {
        this.cancel();
        const id = this.run_;
        const worker = this.open();
        return new Promise((resolve) => {
            this.settle = resolve;
            if (worker) {
                const request: SearchRequest = { id, found, options };
                worker.postMessage(request);
                return;
            }
            void searchAlignments(found, { ...options, pause: breath, alive: () => id === this.run_ }).then((result) => {
                if (id !== this.run_ || this.settle !== resolve) return;
                this.settle = null;
                resolve(result);
            });
        });
    }
}
