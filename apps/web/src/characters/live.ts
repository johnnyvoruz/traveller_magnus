/**
 * The live sheet: a socket to /api/characters/:id/live, and the REST fallback when
 * the socket is blocked or two upgrades fail. A set shows at once and is sent with
 * a client id. Another person's set waits while this client still has an unsent set
 * for that box, then the later one stands. A refusal puts the box back and says why.
 * Reconnect waits, with jitter, and sends the unsent sets again in order. A page
 * that was hidden for a while reconnects when it is shown.
 */
import type { CharacterDoc, CharacterState, FieldValue } from './types.ts';
import { characterBoxLimit, parseCharacter, parseDoc, parseRole, parseServerMessage } from './types.ts';
import { request, transport, type LiveSocket } from './transport.ts';

/** How long a hidden page stays quiet before the next showing opens a fresh socket. */
export const HIDDEN_RECONNECT_MS = 30000;
/** How often a sheet with no socket reloads while it is visible. */
export const POLL_MS = 4000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;
const UPGRADES_BEFORE_POLL = 2;

type Pending = { id: string; field: string; value: FieldValue; at: number };

export type LiveController = {
    start(): void;
    stop(): void;
    /** The sheet was deleted, or this person's access ended, from our own call. */
    localGone(why: string): void;
    setField(name: string, value: FieldValue): void;
    focusField(name: string | null): void;
};

function backoff(attempt: number, rand: number): number {
    const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
    const unit = Number.isFinite(rand) ? Math.min(1, Math.max(0, rand)) : 0;
    return Math.round(ceiling * (0.75 + 0.25 * unit));
}

function liveUrl(id: string): string {
    const path = '/api/characters/' + encodeURIComponent(id) + '/live';
    if (typeof location === 'undefined' || !location.host) return path;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + path;
}

/**
 * One room's connection. `state` is the reactive sheet. `onMeta` updates the list
 * when a rename arrives.
 */
