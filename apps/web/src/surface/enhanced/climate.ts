/**
 * The enhanced look's climate and sea, from the corrected fields when a body has them.
 * Absent fields, and a surface band whose status is unknown, leave today's profile.
 * Vanilla never calls this.
 */
import { surfaceProfile, type ProfileLook } from '../profile.ts';

type Body = Record<string, any>;

function statusOf(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const status = (value as { status?: unknown }).status;
    return typeof status === 'string' ? status : null;
}

/** The classifier's climate word, or null when the field is absent or not known. */
export function knownSurfaceWord(body: Body | null | undefined): string | null {
    if (!body) return null;
    const field = body.surfaceTempBand;
    if (statusOf(field) !== 'known') return null;
    const band = (field as { band?: unknown }).band;
    return typeof band === 'string' && band !== '' ? band : null;
}

/** How the enhanced sea treats liquidStatus. 'data' means the field is absent or known. */
export function liquidLook(body: Body | null | undefined): ProfileLook['sea'] {
    const status = body ? statusOf(body.liquidStatus) : null;
    if (status === 'none') return 'none';
    if (status === 'unresolved' || status === 'unknown') return 'unresolved';
    return 'data';
}

/**
 * The enhanced disc profile. With no corrected climate word and no liquid status
 * that changes the sea, this is surfaceProfile's own object.
 */
export function enhancedProfile(body: Body, id: string): Body {
    const band = knownSurfaceWord(body);
    const sea = liquidLook(body);
    if (!band && sea === 'data') return surfaceProfile(body, id);
    const look: ProfileLook = { band, sea };
    return surfaceProfile(body, id, look);
}

/**
 * World-map fields for an enhanced sheet. A known climate word replaces the
 * temperature string, and temperatureK is cleared so the palette's own Kelvin
 * ice test does not stand in for that word. Anything else is the same object
 * the vanilla sheet uses.
 */
export function enhancedWorldData<T extends { temperature: string; temperatureK: number }>(body: Body | null | undefined, data: T): T {
    const band = knownSurfaceWord(body);
    if (!band) return data;
    return { ...data, temperature: band, temperatureK: 0 };
}
