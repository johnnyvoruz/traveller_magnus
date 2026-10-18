/**
 * Drop every client `x-voyage-*` header, then set the ones this Worker owns.
 * `x-voyage-journal` is copied back from the client on purpose.
 */
export function headersForDoor(client: Headers, actorId: string, universeId: string): Headers {
    const headers = new Headers(client);
    const journal = headers.get('x-voyage-journal');
    for (const name of [...headers.keys()]) {
        if (name.toLowerCase().startsWith('x-voyage-')) headers.delete(name);
    }
    headers.set('x-voyage-user-id', actorId);
    headers.set('x-voyage-universe-id', universeId);
    if (journal !== null) headers.set('x-voyage-journal', journal);
    return headers;
}

export function privateNoStore(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
}
