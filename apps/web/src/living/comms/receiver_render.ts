/**
 * The System Comms receiver (CC1). Bars only. One transmission at a time.
 * The scheduler decides what plays. This module reveals words, draws the trace,
 * and drives the SIG meter from the same envelope. No demo loop, no skip control,
 * and no waveform switch.
 */
import { cancelFrame, createElement, every, later as delay, nextFrame, now, pageVisible, prefersReducedMotion } from '../../platform/browser.ts';

export type CommsMessage = {
    ch?: string;
    type?: string;
    from?: string;
    text?: string;
    status?: string;
    band?: string;
};

export type CommsTheme = 'normal' | 'emergency';

export type CommsReceiver = {
    transmit(msg: CommsMessage): void;
    idle(opts?: { keepLast?: boolean }): void;
    theme(mode: CommsTheme): void;
    destroy(): void;
};

export type CommsOptions = {
    onTranscriptComplete?: () => void;
};

const live = new WeakMap<HTMLElement, CommsReceiver>();

let gradientSerial = 0;

/** Gradient ids that stay unique when more than one receiver is on the page. */
export function commsGradientIds(): { spectrum: string; glow: string } {
    gradientSerial += 1;
    return { spectrum: `trx-spectrum-${gradientSerial}`, glow: `trx-glow-${gradientSerial}` };
}

function clamp(x: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, x));
}

function gauss(x: number, m: number, s: number): number {
    return Math.exp(-0.5 * ((x - m) / s) ** 2);
}

