/**
 * The locator (design §4): one record at a time is "located". The map view watches this,
 * flies to the record's hex and hands the map's campaign layer the line to draw; the button
 * that started it reads "Locating" until it ends.
 */
import { reactive } from 'vue';

export const locating = reactive<{
    /** The record being located, or null. */
    recordId: string | null;
    hexKey: string;
    /** Counts starts, so locating the same record again flies again. */
    turn: number;
}>({ recordId: null, hexKey: '', turn: 0 });

/** Where the line starts, down the page in CSS pixels, or null when the control is not on screen. */
let origin: (() => number | null) | null = null;
let lastY = 0;

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
