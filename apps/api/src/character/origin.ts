/**
 * Public origin for a link the browser will open.
 * The host is read from the request, the same way better-auth reads a
 * sign-in return: a forwarded or original host, then the Host header, then
 * the request URL. Wrangler dev rewrites that URL to the production route,
 * so a loopback host on the way in is kept. Any other host is https.
 */

function hostnameOf(host: string): string {
    return host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopback(host: string): boolean {
    const name = hostnameOf(host);
    return name === 'localhost' || name.endsWith('.localhost') || name === '::1' || name.startsWith('127.');
}

function oneHost(value: string | null): string | null {
    if (!value) return null;
    const host = value.split(',')[0]?.trim() ?? '';
    if (!host || host.length > 255 || !/^[A-Za-z0-9.:[\]-]+$/.test(host)) return null;
    return host;
}

export function requestOrigin(request: Request): string {
    const forwarded = oneHost(request.headers.get('x-forwarded-host'));
    const original = oneHost(request.headers.get('mf-original-hostname'));
    const hostHeader = oneHost(request.headers.get('host'));
    let urlHost = '';
    try {
        urlHost = new URL(request.url).host;
    } catch {
        urlHost = '';
    }
    const local = [forwarded, original, hostHeader, urlHost].find((host) => !!host && isLoopback(host));
    const host = local || hostHeader || urlHost;
    return `${host && isLoopback(host) ? 'http' : 'https'}://${host}`;
}
