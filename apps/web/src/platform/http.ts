/** Same-origin API calls. fetch is injected so tests do not touch the network. */

type FetchLike = typeof fetch;

export function apiFetch(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return fetchImpl(url, { ...init, headers, credentials: 'same-origin' });
}
