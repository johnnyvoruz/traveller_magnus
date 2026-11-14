/**
 * Directions open or shut, and what the rest of the page asks of it (DN2). The system panel's From here and
 * To here, the corner button and `d` all come here; the panel (`DirectionsPanel.vue`) applies an ask, because
 * it holds the loaded sectors' names. The route drawn is `stops`; MapView draws it and nothing else clears it
 * but Clear and closing. At Full, opening Directions shows the system panel at Column until Directions shuts.
 */
import { reactive } from 'vue';
import { holdSpan, readSpan, releaseSpan } from '../shell/panel_state.ts';
import type { RouteEnd } from './route_plan.ts';

export type EndBox = 'from' | 'to';

export const directionsState = reactive({
    open: false,
    /** Fill this box with this system; `seq` tells one ask from the next. */
    ask: null as { box: EndBox; end: RouteEnd; seq: number } | null,
    /** The route's stops while one is drawn. */
    stops: null as RouteEnd[] | null,
});

let seq = 0;
let heldSpan = false;

export function openDirections(): void {
    if (directionsState.open) return;
    directionsState.open = true;
    if (readSpan() === 'full') {
        holdSpan('column');
        heldSpan = true;
    }
}

export function closeDirections(): void {
    directionsState.open = false;
    directionsState.ask = null;
    directionsState.stops = null;
    if (heldSpan) {
        heldSpan = false;
        releaseSpan();
    }
}

export function toggleDirections(): void {
    if (directionsState.open) closeDirections();
    else openDirections();
}

/** From here, To here: open Directions with that box filled; the focus goes to the other box. */
export function directionsHere(box: EndBox, end: RouteEnd): void {
    openDirections();
    seq += 1;
    directionsState.ask = { box, end: { sector: end.sector, hex: end.hex }, seq };
}

/** The other box, where the focus goes after an ask. */
export function otherBox(box: EndBox): EndBox {
    return box === 'from' ? 'to' : 'from';
}

/** The box "Use <name>" offers to fill: From while it is empty, then To while it is empty, else none. */
export function emptyBox(form: { from: string; to: string }): EndBox | null {
    if (!form.from.trim()) return 'from';
    if (!form.to.trim()) return 'to';
    return null;
}
