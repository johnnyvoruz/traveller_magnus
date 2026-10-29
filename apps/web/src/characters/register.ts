/**
 * The credit register in the browser (streams/D.md DT1c; directives/contracts/b_player_credits.md):
 * one reactive register per character, read from `GET /api/characters/:id/ledger`, changed through
 * the four posts, and kept live by the room's `ledger` frame. The rules of the register are Lane A's
 * `ledger.ts`; what a screen shows and sends is `workspace/credit_register.ts`. This file moves
 * bytes and keeps the state. No payment, fare or share value is computed here.
 */
import { reactive } from 'vue';
import { amountTyped, dayWithin, type CharacterRegister, type RegisterDraft, type RegisterStatus } from '../workspace/credit_register.ts';
import { CREDIT_KINDS, cashAdjustment, creditBalance, type CreditKind, type CreditLine, type CreditMode } from './ledger.ts';
import { request } from './transport.ts';

export type { CharacterRegister, RegisterDraft, RegisterStatus };

export type RegisterState = {
    id: string;
    status: RegisterStatus;
    lines: CreditLine[];
    balance: number;
    credits: CreditMode;
    notice: string;
    busy: boolean;
};

export const UNAVAILABLE = 'The credit register is not available yet.';

const states = new Map<string, RegisterState>();
const handles = new Map<string, CharacterRegister>();

function isKind(kind: unknown): kind is CreditKind {
    return typeof kind === 'string' && (CREDIT_KINDS as readonly string[]).includes(kind);
}

/** One row as the server sends it. Anything else is not a line. */
export function parseCreditLine(value: unknown): CreditLine | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id) return null;
    if (typeof row.seq !== 'number' || !Number.isFinite(row.seq)) return null;
    if (typeof row.memo !== 'string') return null;
    if (typeof row.amount !== 'number' || !Number.isFinite(row.amount)) return null;
    if (!isKind(row.kind)) return null;
    const pending = row.pending === 1 || row.pending === true ? 1 : 0;
    return {
        id: row.id,
        seq: row.seq,
        whenDay: typeof row.whenDay === 'number' && Number.isFinite(row.whenDay) ? row.whenDay : null,
        whenReal: typeof row.whenReal === 'string' ? row.whenReal : '',
        memo: row.memo,
        amount: row.amount,
        kind: row.kind,
        byUser: typeof row.byUser === 'string' ? row.byUser : '',
        linkId: typeof row.linkId === 'string' ? row.linkId : null,
        voidOf: typeof row.voidOf === 'string' ? row.voidOf : null,
        pending,
    };
}

function parseMode(value: unknown): CreditMode | null {
    return value === 'simple' || value === 'detailed' ? value : null;
}

function stateFor(id: string): RegisterState {
    let state = states.get(id);
    if (!state) {
        state = reactive<RegisterState>({ id, status: 'idle', lines: [], balance: 0, credits: 'simple', notice: '', busy: false });
        states.set(id, state);
    }
    return state;
}

/** A line lands: by id when it is known (an accept), else appended; the list stays in seq order. */
function mergeLine(state: RegisterState, line: CreditLine, balance?: number): void {
    const at = state.lines.findIndex((row) => row.id === line.id);
    const next = at >= 0 ? state.lines.map((row, i) => (i === at ? line : row)) : state.lines.concat(line);
    next.sort((a, b) => a.seq - b.seq);
    state.lines = next;
    state.balance = typeof balance === 'number' && Number.isFinite(balance) ? balance : creditBalance(next);
}

function path(id: string, more = ''): string {
    return '/api/characters/' + encodeURIComponent(id) + '/ledger' + more;
}

async function load(state: RegisterState): Promise<void> {
    if (state.status === 'loading') return;
    state.status = 'loading';
    const res = await request(path(state.id));
    if (res.status === 503) {
        state.status = 'unavailable';
        return;
    }
    if (res.status === 404 || res.status === 401) {
        state.status = 'denied';
        return;
    }
    if (!res.ok || !res.data || typeof res.data !== 'object') {
        state.status = 'error';
        state.notice = res.message || 'The register could not be read.';
        return;
    }
    const body = res.data as Record<string, unknown>;
    const lines: CreditLine[] = [];
    if (Array.isArray(body.lines)) {
        for (const row of body.lines) {
            const line = parseCreditLine(row);
            if (line) lines.push(line);
        }
    }
    lines.sort((a, b) => a.seq - b.seq);
    state.lines = lines;
    state.balance = typeof body.balance === 'number' && Number.isFinite(body.balance) ? body.balance : creditBalance(lines);
    state.credits = parseMode(body.credits) ?? 'simple';
    state.notice = '';
    state.status = 'ready';
}