export function attachLive(state: CharacterState, onMeta: (name: string, summary: string) => void): LiveController {
    let mode: 'socket' | 'poll' = 'socket';
    let stopped = false;
    let terminal = false;
    let saidHello = false;
    let failures = 0;
    let attempt = 0;
    let clock = 0;
    let nextNum = 0;
    let posting = false;
    let focus: string | null = null;
    let focusSent = false;
    let hiddenAt: number | null = null;
    let socket: LiveSocket | null = null;
    /** Bumped whenever a socket is retired, so a late close is not a second failure. */
    let token = 0;
    let retryCancel: (() => void) | null = null;
    let pollCancel: (() => void) | null = null;
    let visCancel: (() => void) | null = null;
    const unsent: Pending[] = [];
    let serverFields: Record<string, FieldValue> = {};
    const serverAt: Record<string, number> = {};
    let seq = 0;
    let haveDoc = false;

    function recompute(): void {
        const next: Record<string, FieldValue> = { ...serverFields };
        for (const item of unsent) {
            if (item.value === '' || item.value === false) delete next[item.field];
            else next[item.field] = item.value;
        }
        for (const key of Object.keys(state.fields)) {
            if (!(key in next)) delete state.fields[key];
        }
        for (const [key, value] of Object.entries(next)) state.fields[key] = value;
    }

    function writeServer(field: string, value: FieldValue, at: number): void {
        serverAt[field] = at;
        if (value === '' || value === false) delete serverFields[field];
        else serverFields[field] = value;
    }

    function pendingFields(): Set<string> {
        return new Set(unsent.map((item) => item.field));
    }

    /**
     * Hello, or a GET with a newer seq. The same seq does not write again: a box set
     * by someone else in between would be wiped. A box with an unsent set of mine
     * keeps the server value it already had.
     */
    function applyDoc(doc: CharacterDoc, force = false): void {
        if (haveDoc && doc.seq < seq) return;
        if (haveDoc && !force && doc.seq <= seq) return;
        haveDoc = true;
        seq = doc.seq;
        const pending = pendingFields();
        const next: Record<string, FieldValue> = {};
        for (const [key, value] of Object.entries(doc.fields)) {
            if (pending.has(key) || value === '' || value === false) continue;
            next[key] = value;
        }
        for (const key of pending) {
            if (key in serverFields) next[key] = serverFields[key];
        }
        serverFields = next;
        for (const key of Object.keys(serverAt)) {
            if (!pending.has(key)) delete serverAt[key];
        }
        recompute();
    }

    function cancelRetry(): void {
        if (retryCancel) {
            retryCancel();
            retryCancel = null;
        }
    }

    function cancelPoll(): void {
        if (pollCancel) {
            pollCancel();
            pollCancel = null;
        }
    }

    function send(message: unknown): void {
        if (!socket) return;
        try {
            socket.send(JSON.stringify(message));
        } catch {
            // The close handler reconnects.
        }
    }

    function flushSocket(): void {
        if (!saidHello || mode !== 'socket') return;
        for (const item of unsent) {
            send({ t: 'set', id: item.id, field: item.field, value: item.value });
        }
        if (focusSent) send({ t: 'focus', field: focus });
    }

    function scheduleRetry(): void {
        if (stopped || terminal || mode !== 'socket') return;
        cancelRetry();
        const delay = backoff(attempt, transport.random());
        attempt += 1;
        state.status = 'connecting';
        retryCancel = transport.schedule(() => {
            retryCancel = null;
            beginSocket();
        }, delay);
    }

    /** Drops the open socket. Its close no longer counts as a failure or a drop. */
    function silence(): void {
        token += 1;
        const old = socket;
        socket = null;
        if (!old) return;
        try {
            old.close();
        } catch {
            // Already closed.
        }
    }

    function beginSocket(): void {
        if (stopped || terminal || mode !== 'socket') return;
        silence();
        const mine = token;
        saidHello = false;
        state.status = 'connecting';
        let opened: LiveSocket;
        try {
            opened = transport.openSocket(liveUrl(state.id), {
                onOpen: () => { /* hello is the moment the sheet is live */ },
                onMessage: (data) => { if (token === mine) onMessage(data); },
                onClose: () => { if (token === mine) onClose(mine); },
                onError: () => { if (token === mine) onError(mine); },
            });
        } catch {
            if (token !== mine) return;
            failures = UPGRADES_BEFORE_POLL;
            startPoll();
            return;
        }
        if (token !== mine) {
            try {
                opened.close();
            } catch {
                // Already closed.
            }
            return;
        }
        socket = opened;
    }

    function onError(mine: number): void {
        if (token !== mine || stopped || terminal || mode !== 'socket') return;
        // A live socket's error is followed by close, and that close reconnects.
        if (saidHello) return;
        silence();
        failures += 1;
        if (failures >= UPGRADES_BEFORE_POLL) startPoll();
        else scheduleRetry();
    }

    function onClose(mine: number): void {
        if (token !== mine || stopped || terminal || mode !== 'socket') return;
        const live = saidHello;
        silence();
        if (live) {
            saidHello = false;
            scheduleRetry();
            return;
        }
        failures += 1;
        if (failures >= UPGRADES_BEFORE_POLL) startPoll();
        else scheduleRetry();
    }

    /** A poll that reached the server tries the socket again. Two failures come back here. */
    function resumeLive(): void {
        if (mode !== 'poll' || stopped || terminal) return;
        mode = 'socket';
        failures = 0;
        attempt = 0;
        saidHello = false;
        cancelPoll();
        state.status = 'connecting';
        beginSocket();
    }

    function startPoll(): void {
        if (mode === 'poll' || stopped || terminal) return;
        mode = 'poll';
        saidHello = false;
        state.status = 'offline';
        cancelRetry();
        silence();
        armPoll();
        void flushPost().then((ok) => { if (ok) resumeLive(); });
    }

    function armPoll(): void {
        if (stopped || terminal || mode !== 'poll') return;
        cancelPoll();
        pollCancel = transport.schedule(() => {
            pollCancel = null;
            void cycle();
        }, POLL_MS);
    }

    async function cycle(): Promise<void> {
        if (stopped || terminal || mode !== 'poll') return;
        cancelPoll();
        if (transport.pageHidden()) {
            armPoll();
            return;
        }
        const ok = unsent.length > 0 ? await flushPost() : await refresh();
        if (stopped || terminal) return;
        if (ok) resumeLive();
        else armPoll();
    }

    async function flushPost(): Promise<boolean> {
        if (posting || mode !== 'poll' || stopped || terminal || unsent.length === 0) return false;
        posting = true;
        const batch = unsent.slice();
        let ok = false;
        try {
            const res = await request('/api/characters/' + encodeURIComponent(state.id) + '/fields', {
                method: 'POST',
                body: JSON.stringify({ sets: batch.map((item) => ({ field: item.field, value: item.value })) }),
            });
            if (stopped || terminal) return false;
            if (res.status === 401) {
                silentOut();
                return false;
            }
            if (!res.ok) return false;
            ok = await refresh();
            for (const item of batch) {
                const at = unsent.findIndex((row) => row.id === item.id);
                if (at < 0) continue;
                unsent.splice(at, 1);
                if ((serverAt[item.field] ?? 0) <= item.at) writeServer(item.field, item.value, item.at);
            }
            recompute();
            return ok;
        } finally {
            posting = false;
        }
    }

    async function refresh(): Promise<boolean> {
        const res = await request('/api/characters/' + encodeURIComponent(state.id));
        if (stopped || terminal) return false;
        if (res.status === 401) {
            silentOut();
            return false;
        }
        if (res.status === 404) {
            finishGone('This character is not available.');
            return false;
        }
        if (!res.ok || !res.data || typeof res.data !== 'object') return false;
        const body = res.data as Record<string, unknown>;
        const role = parseRole(body.role);
        if (role) state.role = role;
        const character = parseCharacter(body.character);
        if (character) state.character = character;
        const doc = parseDoc(body.doc);
        if (doc) applyDoc(doc);
        else recompute();
        return true;
    }

    function silentOut(): void {
        terminal = true;
        state.status = 'offline';
        state.notice = '';
        state.who = [];
        cancelRetry();
        cancelPoll();
        silence();
    }

    function finishGone(why: string): void {
        if (terminal) return;
        terminal = true;
        state.status = 'gone';
        state.notice = why;
        state.who = [];
        cancelRetry();
        cancelPoll();
        silence();
    }

    function onMessage(data: string): void {
        if (stopped || terminal) return;
        let body: unknown;
        try {
            body = JSON.parse(data) as unknown;
        } catch {
            return;
        }
        const message = parseServerMessage(body);
        if (!message) return;
        if (message.t === 'hello') {
            state.you = message.you;
            if (message.you.role) state.role = message.you.role;
            saidHello = true;
            failures = 0;
            attempt = 0;
            state.status = 'live';
            state.who = message.who.filter((person) => person.id !== message.you.id);
            applyDoc(message.doc, true);
            flushSocket();
            void refresh();
        } else if (message.t === 'set') {
            if (message.seq > seq) seq = message.seq;
            writeServer(message.field, message.value, ++clock);
            recompute();
        } else if (message.t === 'ack') {
            const at = unsent.findIndex((item) => item.id === message.id);
            if (at < 0) return;
            const item = unsent[at];
            unsent.splice(at, 1);
            if ((serverAt[item.field] ?? 0) <= item.at) writeServer(item.field, item.value, item.at);
            recompute();
        } else if (message.t === 'no') {
            const at = unsent.findIndex((item) => item.id === message.id);
            if (at >= 0) unsent.splice(at, 1);
            state.notice = message.why;
            recompute();
        } else if (message.t === 'who') {
            const mine = state.you?.id;
            state.who = message.who.filter((person) => person.id !== mine);
        } else if (message.t === 'meta') {
            if (state.character) state.character = { ...state.character, name: message.name, summary: message.summary };
            onMeta(message.name, message.summary);
        } else {
            finishGone(message.why);
        }
    }

    function onVisibility(hidden: boolean): void {
        if (hidden) {
            hiddenAt = transport.now();
            return;
        }
        const away = hiddenAt === null ? 0 : transport.now() - hiddenAt;
        hiddenAt = null;
        if (stopped || terminal) return;
        if (mode === 'poll') {
            void cycle();
            return;
        }
        if (away >= HIDDEN_RECONNECT_MS) {
            cancelRetry();
            saidHello = false;
            state.status = 'connecting';
            beginSocket();
        }
    }

    function setField(name: string, value: FieldValue): void {
        if (stopped || terminal) return;
        if (typeof value !== 'string' && typeof value !== 'boolean') return;
        if (typeof value === 'string' && value.length > characterBoxLimit(name)) {
            state.notice = 'That box is too long.';
            return;
        }
        nextNum += 1;
        unsent.push({ id: 'c' + String(nextNum), field: name, value, at: ++clock });
        state.notice = '';
        recompute();
        if (mode === 'poll') void flushPost().then((ok) => { if (ok) resumeLive(); });
        else if (saidHello) {
            const item = unsent[unsent.length - 1];
            send({ t: 'set', id: item.id, field: item.field, value: item.value });
        }
    }

    function focusField(name: string | null): void {
        if (stopped || terminal) return;
        focus = name;
        focusSent = true;
        if (mode === 'socket' && saidHello) send({ t: 'focus', field: name });
    }

    return {
        start() {
            if (visCancel) return;
            visCancel = transport.onVisibility(onVisibility);
            if (transport.pageHidden()) hiddenAt = transport.now();
            void refresh();
            beginSocket();
        },
        stop() {
            stopped = true;
            cancelRetry();
            cancelPoll();
            if (visCancel) {
                visCancel();
                visCancel = null;
            }
            silence();
        },
        localGone(why: string) {
            finishGone(why);
        },
        setField,
        focusField,
    };
}