function smoothstep(a: number, b: number, v: number): number {
    const x = clamp((v - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
}

function hashText(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
}

function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Letters and numbers only, so a clearance and an accented name count the same way. */
export function wordLetters(token: string): string {
    return token.replace(/[^\p{L}\p{N}]/gu, '');
}

/** Spoken length of one word, in milliseconds. Held between 160 and 415. */
export function wordDuration(token: string, roll: number): number {
    return clamp(135 + wordLetters(token).length * 13 + (roll - 0.5) * 54, 160, 415);
}

type Peak = { center: number; width: number; gain: number };
type ActiveWord = { start: number; duration: number; peaks: Peak[]; seed: number };

export function mountCommsReceiver(root: HTMLElement, options: CommsOptions = {}): CommsReceiver {
    const channel = root.querySelector('[data-trx-channel]');
    const kind = root.querySelector('[data-trx-kind]');
    const source = root.querySelector('[data-trx-source]');
    const speaker = root.querySelector('[data-trx-speaker]');
    const words = root.querySelector('[data-trx-words]');
    const copy = root.querySelector('[data-trx-copy]') as HTMLElement | null;
    const accessible = root.querySelector('[data-trx-a11y]');
    const status = root.querySelector('[data-trx-status]');
    const band = root.querySelector('[data-trx-band]');
    const clock = root.querySelector('[data-trx-clock]');
    const trace = root.querySelector('[data-trx-trace]') as SVGPathElement | null;
    const ghost = root.querySelector('[data-trx-ghost]') as SVGPathElement | null;
    const playhead = root.querySelector('[data-trx-playhead]') as SVGLineElement | null;
    const halo = root.querySelector('[data-trx-headhalo]') as SVGRectElement | null;
    const ticks = root.querySelector('[data-trx-ticks]');
    const meter = root.querySelector('[data-trx-sig]') as HTMLElement | null;
    const bars: HTMLElement[] = meter ? Array.from(meter.querySelectorAll('i')) : [];

    let dead = false;
    let envelope = 0;
    let speechActive = false;
    let activeWord: ActiveWord | null = null;
    let utteranceCount = 0;
    const signalSeed = hashText('local-comms-noise');
    let scanX = 100;
    let scanVelocity = 17;
    let lastFrame = 0;
    let lastPaint = 0;
    let anim = 0;
    let playbackId = 0;
    const wordTimers: ReturnType<typeof setTimeout>[] = [];
    const endTimers: ReturnType<typeof setTimeout>[] = [];
    const labelTimers = new Map<Element, ReturnType<typeof setTimeout>>();
    const reduced = prefersReducedMotion();
    const clockStart = now();
    root.dataset.waveform = 'bars';

    if (ticks) {
        const bits: string[] = [];
        for (let x = 0; x <= 700; x += 7) {
            const prominent = x % 35 === 0;
            bits.push(`M${x} ${prominent ? 6 : 13}V${prominent ? 37 : 30}`);
        }
        ticks.setAttribute('d', bits.join(' '));
    }

    function noise2(x: number, y: number): number {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const fx = x - xi;
        const fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const hash = (a: number, b: number) => {
            let h = Math.imul(a ^ signalSeed, 0x85ebca6b) ^ Math.imul(b + 0x9e3779b9, 0xc2b2ae35);
            h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
            h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        };
        const a = hash(xi, yi) * (1 - sx) + hash(xi + 1, yi) * sx;
        const b = hash(xi, yi + 1) * (1 - sx) + hash(xi + 1, yi + 1) * sx;
        return a * (1 - sy) + b * sy;
    }

    function field(x: number, time: number): number {
        const t = time * 0.001;
        return 0.51 * noise2(x * 0.013 + 13.8, t * 0.79)
            + 0.31 * noise2(x * 0.039 - 6.4, t * 1.47)
            + 0.18 * noise2(x * 0.124 + 24.2, t * 2.53);
    }

    function speechLevel(time: number): number {
        const word = activeWord;
        if (!speechActive || !word) return 0;
        const u = (time - word.start) / word.duration;
        if (u < 0 || u >= 1) return 0;
        let power = 0;
        for (const peak of word.peaks) power += peak.gain * gauss(u, peak.center, peak.width);
        const edge = smoothstep(0, 0.065, u) * (1 - smoothstep(0.84, 1, u));
        const fine = 0.91 + 0.06 * Math.sin(time * 0.038 + word.seed) + 0.04 * Math.sin(time * 0.071 + word.seed * 0.37);
        return clamp(power * edge * fine, 0, 1);
    }

    /** The SIG bars follow the envelope: dark at zero, uneven while a word is on the air. */
    function paintMeter(time: number, energy: number): void {
        if (!meter) return;
        const quiet = energy < 0.004;
        meter.dataset.signal = quiet ? '0' : energy.toFixed(4);
        for (let i = 0; i < bars.length; i += 1) {
            const wobble = quiet ? 0 : clamp(0.22 + 0.78 * noise2(2.4 + i * 1.63, time * 0.0027), 0, 1);
            const level = quiet ? 0 : clamp(energy * wobble, 0, 1);
            const bar = bars[i];
            bar.style.transform = `scaleY(${level.toFixed(3)})`;
            bar.style.opacity = level < 0.02 ? '0' : (0.28 + 0.72 * level).toFixed(3);
        }
    }

    function draw(time: number): void {
        const width = 700;
        const center = 21.5;
        const energy = reduced ? 0 : envelope;
        const strokes: string[] = [];
        for (let x = 2; x < width - 2; x += 4.6) {
            const broad = field(x, time);
            const moving = noise2(x * 0.078 + 42.2, time * 0.0019);
            const swell = Math.pow(clamp((broad - 0.22) / 0.55, 0, 1), 1.25);
            const texture = 0.65 + 0.35 * moving;
            const taper = 0.23 + 0.77 * smoothstep(0, 38, x) * (1 - smoothstep(662, 700, x));
            const floor = 0.26 + 0.23 * noise2(x * 0.044, time * 0.00043);
            const height = floor + energy * (1.5 + 18.8 * swell * texture) * taper;
            strokes.push(`M${x.toFixed(1)} ${(center - height).toFixed(2)}V${(center + height).toFixed(2)}`);
        }
        trace?.setAttribute('d', strokes.join(''));
        ghost?.setAttribute('d', '');
        if (trace) {
            trace.style.strokeWidth = '2.5';
            trace.style.opacity = '.93';
        }
        const edgeFade = smoothstep(0, 44, scanX) * (1 - smoothstep(656, 700, scanX));
        if (playhead) {
            playhead.setAttribute('x1', scanX.toFixed(2));
            playhead.setAttribute('x2', scanX.toFixed(2));
            playhead.style.strokeOpacity = (0.23 * edgeFade).toFixed(3);
        }
        if (halo) {
            halo.setAttribute('x', (scanX - 9).toFixed(2));
            halo.style.opacity = (0.09 * edgeFade).toFixed(3);
        }
        paintMeter(time, energy);
    }

    function frame(time: number): void {
        if (dead) return;
        if (reduced) {
            if (!lastPaint) {
                lastPaint = time;
                draw(0);
            }
        } else if (pageVisible()) {
            const dt = lastFrame ? clamp((time - lastFrame) / 1000, 0, 0.05) : 1 / 60;
            lastFrame = time;
            const target = speechLevel(time);
            const timeConstant = target > envelope ? 0.043 : 0.235;
            envelope += (target - envelope) * (1 - Math.exp(-dt / timeConstant));
            const desiredSpeed = 28;
            scanVelocity += (desiredSpeed - scanVelocity) * (1 - Math.exp(-dt / 0.75));
            scanX = (scanX + scanVelocity * dt) % 700;
            if (time - lastPaint >= 15) {
                lastPaint = time;
                draw(time);
            }
        } else {
            lastFrame = time;
        }
        anim = nextFrame(frame);
    }

    function tickClock(): void {
        if (dead || !clock) return;
        const total = Math.floor((now() - clockStart) / 1000);
        const hh = String(Math.floor(total / 3600)).padStart(2, '0');
        const mm = String(Math.floor(total / 60) % 60).padStart(2, '0');
        const ss = String(total % 60).padStart(2, '0');
        clock.textContent = `${hh}:${mm}:${ss}`;
    }

    function fadeLabel(node: Element | null, text: string): void {
        if (!node) return;
        const previous = labelTimers.get(node);
        if (previous) clearTimeout(previous);
        if (node.textContent === text) {
            (node as HTMLElement).style.opacity = '1';
            labelTimers.delete(node);
            return;
        }
        if (reduced) {
            node.textContent = text;
            (node as HTMLElement).style.opacity = '1';
            return;
        }
        (node as HTMLElement).style.opacity = '0';
        const timer = delay(() => {
            if (dead) return;
            node.textContent = text;
            nextFrame(() => { (node as HTMLElement).style.opacity = '1'; });
            labelTimers.delete(node);
        }, 245);
        labelTimers.set(node, timer);
    }

    function setMode(mode: string, labels: { status?: string; band?: string } = {}): void {
        root.dataset.mode = mode;
        fadeLabel(status, labels.status ?? (mode === 'receiving' ? 'RECEIVING' : 'MONITORING'));
        fadeLabel(band, labels.band ?? (mode === 'receiving' ? 'CARRIER LOCK' : 'OPEN BAND'));
    }

    function clearTimers(): void {
        wordTimers.forEach(clearTimeout);
        endTimers.forEach(clearTimeout);
        wordTimers.length = 0;
        endTimers.length = 0;
        playbackId += 1;
        speechActive = false;
        activeWord = null;
        root.dataset.speaking = 'false';
    }

    function later(fn: () => void, ms: number, group: 'word' | 'end' = 'word'): void {
        const timer = delay(fn, ms);
        (group === 'word' ? wordTimers : endTimers).push(timer);
    }

    function swapCopy(render: () => void, current: number): void {
        if (!copy) return;
        if (reduced) {
            render();
            copy.style.opacity = '1';
            return;
        }
        copy.style.opacity = '0';
        copy.style.transform = 'translateY(2px)';
        copy.style.filter = 'blur(1.2px)';
        later(() => {
            if (current !== playbackId) return;
            render();
            nextFrame(() => {
                if (current !== playbackId) return;
                copy.style.opacity = '1';
                copy.style.transform = 'translateY(0)';
                copy.style.filter = 'blur(0)';
            });
        }, 440, 'end');
    }

    function transmit(msg: CommsMessage): void {
        if (dead) return;
        clearTimers();
        const current = playbackId;
        setMode('receiving', { status: msg.status, band: msg.band });
        const from = String(msg.from ?? 'UNIDENTIFIED');
        const body = String(msg.text ?? '');
        if (!body.trim()) {
            idle();
            return;
        }
        const rand = seededRandom(hashText(`${from}|${body}`) ^ ((utteranceCount += 1) * 0x9e3779b9));
        fadeLabel(channel, String(msg.ch ?? 'CH --'));
        fadeLabel(kind, String(msg.type ?? 'LOCAL TRAFFIC'));
        fadeLabel(source, from);
        if (channel) (channel as HTMLElement).title = String(msg.ch ?? 'CH --');
        if (kind) (kind as HTMLElement).title = String(msg.type ?? 'LOCAL TRAFFIC');
        if (source) (source as HTMLElement).title = from;
        const done = () => {
            if (current !== playbackId || !accessible) return;
            accessible.textContent = `${from}: ${body}`;
            options.onTranscriptComplete?.();
        };
        swapCopy(() => {
            if (current !== playbackId || !speaker || !words || !accessible) return;
            speaker.textContent = from;
            accessible.textContent = '';
            words.replaceChildren();
            if (reduced) {
                words.textContent = body;
                done();
                return;
            }
            const caret = createElement('span');
            caret.className = 'trx-caret';
            caret.setAttribute('aria-hidden', 'true');
            words.append(caret);
            const tokens = body.trim().split(/\s+/).filter(Boolean);
            let idx = 0;
            const reveal = () => {
                if (current !== playbackId) return;
                if (idx >= tokens.length) {
                    speechActive = false;
                    activeWord = null;
                    root.dataset.speaking = 'false';
                    caret.remove();
                    done();
                    return;
                }
                const token = tokens[idx];
                idx += 1;
                const word = createElement('span');
                word.className = 'trx-word';
                word.textContent = token + (idx < tokens.length ? ' ' : '');
                words.insertBefore(word, caret);
                const letters = wordLetters(token);
                const vowels = (letters.match(/[aeiouy]+/gi) || []).length;
                const syllables = clamp(vowels || 1, 1, 4);
                const emphasis = letters.length >= 7 ? 1.08 : 1;
                const duration = wordDuration(token, rand());
                const peaks: Peak[] = [];
                for (let n = 0; n < syllables; n += 1) {
                    peaks.push({
                        center: clamp((n + 0.52 + (rand() - 0.5) * 0.30) / syllables, 0.13, 0.86),
                        width: clamp(0.24 / syllables + (rand() - 0.5) * 0.09, 0.085, 0.27),
                        gain: emphasis * (0.62 + rand() * 0.55),
                    });
                }
                activeWord = { start: now(), duration, peaks, seed: rand() * 12 };
                speechActive = true;
                root.dataset.speaking = 'true';
                const pause = /\.{3,}[\u201d"']?$/.test(token) ? 720 + rand() * 320
                    : /[.!?][\u201d"']?$/.test(token) ? 400 + rand() * 220
                        : /[,;:][\u201d"']?$/.test(token) ? 165 + rand() * 165
                            : 25 + rand() * 65;
                const delay = idx === tokens.length ? Math.max(255, duration) : duration + pause;
                later(reveal, delay);
            };
            later(reveal, 200);
        }, current);
    }

    function idle(opts: { keepLast?: boolean } = {}): void {
        if (dead) return;
        const keepLast = !!opts.keepLast;
        clearTimers();
        setMode('idle');
        if (!keepLast) {
            const current = playbackId;
            fadeLabel(source, '—');
            swapCopy(() => {
                if (current !== playbackId || !speaker || !words || !accessible) return;
                speaker.textContent = 'OPEN BAND';
                accessible.textContent = '';
                words.replaceChildren();
                const label = createElement('span');
                label.className = 'trx-idle-label';
                label.textContent = 'Awaiting transmission';
                words.append(label);
            }, current);
        }
    }

    const stopClock = every(tickClock, 1000);

    function destroy(): void {
        dead = true;
        clearTimers();
        labelTimers.forEach(clearTimeout);
        labelTimers.clear();
        stopClock();
        cancelFrame(anim);
        live.delete(root);
    }

    function theme(mode: CommsTheme): void {
        root.dataset.commsTheme = mode === 'emergency' ? 'emergency' : 'normal';
    }

    setMode('idle');
    frame(now());
    const api: CommsReceiver = { transmit, idle, theme, destroy };
    live.set(root, api);
    return api;
}
