/**
 * The comms scheduler (ZC1; brief 3-5). The one timer authority for the receiver:
 * it decides when anything is said, the screen only says it. Completion-driven:
 * the next turn is scheduled only after the screen reports the transcript done,
 * then a 1-3 s dwell; after the last turn the screen keeps the line, clears, and
 * the band goes quiet for the cadence gap.
 *
 * The receiver listens to the system on screen (ZC2, Johnny 2026-10-18 11:55 and 11:57; ZC4, 14:44):
 * every line, every scene and the Beowulf roll play whoever watches and wherever the party is; the welcome beacon,
 * addressed to the party, plays once when the lead ship arrives (inSystem or docked),
 * also while the view is already on air; `mayday` needs no ship.
 *
 * Cancels on: a new system or truth version, chatter off or quiet (shown false),
 * and destroy() (unmount). The party moving does not cancel what is on the air. While
 * the tab is hidden the pending timer is paused and resumed with its remainder;
 * nothing is queued up behind it, so no backlog plays on return.
 *
 * Browser access is through platform/browser.ts only (storage, now, visibility).
 * The controller never calls screen.destroy(); the Vue wrapper owns the screen.
 */
import type { ChatterLineData } from '@voyage/shared';
import { now as browserNow, onPageVisibility, pageVisible, storageGet, storageSet } from '../../platform/browser.ts';
import type { PartyPlace, SystemFacts } from '../facts.ts';
import { receiverLines } from '../lines.ts';
import { beowulfEvent, beowulfStorageKey, shouldQueueBeowulf } from './beowulf.ts';
import { corpusPool } from './corpus_events.ts';
import { partyHears, suggestedGapSeconds, welcomeFor, type RadioChannel, type RadioEvent } from './events.ts';
import { mixEvent } from './mixer.ts';
import { between, seeded } from './roster.ts';

/** What the screen is handed for one utterance (C's receiver_render.ts CommsMessage). */
export type CommsMessage = { ch: string; type: string; from: string; text: string; status?: string; band?: string };

/** The receiver interface the controller drives. */
export interface CommsScreen {
    transmit(message: CommsMessage): void;
    idle(options?: { keepLast?: boolean }): void;
    onTranscriptComplete(callback: () => void): void;
    /** Optional. Emergency events call this before the first fragment and back to normal after the fade, and on cancel. */
    theme?(mode: 'normal' | 'emergency'): void;
    destroy(): void;
}

export type CommsClock = {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
};
export type CommsStore = { get(key: string): string | null; set(key: string, value: string): void };
export type CommsVisibility = { visible(): boolean; onChange(fn: () => void): () => void };

export type CommsDeps = {
    screen: CommsScreen;
    clock?: CommsClock;
    store?: CommsStore;
    lines?: () => readonly ChatterLineData[];
    visibility?: CommsVisibility;
};

export type CommsInput = {
    facts: SystemFacts | null;
    truthVersion: string;
    campaignKey: string;
    /** Chatter on, not quiet, and the system view showing. */
    shown: boolean;
    /**
     * Play the archive 3s after this becomes active. Skips the rarity roll and the
     * once-only check, and does not write the played flag. Once per controller.
     */
    mayday?: boolean;
};

export type CommsState = 'off' | 'dead-air' | 'speaking' | 'dwell' | 'fading';

export type CommsController = {
    update(input: CommsInput): void;
    state(): CommsState;
    destroy(): void;
};

export const CHANNELS: Record<RadioChannel, { ch: string; type: string; status?: string; band?: string }> = {
    approach: { ch: 'CH 03', type: 'LOCAL APPROACH' },
    dockside: { ch: 'CH 07', type: 'DOCKSIDE' },
    services: { ch: 'CH 11', type: 'PORT SERVICES' },
    common: { ch: 'CH 16', type: 'COMMON' },
    'traffic-advisory': { ch: 'CH 01', type: 'TRAFFIC ADVISORY' },
    archive: { ch: 'CH --', type: 'ARCHIVE RELAY', status: 'PLAYBACK', band: 'RECORDED SIGNAL' },
};