/** One post. A refusal goes into `notice`; 503 marks the register unavailable. */
async function send(state: RegisterState, more: string, body: unknown): Promise<unknown | null> {
    if (state.busy) return null;
    state.busy = true;
    state.notice = '';
    try {
        const res = await request(path(state.id, more), { method: 'POST', body: JSON.stringify(body) });
        if (res.status === 503) {
            state.status = 'unavailable';
            state.notice = UNAVAILABLE;
            return null;
        }
        if (!res.ok) {
            state.notice = res.message || 'The server could not do that.';
            return null;
        }
        return res.data;
    } finally {
        state.busy = false;
    }
}

async function post(state: RegisterState, draft: RegisterDraft): Promise<CreditLine | null> {
    const body: Record<string, unknown> = { kind: draft.kind, amount: draft.amount, memo: draft.memo };
    if (draft.whenDay !== null) body.whenDay = draft.whenDay;
    const data = await send(state, '', body);
    const line = parseCreditLine(data);
    if (!line) return null;
    mergeLine(state, line);
    if (state.status !== 'ready') state.status = 'ready';
    return line;
}

async function voidLine(state: RegisterState, lineId: string): Promise<boolean> {
    const data = await send(state, '/' + encodeURIComponent(lineId) + '/void', {});
    const line = parseCreditLine(data);
    if (!line) return false;
    mergeLine(state, line);
    return true;
}

async function acceptLine(state: RegisterState, lineId: string): Promise<boolean> {
    const data = await send(state, '/' + encodeURIComponent(lineId) + '/accept', {});
    const line = parseCreditLine(data);
    if (!line) return false;
    mergeLine(state, line);
    return true;
}

async function setMode(state: RegisterState, credits: CreditMode): Promise<boolean> {
    const data = await send(state, '/mode', { credits });
    const mode = data && typeof data === 'object' ? parseMode((data as Record<string, unknown>).credits) : null;
    if (!mode) return false;
    state.credits = mode;
    return true;
}

/** The Cash on Hand box, typed: "12,400", "Cr12,400". The adjustment is Lane A's `cashAdjustment`. */
async function setCash(state: RegisterState, text: string, whenDay: number | null): Promise<boolean> {
    const cash = amountTyped(text, true);
    if (cash === null) return false;
    const made = cashAdjustment(state.lines, cash, { id: '', byUser: '', whenReal: '' }, dayWithin(whenDay));
    if (!made.ok) {
        state.notice = made.message;
        return false;
    }
    if (!made.line) return true;
    const line = await post(state, { kind: made.line.kind, amount: made.line.amount, memo: made.line.memo, whenDay: made.line.whenDay });
    return line !== null;
}

function makeHandle(state: RegisterState): CharacterRegister {
    return {
        get id() { return state.id; },
        get status() { return state.status; },
        get lines() { return state.lines; },
        get balance() { return state.balance; },
        get credits() { return state.credits; },
        get notice() { return state.notice; },
        get busy() { return state.busy; },
        load: () => load(state),
        post: (draft) => post(state, draft),
        voidLine: (lineId) => voidLine(state, lineId),
        acceptLine: (lineId) => acceptLine(state, lineId),
        setMode: (credits) => setMode(state, credits),
        setCash: (text, whenDay) => setCash(state, text, whenDay),
    };
}

/** The register for a character. The same handle comes back for the same id; the first ask reads it. */
export function openRegister(id: string): CharacterRegister {
    const held = handles.get(id);
    if (held) return held;
    const state = stateFor(id);
    const handle = makeHandle(state);
    handles.set(id, handle);
    if (state.status === 'idle') void load(state);
    return handle;
}

/**
 * The room's `ledger` frame: `{ t: 'ledger', line, balance }` on a line stored, voided or accepted,
 * to every socket (contract, Live room). A register not read yet reads itself.
 */
export function noteLedgerFrame(id: string, frame: unknown): void {
    if (!frame || typeof frame !== 'object') return;
    const body = frame as Record<string, unknown>;
    if (body.t !== 'ledger') return;
    const line = parseCreditLine(body.line);
    if (!line) return;
    const state = stateFor(id);
    if (state.status === 'ready') {
        mergeLine(state, line, typeof body.balance === 'number' ? body.balance : undefined);
        return;
    }
    if (state.status !== 'loading') void load(state);
}

/** Tests and sign-out. */
export function resetRegisters(): void {
    states.clear();
    handles.clear();
}
