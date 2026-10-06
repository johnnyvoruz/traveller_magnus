/**
 * The locator (design §4): one thing at a time is "located". The map view watches this,
 * flies to its hex and hands the map's campaign layer the line to draw; the button that
 * started it reads "Locating" until it ends. The thing is a campaign record (its id), the
 * party ("party"), or the system on screen (systemSubject(hexKey): Johnny, 2026-10-06, "I
 * can easily move the map and lose the system"). A system needs no campaign and no sign-in.
 */
import { reactive } from 'vue';

export const locating = reactive<{
    /** The subject being located: a record's id, "party", or a system's subject; null for none. The name is the first use's. */
    recordId: string | null;
    hexKey: string;
    /** Counts starts, so locating the same record again flies again. */
    turn: number;
}>({ recordId: null, hexKey: '', turn: 0 });

/** Where the line starts, down the page in CSS pixels, or null when the control is not on screen. */
let origin: (() => number | null) | null = null;
let lastY = 0;

/** The subject of a system's locate. A record id starts "cr_", so the two can never be the same. */
export function systemSubject(hexKey: string): string {
    return 'hex:' + hexKey;
}

export function startLocate(recordId: string, hexKey: string, from: () => number | null): void {
    origin = from;
    locating.recordId = recordId;
    locating.hexKey = hexKey;
    locating.turn += 1;
}

export function stopLocate(): void {
    origin = null;
    locating.recordId = null;
    locating.hexKey = '';
}

/** The height the line starts from: the control's own, or where it last was once it has gone. */
export function locateOriginY(): number {
    const y = origin ? origin() : null;
    if (y !== null && Number.isFinite(y)) lastY = y;
    return lastY;
}
