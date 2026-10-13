import { PROVIDER_ALREADY_LINKED } from './passkey_words.ts';

const ALREADY_LINKED = 'account_already_linked_to_different_user';

/**
 * Better Auth refuses a POST whose body is present and whose Content-Type is not JSON.
 * A body-less sign-out is that request on the Workers runtime. Give it an empty JSON body.
 */
export function signOutRequest(request: Request): Request {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/auth/sign-out') return request;
    const type = (request.headers.get('content-type') ?? '').toLowerCase();
    if (type.includes('application/json')) return request;
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    return new Request(request, { headers, body: '{}' });
}

/** The OAuth callback redirects with a code and no sentence. Add the sentence. */
export function linkRefusal(response: Response): Response {
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    let target: URL;
    try {
        target = new URL(location);
    } catch {
        return response;
    }
    if (target.searchParams.get('error') !== ALREADY_LINKED) return response;
    if (target.searchParams.get('error_description')) return response;
    target.searchParams.set('error_description', PROVIDER_ALREADY_LINKED);
    const headers = new Headers(response.headers);
    headers.set('location', target.toString());
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
