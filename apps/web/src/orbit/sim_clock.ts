/**
 * One clock for the orbit view and the surface map. While the orbit view is open it drives
 * the clock (it registers here and publishes each frame through running.ts); the map's time
 * bar then steers the orbit view's own controls. With no orbit view open the store keeps
 * time itself. "Now" is the campaign date.
 */
import { reactive } from 'vue';
import { advance, DAY_SECONDS } from './clock.ts';
import { subscribeOrbitClock } from './running.ts';
import { cancelFrame, nextFrame, now } from '../platform/browser.ts';

export type ClockDriver = {
    setDays(days: number): void;
    setPlaying(playing: boolean): void;
    /** Days per second. */
    setRate(rate: number): void;
    playing(): boolean;
    rate(): number;
};

/** Speeds the map's time bar offers, days per second. */
export const MAP_SPEEDS: readonly { readonly label: string; readonly rate: number }[] = [
    { label: '1 min/s', rate: 1 / 1440 },
    { label: '10 min/s', rate: 1 / 144 },
    { label: '1 h/s', rate: 1 / 24 },
    { label: '6 h/s', rate: 0.25 },
    { label: '1 d/s', rate: 1 },
    { label: '1 wk/s', rate: 7 },
    { label: '30 d/s', rate: 30 },
];

export const simClock = reactive({
    /** The clock's date in days. Updated at most once a frame; the second shown is what triggers redraws. */
    days: 0,
    playing: false,
    rate: 1 / 24,
    /** 'orbit' while the orbit view drives the clock. */
    driver: 'local' as 'local' | 'orbit',
    /** True once the store has been given a date. */
    started: false,
});

type Hear = (days: number) => void;
const hearers = new Set<Hear>();
let driver: ClockDriver | null = null;
let exact = 0;
let raf = 0;
let last = 0;

function tell(days: number): void {
    exact = days;
    if (Math.floor(days * DAY_SECONDS) !== Math.floor(simClock.days * DAY_SECONDS) || !simClock.started) simClock.days = days;
    simClock.started = true;
    for (const hear of hearers) hear(days);
}

subscribeOrbitClock((days) => {
    if (driver) tell(days);
});

function loop(): void {
    raf = 0;
    if (driver || !simClock.playing) return;
    const t = now();
    tell(advance(exact, t - last, simClock.rate));
    last = t;
    raf = nextFrame(loop);
}

function startLoop(): void {
    if (raf || driver || !simClock.playing) return;
    last = now();
    raf = nextFrame(loop);
}

function stopLoop(): void {
    if (raf) cancelFrame(raf);
    raf = 0;
}

/** The exact clock value (the reactive one only moves when the shown second changes). */
export function clockDays(): number {
    return exact;
}

/** Hear every clock value until the returned function is called. */
export function subscribeSimClock(hear: Hear): () => void {
    hearers.add(hear);
    return () => { hearers.delete(hear); };
}

/** The orbit view takes the clock while it is open. */
export function registerClockDriver(next: ClockDriver): () => void {
    driver = next;
    stopLoop();
    simClock.driver = 'orbit';
    simClock.playing = next.playing();
    simClock.rate = next.rate();
    return () => {
        if (driver !== next) return;
        driver = null;
        simClock.driver = 'local';
        simClock.playing = false;
    };
}

/** The orbit view reports its controls when they change. */
export function noteDriverState(playing: boolean, rate: number): void {
    if (!driver) return;
    simClock.playing = playing;
    if (rate) simClock.rate = rate;
}

/** A starting date for a store nobody has set yet (the dossier's link or campaign date). */
export function offerStart(days: number): void {
    if (simClock.started || driver || !Number.isFinite(days)) return;
    tell(days);
}

let jumps = 0;

/** Counts the clock's jumps (a typed date, Now): the map tweens its sun over each one. */
export function clockJumps(): number {
    return jumps;
}

export function setClockDays(days: number): void {
    if (!Number.isFinite(days)) return;
    jumps += 1;
    if (driver) {
        driver.setDays(days);
        tell(days);
        return;
    }
    tell(days);
}

export function setClockPlaying(playing: boolean): void {
    simClock.playing = playing;
    if (driver) {
        driver.setPlaying(playing);
        return;
    }
    if (playing) startLoop();
    else stopLoop();
}

export function setClockRate(rate: number): void {
    if (!(rate > 0)) return;
    simClock.rate = rate;
    if (driver) driver.setRate(rate);
}

/** Now: the campaign date, stopped there. */
export function clockToNow(campaignDays: number): void {
    setClockPlaying(false);
    setClockDays(campaignDays);
}
