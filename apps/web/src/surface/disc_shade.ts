/**
 * Turns one disc request into the shade pass's request.
 * legacyDiscId and the profile are derived here. The caller never builds either.
 * Stars, belts and rings have no shaded disc. scale is not a request field.
 */
import type { DiscRequest } from './contracts.ts';
import { productionDiscId } from './identity.ts';
import { surfaceKind, surfaceProfile } from './profile.ts';
import type { ShadeRequest } from './vanilla/gl_shade.ts';

const UNSHADED = new Set(['star', 'belt', 'ring']);

type Body = Record<string, any>;

export function discShadeRequest(timeSeconds: number, disc: DiscRequest): ShadeRequest | null {
    const kind = surfaceKind(disc.body);
    if (!kind || UNSHADED.has(kind)) return null;
    const body = disc.body as Body;
    const id = productionDiscId(disc.hexKey, body, kind);
    const profile = surfaceProfile(body, id) as ShadeRequest['profile'];
    const ring = disc.ring
        ? {
            inner: disc.ring.inner,
            outer: disc.ring.outer,
            fill: disc.ring.fill,
            phase: disc.ring.phase,
            detail: disc.ring.detail,
        }
        : null;
    const light: [number, number] = [disc.light[0], disc.light[1]];
    const sun: [number, number, number] = [disc.sun[0], disc.sun[1], disc.sun[2]];
    const request: ShadeRequest = {
        key: disc.key,
        profile,
        radius: disc.radiusPx,
        spin: disc.spin,
        cloudSpin: disc.cloudSpin,
        sweep: disc.sweep,
        samples: disc.samples,
        ring,
        tilt: disc.tiltDeg,
        light,
        sun,
        casters: disc.casters.map((row) => row.slice()),
        lightMode: disc.lightMode,
        uTime: timeSeconds,
    };
    if (disc.near !== undefined) request.near = disc.near;
    return request;
}