export const TIMING = {
    dwellMinMs: 1000,
    dwellMaxMs: 3000,
    keepLastMs: 1150,
    clearMs: 2100,
    beaconDelayMs: 1500,
    /** CC3: the archive starts this long after the receiver mounts when the address carries mayday. */
    maydayDelayMs: 3000,
    firstGapShare: 0.25,
    splitAt: 160,
    recentMax: 24,
} as const;

type History = { eventIndex: number; recent: string[]; lastParty: PartyPlace | null };

export function historyKey(hexKey: string, truthVersion: string): string {
    return `voyage.comms.history.${hexKey}|${truthVersion}`;
}

/** Long utterances split at sentence boundaries, inside the same event. */
export function splitUtterance(text: string, max: number = TIMING.splitAt): string[] {
    if (text.length <= max) return [text];
    const sentences = text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [text];
    const out: string[] = [];
    let cur = '';
    for (const s of sentences) {
        if (cur && (cur + s).trim().length > max) { out.push(cur.trim()); cur = ''; }
        cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

export function messagesFor(ev: RadioEvent): CommsMessage[] {
    const chan = CHANNELS[ev.channel];
    const out: CommsMessage[] = [];
    for (const turn of ev.turns) {
        const parts = ev.uninterruptible ? [turn.text] : splitUtterance(turn.text);
        for (const text of parts) {
            const msg: CommsMessage = {
                ch: chan.ch,
                type: ev.theme === 'emergency' ? 'EMERGENCY' : chan.type,
                from: turn.speaker.toUpperCase(),
                text,
            };
            if (chan.status) msg.status = chan.status;
            if (chan.band) msg.band = chan.band;
            else if (turn.quality === 'weak') msg.band = 'WEAK CARRIER';
            out.push(msg);
        }
    }
    return out;
}

const defaultClock: CommsClock = {
    now: browserNow,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const defaultStore: CommsStore = { get: storageGet, set: storageSet };
const defaultVisibility: CommsVisibility = { visible: pageVisible, onChange: onPageVisibility };

function hears(party: PartyPlace | null): boolean {
    return party === 'inSystem' || party === 'docked';
}

export function createCommsController(deps: CommsDeps): CommsController {
    const screen = deps.screen;
    const clock = deps.clock ?? defaultClock;
    const store = deps.store ?? defaultStore;
    const visibility = deps.visibility ?? defaultVisibility;
    const lineSource = deps.lines ?? receiverLines;
    let corpus: readonly ChatterLineData[] | null = null;

    let state: CommsState = 'off';
    let gen = 0;
    let destroyed = false;
    let timer: unknown = null;
    let due = 0;
    let pending: (() => void) | null = null;
    let remaining: number | null = null;

    let ctxKey = '';
    let facts: SystemFacts | null = null;
    let tv = '';
    let campaign = '';
    let poolKey = '';
    let pool: ChatterLineData[] = [];
    let queue: CommsMessage[] = [];
    let turnNo = 0;
    let awaiting = false;
    let doneWhileHidden = false;
    let beowulfChecked = false;
    /** Set when the archive starts playing, not when it is armed (ZC3): a context change while armed re-arms it. */
    let maydayUsed = false;
    /**
     * When the armed archive is due: maydayDelayMs after it was first armed. A re-arm after a
     * context change keeps this deadline, so the archive still starts 3 s after the receiver came up.
     */
    let maydayDue: number | null = null;
    /** The archive was armed while System Comms was off, so turning the switch off must not cancel it. */
    let maydayDespiteOff = false;
    let emergencyLive = false;
    let chatterOn = false;
    let requestMayday = false;
    /** The archive is armed for maydayDelayMs; an arrival does not replace its timer. */
    let maydayArmed = false;
    /** The lead ship arrived while the view was on air: the beacon plays next. */
    let welcomeDue = false;

    function read(key: string): string | null {
        try { return store.get(key); } catch { return null; }
    }
    function write(key: string, value: string): void {
        try { store.set(key, value); } catch { /* storage full or blocked: history is best effort */ }
    }
    function load(hexKey: string, truthVersion: string): History {
        const raw = read(historyKey(hexKey, truthVersion));
        if (raw) {
            try {
                const h = JSON.parse(raw) as Partial<History>;
                return {
                    eventIndex: Number.isInteger(h.eventIndex) && (h.eventIndex as number) >= 0 ? (h.eventIndex as number) : 0,
                    recent: Array.isArray(h.recent) ? h.recent.filter((x): x is string => typeof x === 'string').slice(-TIMING.recentMax) : [],
                    lastParty: typeof h.lastParty === 'string' ? (h.lastParty as PartyPlace) : null,
                };
            } catch { /* fall through to a fresh history */ }
        }
        return { eventIndex: 0, recent: [], lastParty: null };
    }
    function save(hexKey: string, truthVersion: string, h: History): void {
        write(historyKey(hexKey, truthVersion), JSON.stringify(h));
    }

    function fire(): void {
        timer = null;
        const fn = pending;
        pending = null;
        if (fn) fn();
    }
    function clearTimer(): void {
        if (timer !== null) clock.clearTimeout(timer);
        timer = null;
        pending = null;
        remaining = null;
    }
    function later(ms: number, fn: () => void): void {
        clearTimer();
        const g = gen;
        pending = () => { if (g === gen && !destroyed) fn(); };
        if (!visibility.visible()) { remaining = ms; return; }
        due = clock.now() + ms;
        timer = clock.setTimeout(fire, ms);
    }

    function cancel(): void {
        const resetTheme = emergencyLive;
        emergencyLive = false;
        maydayDespiteOff = false;
        maydayArmed = false;
        welcomeDue = false;
        gen += 1;
        clearTimer();
        queue = [];
        awaiting = false;
        doneWhileHidden = false;
        if (resetTheme) screen.theme?.('normal');
        if (state === 'speaking' || state === 'dwell' || state === 'fading') screen.idle();
        state = 'off';
    }

    function gapMs(): number {
        const f = facts as SystemFacts;
        return suggestedGapSeconds(f, tv, f.day, load(f.hexKey, tv).eventIndex) * 1000;
    }

    function refreshPool(f: SystemFacts): void {
        const key = JSON.stringify([tv, f]);
        if (key === poolKey) return;
        poolKey = key;
        if (!corpus) corpus = lineSource();
        pool = corpusPool(corpus, f);
    }

    function speak(): void {
        const msg = queue.shift();
        if (!msg) return;
        turnNo += 1;
        state = 'speaking';
        awaiting = true;
        screen.transmit(msg);
    }

    function afterTurn(): void {
        awaiting = false;
        const f = facts as SystemFacts;
        if (queue.length) {
            state = 'dwell';
            const r = seeded(`${f.hexKey}|${tv}|${load(f.hexKey, tv).eventIndex}|dwell|${turnNo}`);
            later(between(r, TIMING.dwellMinMs, TIMING.dwellMaxMs), speak);
            return;
        }
        state = 'fading';
        later(TIMING.keepLastMs, () => {
            screen.idle({ keepLast: true });
            later(TIMING.clearMs, () => {
                if (emergencyLive) {
                    emergencyLive = false;
                    screen.theme?.('normal');
                }
                const stop = !chatterOn;
                maydayDespiteOff = false;
                screen.idle();
                if (stop) {
                    state = 'off';
                    ctxKey = '';
                    return;
                }
                state = 'dead-air';
                later(gapMs(), next);
            });
        });
    }

    function play(ev: RadioEvent): void {
        const f = facts as SystemFacts;
        const h = load(f.hexKey, tv);
        h.eventIndex += 1;
        if (ev.id.startsWith('proc:') || ev.id.startsWith('line:')) {
            h.recent.push(ev.id);
            while (h.recent.length > TIMING.recentMax) h.recent.shift();
        }
        save(f.hexKey, tv, h);
        if (ev.uninterruptible && ev.recordOnce !== false) write(beowulfStorageKey(campaign), '1');
        if (ev.theme === 'emergency') {
            emergencyLive = true;
            screen.theme?.('emergency');
        }
        queue = messagesFor(ev);
        turnNo = 0;
        speak();
    }

    function next(): void {
        const f = facts as SystemFacts;
        let ev: RadioEvent | null = null;
        if (welcomeDue) {
            welcomeDue = false;
            ev = welcomeFor(f, tv);
        }
        if (!ev && !beowulfChecked) {
            beowulfChecked = true;
            const alreadyPlayed = read(beowulfStorageKey(campaign)) === '1';
            if (shouldQueueBeowulf({ campaignKey: campaign, hexKey: f.hexKey, starport: f.starport, alreadyPlayed })) ev = beowulfEvent();
        }
        if (!ev) {
            const h = load(f.hexKey, tv);
            const ctx = { truthVersion: tv, day: f.day, eventIndex: h.eventIndex, avoidIds: h.recent };
            ev = mixEvent(f, ctx, pool);
            if (!ev && h.recent.length) {
                // Starvation: forget the oldest half rather than fall silent forever.
                h.recent = h.recent.slice(Math.ceil(h.recent.length / 2));
                save(f.hexKey, tv, h);
                ev = mixEvent(f, { ...ctx, avoidIds: h.recent }, pool);
            }
            if (!ev) {
                h.eventIndex += 1;
                save(f.hexKey, tv, h);
                state = 'dead-air';
                later(gapMs(), next);
                return;
            }
        }
        play(ev);
    }

    function start(beacon: boolean): void {
        state = 'dead-air';
        beowulfChecked = false;
        const f = facts as SystemFacts;
        if (requestMayday && !maydayUsed) {
            beowulfChecked = true;
            if (!chatterOn) maydayDespiteOff = true;
            maydayArmed = true;
            if (maydayDue === null) maydayDue = clock.now() + TIMING.maydayDelayMs;
            later(Math.max(0, maydayDue - clock.now()), () => {
                maydayArmed = false;
                maydayUsed = true;
                play(beowulfEvent({ recordOnce: false }));
            });
            return;
        }
        const welcome = beacon ? welcomeFor(f, tv) : null;
        if (welcome) later(TIMING.beaconDelayMs, () => play(welcome));
        else later(Math.round(gapMs() * TIMING.firstGapShare), next);
    }

    screen.onTranscriptComplete(() => {
        if (destroyed || !awaiting) return;
        if (!visibility.visible()) { doneWhileHidden = true; return; }
        afterTurn();
    });

    const unsubscribe = visibility.onChange(() => {
        if (destroyed) return;
        if (!visibility.visible()) {
            if (timer !== null) {
                remaining = Math.max(0, due - clock.now());
                clock.clearTimeout(timer);
                timer = null;
            }
            return;
        }
        if (doneWhileHidden) { doneWhileHidden = false; afterTurn(); return; }
        if (pending && remaining !== null) {
            const ms = remaining;
            remaining = null;
            due = clock.now() + ms;
            timer = clock.setTimeout(fire, ms);
        }
    });

    return {
        update(input: CommsInput): void {
            if (destroyed) return;
            chatterOn = !!input.shown;
            requestMayday = !!input.mayday;
            const f = input.facts;
            let arrived = false;
            if (f) {
                const h = load(f.hexKey, input.truthVersion);
                arrived = !hears(h.lastParty) && partyHears(f);
                if (h.lastParty !== f.party) { h.lastParty = f.party; save(f.hexKey, input.truthVersion, h); }
            }
            const forced = maydayDespiteOff || (!!input.mayday && !maydayUsed);
            const active = !!f && (input.shown || forced);
            if (!f || !active) {
                if (state !== 'off') cancel();
                ctxKey = '';
                return;
            }
            const key = `${input.campaignKey}|${f.hexKey}|${input.truthVersion}`;
            if (key !== ctxKey || state === 'off') {
                cancel();
                ctxKey = key;
                facts = f;
                tv = input.truthVersion;
                campaign = input.campaignKey;
                poolKey = '';
                refreshPool(f);
                start(arrived);
                return;
            }
            facts = f;
            refreshPool(f);
            if (arrived && welcomeFor(f, tv)) {
                welcomeDue = true;
                if (state === 'dead-air' && !maydayArmed) later(TIMING.beaconDelayMs, next);
            }
        },
        state: () => state,
        destroy(): void {
            if (destroyed) return;
            cancel();
            destroyed = true;
            unsubscribe();
        },
    };
}
