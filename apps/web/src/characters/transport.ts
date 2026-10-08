/**
 * The character store's door to the network. Tests replace every field.
 * The campaign store does the same with fetch and schedule.
 */
import { apiFetch } from '../platform/http.ts';

export type FetchLike = typeof fetch;
export type Schedule = (fn: () => void, ms: number) => () => void;

export type SocketHandlers = {
    onOpen: () => void;
    onMessage: (data: string) => void;
    onClose: () => void;
    onError: () => void;
};

export type LiveSocket = {
    send(data: string): void;
    close(): void;
};

function defaultSchedule(fn: () => void, ms: number): () => void {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
}

function defaultHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Hidden and shown. A focused window counts as shown, so a polled sheet reloads then. */
function defaultOnVisibility(fn: (hidden: boolean) => void): () => void {
    if (typeof document === 'undefined') return () => {};
    const onVis = () => fn(document.visibilityState === 'hidden');
    const onFocus = () => {
        if (document.visibilityState !== 'hidden') fn(false);
    };
    document.addEventListener('visibilitychange', onVis);
    if (typeof addEventListener === 'function') addEventListener('focus', onFocus);
    return () => {
        document.removeEventListener('visibilitychange', onVis);
        if (typeof removeEventListener === 'function') removeEventListener('focus', onFocus);
    };
}

function defaultOpenSocket(url: string, handlers: SocketHandlers): LiveSocket {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => handlers.onOpen());
    ws.addEventListener('message', (event: MessageEvent) => {
        if (typeof event.data === 'string') handlers.onMessage(event.data);
    });
    ws.addEventListener('error', () => handlers.onError());
    ws.addEventListener('close', () => handlers.onClose());
    return {
        send(data: string) { ws.send(data); },
        close() { ws.close(); },
    };
}

export const transport: {
    fetch: FetchLike;
    schedule: Schedule;
    openSocket: (url: string, handlers: SocketHandlers) => LiveSocket;
    now: () => number;
    random: () => number;
    pageHidden: () => boolean;
    onVisibility: (fn: (hidden: boolean) => void) => () => void;
} = {
    fetch,
    schedule: defaultSchedule,
    openSocket: defaultOpenSocket,
    now: () => Date.now(),
    random: () => Math.random(),
    pageHidden: defaultHidden,
    onVisibility: defaultOnVisibility,
};

export function resetTransport(): void {
    transport.fetch = fetch;
    transport.schedule = defaultSchedule;
    transport.openSocket = defaultOpenSocket;
    transport.now = () => Date.now();
    transport.random = () => Math.random();
    transport.pageHidden = defaultHidden;
    transport.onVisibility = defaultOnVisibility;
}

export type ApiResult = {
    status: number;
    ok: boolean;
    data: unknown;
    message: string;
};

function messageOf(payload: unknown, status: number): string {
    if (payload && typeof payload === 'object' && 'error' in payload) {
        const error = (payload as { error?: { message?: unknown } }).error;
        if (error && typeof error.message === 'string' && error.message) return error.message;
    }
    if (status === 0) return 'The network is not available.';
    if (status === 401) return '';
    return 'The server could not do that.';
}

/** One same-origin call. The envelope's data is unwrapped. A thrown fetch is status 0. */
export async function request(path: string, init?: RequestInit): Promise<ApiResult> {
    let res: Response;
    try {
        res = await apiFetch(transport.fetch, path, init);
    } catch {
        return { status: 0, ok: false, data: null, message: 'The network is not available.' };
    }
    let payload: unknown = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }
    const data = payload && typeof payload === 'object' && 'data' in payload
        ? (payload as { data: unknown }).data
        : null;
    return { status: res.status, ok: res.ok, data, message: messageOf(payload, res.status) };
}
