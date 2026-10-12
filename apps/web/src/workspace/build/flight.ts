/**
 * Generation in flight (prompts/d_generate_feedback.md part 1; prompts/d_density_dropdown.md
 * item 4): which hexes a running job is filling, so the map marks them as waiting and each one
 * changes as its step reports.
 *
 * The store reports in steps of up to 32 (findings/builder_density_ready.md): `done` is the hexes
 * checked so far and `placed` (or each step's `landed`) the keys written. The server walks the
 * hexes in the order they were sent (apps/api/src/jobs/generate_queue.ts), so the first `done` of
 * the job's keys have been checked: a checked hex that was not written was left empty by the
 * density roll (or skipped, or failed) and goes back to plain. A store that sends no `placed`
 * leaves every hex waiting until the job ends.
 *
 * The split is pure and runs under Node.
 */
import { reactive } from 'vue';

export const flight = reactive({
    /** The job's hexes, in the order they were sent, from the frame of the click until the job ends. */
    keys: [] as string[],
    /** The keys written so far. */
    placed: [] as string[],
    /** How many of `keys`, from the start, the server has checked. */
    checked: 0,
});

export function startFlight(keys: readonly string[]): void {
    flight.keys = [...keys];
    flight.placed = [];
    flight.checked = 0;
}

/** One report from the store: the keys written since the last one, and how many hexes are checked. */
export function noteFlight(progress: { done: number; placed?: readonly string[]; landed?: readonly string[] }): void {
    if (!progress.placed && !progress.landed) return;
    if (progress.placed) flight.placed = [...progress.placed];
    else if (progress.landed && progress.landed.length) flight.placed = [...flight.placed, ...progress.landed.filter((key) => !flight.placed.includes(key))];
    flight.checked = Math.min(progress.done, flight.keys.length);
}

/** The hexes of an empty slot get their real keys at the server's answer: the marks follow them. */
export function renameFlight(real: Record<string, string>): void {
    flight.keys = flight.keys.map((key) => real[key] ?? key);
}

export function endFlight(): void {
    flight.keys = [];
    flight.placed = [];
    flight.checked = 0;
}

/** Which of the job's hexes are still waiting, and which have landed. A checked hex not written is neither. */
export function flightSplit(keys: readonly string[], placed: readonly string[], checked: number): { waiting: string[]; landed: string[] } {
    const written = new Set(placed);
    const landed = keys.filter((key) => written.has(key));
    const waiting = keys.slice(checked).filter((key) => !written.has(key));
    return { waiting, landed };
}
