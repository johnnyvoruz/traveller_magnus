/**
 * The running orbit clock, as OrbitView already hands it to the picture.
 * OrbitCanvas.paint is called once a frame with that date; it publishes here.
 * The dossier subscribes. This module holds no date and does no arithmetic.
 */

type Hear = (days: number) => void;

const hearers = new Set<Hear>();

/** One frame of the clock the picture was just given. */
export function publishOrbitClock(days: number): void {
    if (!Number.isFinite(days)) return;
    for (const hear of hearers) hear(days);
}

/** Hear each published date until the returned function is called. */
export function subscribeOrbitClock(hear: Hear): () => void {
    hearers.add(hear);
    return () => { hearers.delete(hear); };
}
