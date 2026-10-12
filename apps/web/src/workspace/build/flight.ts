/**
 * Generation in flight (prompts/d_generate_feedback.md part 1): which hexes a running job is
 * filling, so the map can mark them as waiting and each one changes as its system lands. The
 * store's progress is counts only; a hex has landed when its row's revision has moved past the
 * one it had at the click (the store reloads the job's sectors at every poll).
 *
 * The split is pure and runs under Node.
 */
import { reactive } from 'vue';
import { buildStore } from './seam.ts';

export const flight = reactive({
    /** The job's hexes, from the frame of the click until the job ends. */
    keys: [] as string[],
    /** Each hex's revision at the click; -1 when it had no row. */
    from: {} as Record<string, number>,
});

/** The revision of a hex's row on this map, -1 with none. Reads the store's tick, so a screen follows each landing. */
export function revOf(hexKey: string): number {
    const store = buildStore();
    if (!store) return -1;
    void store.tick();
    const row = store.row(hexKey);
    return row ? row.rev : -1;
}

export function startFlight(keys: readonly string[], rev: (hexKey: string) => number = revOf): void {
    const from: Record<string, number> = {};
    for (const key of keys) from[key] = rev(key);
    flight.from = from;
    flight.keys = [...keys];
}

/** The hexes of an empty slot get their real keys at the server's answer: the marks follow them. */
export function renameFlight(real: Record<string, string>): void {
    const from: Record<string, number> = {};
    flight.keys = flight.keys.map((key) => {
        const now = real[key] ?? key;
        from[now] = flight.from[key] ?? -1;
        return now;
    });
    flight.from = from;
}

export function endFlight(): void {
    flight.keys = [];
    flight.from = {};
}

/** Which of the job's hexes are still waiting, and which have landed. */
export function flightSplit(keys: readonly string[], from: Readonly<Record<string, number>>, rev: (hexKey: string) => number): { waiting: string[]; landed: string[] } {
    const waiting: string[] = [];
    const landed: string[] = [];
    for (const key of keys) {
        if (rev(key) > (from[key] ?? -1)) landed.push(key);
        else waiting.push(key);
    }
    return { waiting, landed };
}
